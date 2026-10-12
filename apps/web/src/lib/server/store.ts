import { and, asc, desc, eq, gt, inArray, isNull, max } from 'drizzle-orm';
import { ApiError } from '#lib/server/api.ts';
import { publish } from '#lib/server/bus.ts';
import { db } from '#lib/server/db/index.ts';
import { events, nodes, projects, tasks } from '#lib/server/db/schema.ts';
import {
	toEvent,
	toNode,
	toProject,
	toTask,
	type NodeRow,
	type ProjectRow,
	type TaskRow
} from '#lib/server/serialize.ts';
import type { NodeInput, StepInput, TaskInput, TaskPatch } from '#lib/server/validate.ts';
import type { Node, ProjectConfig, Snapshot, Task, WorkstateEvent } from '#lib/types.ts';

export type { ProjectRow, TaskRow, NodeRow };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getProjectRow(id: string): Promise<ProjectRow | undefined> {
	const [row] = await db.select().from(projects).where(eq(projects.id, id));
	return row;
}

export async function getTaskRow(id: string): Promise<TaskRow | undefined> {
	const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
	return row;
}

export async function lastWriteAt(projectId: string): Promise<Date | null> {
	const [row] = await db
		.select({ at: projects.lastWriteAt })
		.from(projects)
		.where(eq(projects.id, projectId));
	return row?.at ?? null;
}

export async function eventsSince(projectId: string, seq: number): Promise<WorkstateEvent[]> {
	const rows = await db
		.select()
		.from(events)
		.where(and(eq(events.projectId, projectId), gt(events.seq, seq)))
		.orderBy(asc(events.seq));
	return rows.map(toEvent);
}

export async function taskEvents(taskId: string, path?: string): Promise<WorkstateEvent[]> {
	const rows = await db
		.select()
		.from(events)
		.where(and(eq(events.taskId, taskId), path === undefined ? undefined : eq(events.path, path)))
		.orderBy(asc(events.seq));
	return rows.map(toEvent);
}

export async function snapshot(projectId: string): Promise<Snapshot | undefined> {
	// lastSeq is read before the rows so replaying from it can only repeat events, never skip one.
	const [seqRow] = await db
		.select({ seq: max(events.seq) })
		.from(events)
		.where(eq(events.projectId, projectId));
	const project = await getProjectRow(projectId);
	if (!project) return undefined;
	const taskRows = await db
		.select()
		.from(tasks)
		.where(eq(tasks.projectId, projectId))
		.orderBy(desc(tasks.createdAt), desc(tasks.id));
	const nodeRows = taskRows.length
		? await db
				.select()
				.from(nodes)
				.where(
					inArray(
						nodes.taskId,
						taskRows.map((task) => task.id)
					)
				)
				.orderBy(asc(nodes.taskId), asc(nodes.depth), asc(nodes.position), asc(nodes.path))
		: [];
	return {
		project: toProject(project),
		tasks: taskRows.map(toTask),
		nodes: nodeRows.map(toNode),
		lastSeq: Number(seqRow?.seq ?? 0)
	};
}

export async function getTaskWithNodes(
	taskId: string
): Promise<{ task: Task; nodes: Node[] } | undefined> {
	const row = await getTaskRow(taskId);
	if (!row) return undefined;
	const nodeRows = await db
		.select()
		.from(nodes)
		.where(eq(nodes.taskId, taskId))
		.orderBy(asc(nodes.depth), asc(nodes.position), asc(nodes.path));
	return { task: toTask(row), nodes: nodeRows.map(toNode) };
}

export async function insertProject(row: typeof projects.$inferInsert): Promise<void> {
	await db.insert(projects).values(row);
}

interface Ctx {
	tx: Tx;
	projectId: string;
	config: ProjectConfig;
	now: Date;
	emit(
		type: WorkstateEvent['type'],
		taskId: string | null,
		path: string | null,
		payload: WorkstateEvent['payload']
	): Promise<void>;
}

const chains = new Map<string, Promise<void>>();

// Serialises writes per project so events publish in seq order.
async function exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
	const run = (chains.get(key) ?? Promise.resolve()).then(work);
	const tail = run.then(
		() => undefined,
		() => undefined
	);
	chains.set(key, tail);
	try {
		return await run;
	} finally {
		if (chains.get(key) === tail) chains.delete(key);
	}
}

async function mutate<T>(projectId: string, work: (ctx: Ctx) => Promise<T>): Promise<T> {
	return exclusive(projectId, async () => {
		const stored: WorkstateEvent[] = [];
		const value = await db.transaction(async (tx) => {
			const [project] = await tx
				.select()
				.from(projects)
				.where(eq(projects.id, projectId))
				.for('update');
			if (!project) throw new ApiError(404, 'project not found');
			const now = new Date();
			const ctx: Ctx = {
				tx,
				projectId,
				config: project.config as ProjectConfig,
				now,
				async emit(type, taskId, path, payload) {
					const [result] = await tx
						.insert(events)
						.values({ projectId, taskId, path, type, payload, at: now });
					stored.push({
						seq: Number(result.insertId),
						type,
						taskId,
						path,
						payload,
						at: now.toISOString()
					});
				}
			};
			const result = await work(ctx);
			await tx.update(projects).set({ lastWriteAt: now }).where(eq(projects.id, projectId));
			return result;
		});
		for (const event of stored) publish(projectId, event);
		return value;
	});
}

function assertState(config: ProjectConfig, state: string): void {
	if (!config.states.some((def) => def.key === state)) {
		throw new ApiError(400, `unknown state "${state}"`, {
			validStates: config.states.map((def) => def.key)
		});
	}
}

function isFinal(config: ProjectConfig, state: string): boolean {
	const kind = config.states.find((def) => def.key === state)?.kind;
	return kind === 'done' || kind === 'failed';
}

export async function replaceConfig(projectId: string, config: ProjectConfig) {
	return mutate(projectId, async (ctx) => {
		await ctx.tx.update(projects).set({ config }).where(eq(projects.id, projectId));
		await ctx.emit('config', null, null, { config });
		return config;
	});
}

export async function patchConfig(
	projectId: string,
	apply: (
		current: ProjectConfig
	) => { ok: true; config: ProjectConfig } | { ok: false; error: string }
) {
	return mutate(projectId, async (ctx) => {
		const result = apply(ctx.config);
		if (!result.ok) throw new ApiError(400, result.error);
		await ctx.tx.update(projects).set({ config: result.config }).where(eq(projects.id, projectId));
		await ctx.emit('config', null, null, { config: result.config });
		return result.config;
	});
}

async function nextPosition(ctx: Ctx, taskId: string, parentPath: string | null): Promise<number> {
	const [row] = await ctx.tx
		.select({ top: max(nodes.position) })
		.from(nodes)
		.where(
			and(
				eq(nodes.taskId, taskId),
				parentPath === null ? isNull(nodes.parentPath) : eq(nodes.parentPath, parentPath)
			)
		);
	return row?.top === null || row?.top === undefined ? 0 : Number(row.top) + 1;
}

async function createNode(
	ctx: Ctx,
	taskId: string,
	segments: string[],
	input: NodeInput
): Promise<Node> {
	const path = segments.join('/');
	const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : null;
	const key = segments[segments.length - 1];
	const state = input.state ?? ctx.config.initialState;
	assertState(ctx.config, state);
	const row: NodeRow = {
		taskId,
		path,
		parentPath,
		key,
		depth: segments.length,
		title: input.title ?? key,
		state,
		note: input.note ?? '',
		tags: input.tags ?? [],
		position: input.position ?? (await nextPosition(ctx, taskId, parentPath)),
		createdAt: ctx.now,
		updatedAt: ctx.now,
		stateSince: ctx.now
	};
	await ctx.tx.insert(nodes).values(row);
	const node = toNode(row);
	await ctx.emit('node', taskId, path, node);
	return node;
}

async function updateNode(ctx: Ctx, old: NodeRow, input: NodeInput): Promise<Node> {
	if (input.state !== undefined) assertState(ctx.config, input.state);
	const stateChanged = input.state !== undefined && input.state !== old.state;
	const next = {
		title: input.title ?? old.title,
		state: input.state ?? old.state,
		note: input.note ?? (stateChanged ? '' : old.note),
		tags: input.tags ?? old.tags,
		position: input.position ?? old.position
	};
	const changed =
		next.title !== old.title ||
		next.state !== old.state ||
		next.note !== old.note ||
		next.position !== old.position ||
		JSON.stringify(next.tags) !== JSON.stringify(old.tags);
	if (!changed) return toNode(old);
	const row: NodeRow = {
		...old,
		...next,
		updatedAt: ctx.now,
		stateSince: stateChanged ? ctx.now : old.stateSince
	};
	await ctx.tx
		.update(nodes)
		.set({ ...next, updatedAt: row.updatedAt, stateSince: row.stateSince })
		.where(and(eq(nodes.taskId, old.taskId), eq(nodes.path, old.path)));
	const node = toNode(row);
	await ctx.emit('node', old.taskId, old.path, node);
	return node;
}

export async function upsertNode(
	projectId: string,
	taskId: string,
	segments: string[],
	input: NodeInput
): Promise<Node> {
	return mutate(projectId, async (ctx) => {
		if (!(await taskInProject(ctx, taskId))) throw new ApiError(404, 'task not found');
		for (let depth = 1; depth < segments.length; depth++) {
			const ancestor = segments.slice(0, depth);
			const [existing] = await ctx.tx
				.select()
				.from(nodes)
				.where(and(eq(nodes.taskId, taskId), eq(nodes.path, ancestor.join('/'))));
			if (!existing) await createNode(ctx, taskId, ancestor, {});
		}
		const [existing] = await ctx.tx
			.select()
			.from(nodes)
			.where(and(eq(nodes.taskId, taskId), eq(nodes.path, segments.join('/'))));
		return existing ? updateNode(ctx, existing, input) : createNode(ctx, taskId, segments, input);
	});
}

async function taskInProject(ctx: Ctx, taskId: string): Promise<TaskRow | undefined> {
	const [row] = await ctx.tx
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, taskId), eq(tasks.projectId, ctx.projectId)));
	return row;
}

export async function createTask(
	projectId: string,
	input: TaskInput
): Promise<{ task: Task; nodes: Node[] }> {
	return mutate(projectId, async (ctx) => {
		const state = input.state ?? ctx.config.initialState;
		assertState(ctx.config, state);
		const row: TaskRow = {
			id: crypto.randomUUID(),
			projectId,
			title: input.title,
			summary: input.summary ?? '',
			state,
			note: input.note ?? '',
			createdAt: ctx.now,
			updatedAt: ctx.now,
			stateSince: ctx.now,
			finishedAt: isFinal(ctx.config, state) ? ctx.now : null
		};
		await ctx.tx.insert(tasks).values(row);
		const task = toTask(row);
		await ctx.emit('task', row.id, null, task);
		const created: Node[] = [];
		for (const [index, step] of (input.steps ?? []).entries()) {
			created.push(await createNode(ctx, row.id, [step.key], stepInput(step, index)));
		}
		return { task, nodes: created };
	});
}

function stepInput(step: StepInput, index: number): NodeInput {
	return {
		title: step.title,
		state: step.state,
		note: step.note,
		tags: step.tags,
		position: index
	};
}

export async function patchTask(
	projectId: string,
	taskId: string,
	patch: TaskPatch
): Promise<Task> {
	return mutate(projectId, async (ctx) => {
		const old = await taskInProject(ctx, taskId);
		if (!old) throw new ApiError(404, 'task not found');
		if (patch.state !== undefined) assertState(ctx.config, patch.state);
		const stateChanged = patch.state !== undefined && patch.state !== old.state;
		const next = {
			title: patch.title ?? old.title,
			summary: patch.summary ?? old.summary,
			state: patch.state ?? old.state,
			note: patch.note ?? (stateChanged ? '' : old.note)
		};
		const changed =
			next.title !== old.title ||
			next.summary !== old.summary ||
			next.state !== old.state ||
			next.note !== old.note;
		if (!changed) return toTask(old);
		const row: TaskRow = {
			...old,
			...next,
			updatedAt: ctx.now,
			stateSince: stateChanged ? ctx.now : old.stateSince,
			finishedAt: stateChanged ? (isFinal(ctx.config, next.state) ? ctx.now : null) : old.finishedAt
		};
		await ctx.tx
			.update(tasks)
			.set({
				...next,
				updatedAt: row.updatedAt,
				stateSince: row.stateSince,
				finishedAt: row.finishedAt
			})
			.where(eq(tasks.id, taskId));
		const task = toTask(row);
		await ctx.emit('task', taskId, null, task);
		return task;
	});
}
