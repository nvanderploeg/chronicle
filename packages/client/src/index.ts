import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CANDIDATES, createDiscovery } from './discovery.ts';
import { createStore, own, type ProjectEntry } from './files.ts';
import { UNREACHABLE_WARNING, compact, request, type Failure, type RequestInit } from './http.ts';
import { repoIdentity } from './repo.ts';
import type {
	ClientOptions,
	DoctorReport,
	Node,
	ProjectConfig,
	Result,
	Task,
	WorkstateClient
} from './types.ts';

export type * from './types.ts';
export { DEFAULT_CANDIDATES, UNREACHABLE_WARNING, repoIdentity };

const NO_PROJECT_WARNING = 'no workstate project for this repo yet — start a task first';

const unknownTask = (taskId: string): Failure => ({
	ok: false,
	warning: `unknown task ${taskId} on this machine — continuing untracked`
});

const unreachable: Failure = { ok: false, warning: UNREACHABLE_WARNING };

interface Target {
	server: string;
	projectId: string;
	key: string | undefined;
}

const taskPath = (taskId: string) => `/api/tasks/${encodeURIComponent(taskId)}`;

async function guard<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
	try {
		const result = await run();
		return result.ok ? result : { ok: false, warning: result.warning };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, warning: `workstate failed: ${message}` };
	}
}

export function createClient(options: ClientOptions = {}): WorkstateClient {
	const env = options.env ?? process.env;
	const fetchFn = options.fetch ?? globalThis.fetch;
	const requestTimeoutMs = options.requestTimeoutMs ?? 2000;
	const configDir =
		options.configDir ?? join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'workstate');
	const store = createStore(configDir);
	const discovery = createDiscovery({
		fetch: fetchFn,
		env,
		candidates: options.candidates ?? DEFAULT_CANDIDATES,
		probeTimeoutMs: options.probeTimeoutMs ?? 300
	});

	const send = <T>(server: string, path: string, init: RequestInit) =>
		request<T>(fetchFn, requestTimeoutMs, `${server}${path}`, init);

	async function createProject(
		server: string,
		repoKey: string,
		name: string
	): Promise<{ ok: true; entry: ProjectEntry } | Failure> {
		const reply = await send<{ id: string; writeKey: string }>(server, '/api/projects', {
			method: 'POST',
			body: { name }
		});
		if (!reply.ok) return reply;
		return { ok: true, entry: { projectId: reply.body.id, writeKey: reply.body.writeKey, name } };
	}

	async function targetFromTask(taskId: string): Promise<Result<Target>> {
		const handle = own(await store.readTasks(), taskId);
		if (!handle) return unknownTask(taskId);
		const forServer = own(await store.readProjects(), handle.server) ?? {};
		const entry = Object.values(forServer).find((e) => e?.projectId === handle.projectId);
		return {
			ok: true,
			value: { server: handle.server, projectId: handle.projectId, key: entry?.writeKey }
		};
	}

	async function targetFromRepo(cwd: string | undefined): Promise<Result<Target>> {
		const server = await discovery.discover();
		if (!server) return unreachable;
		const { repoKey } = await repoIdentity(cwd ?? process.cwd());
		const entry = own(own(await store.readProjects(), server), repoKey);
		if (!entry) return { ok: false, warning: NO_PROJECT_WARNING };
		return { ok: true, value: { server, projectId: entry.projectId, key: entry.writeKey } };
	}

	const targetFor = (input: { taskId?: string; cwd?: string }) =>
		input.taskId === undefined ? targetFromRepo(input.cwd) : targetFromTask(input.taskId);

	async function writeTarget(taskId: string): Promise<Result<Target & { key: string }>> {
		const target = await targetFromTask(taskId);
		if (!target.ok) return target;
		if (!target.value.key) return unknownTask(taskId);
		return { ok: true, value: { ...target.value, key: target.value.key } };
	}

	return {
		discover: () => discovery.discover().catch(() => null),

		startTask: (input) =>
			guard(async () => {
				const server = await discovery.discover();
				if (!server) return unreachable;
				const { repoKey, name } = await repoIdentity(input.cwd ?? process.cwd());

				const resolved = await store.resolveProject(server, repoKey, () =>
					createProject(server, repoKey, name)
				);
				if (!resolved.ok) return resolved;
				let entry = resolved.entry;
				let createdProject = resolved.created;

				const body = compact({
					title: input.title,
					summary: input.summary,
					state: input.state,
					note: input.note,
					steps: input.steps
				});
				const post = (e: ProjectEntry) =>
					send<{ taskId: string; url: string }>(
						server,
						`/api/projects/${encodeURIComponent(e.projectId)}/tasks`,
						{ method: 'POST', key: e.writeKey, body }
					);

				let reply = await post(entry);
				if (!reply.ok && !createdProject && [401, 403, 404].includes(reply.status ?? 0)) {
					const replaced = await store.resolveProject(
						server,
						repoKey,
						() => createProject(server, repoKey, name),
						entry
					);
					if (!replaced.ok) return replaced;
					entry = replaced.entry;
					createdProject = replaced.created;
					reply = await post(entry);
				}
				if (!reply.ok) return reply;

				const { taskId, url } = reply.body;
				await store.saveTask(taskId, { server, projectId: entry.projectId }).catch(() => {});
				return {
					ok: true,
					value: {
						taskId,
						url,
						server,
						projectId: entry.projectId,
						projectUrl: `${server}/p/${entry.projectId}`,
						createdProject
					}
				};
			}),

		updateStep: (input) =>
			guard(async () => {
				const target = await writeTarget(input.taskId);
				if (!target.ok) return target;
				const { server, key } = target.value;
				const path = input.path.split('/').map(encodeURIComponent).join('/');
				const reply = await send<{ node: Node }>(
					server,
					`${taskPath(input.taskId)}/nodes/${path}`,
					{
						method: 'PUT',
						key,
						body: compact({
							title: input.title,
							state: input.state,
							note: input.note,
							tags: input.tags,
							position: input.position
						})
					}
				);
				return reply.ok ? { ok: true, value: { node: reply.body.node } } : reply;
			}),

		updateTask: (input) =>
			guard(async () => {
				const target = await writeTarget(input.taskId);
				if (!target.ok) return target;
				const { server, key } = target.value;
				const reply = await send<{ task: Task }>(server, taskPath(input.taskId), {
					method: 'PATCH',
					key,
					body: compact({
						title: input.title,
						summary: input.summary,
						state: input.state,
						note: input.note
					})
				});
				return reply.ok ? { ok: true, value: { task: reply.body.task } } : reply;
			}),

		getTask: (input) =>
			guard(async () => {
				const target = await targetFromTask(input.taskId);
				if (!target.ok) return target;
				const { server, projectId } = target.value;
				const reply = await send<{ task: Task; nodes: Node[] }>(server, taskPath(input.taskId), {
					method: 'GET'
				});
				if (!reply.ok) return reply;
				return {
					ok: true,
					value: {
						task: reply.body.task,
						nodes: reply.body.nodes,
						url: `${server}/p/${projectId}/t/${input.taskId}`
					}
				};
			}),

		configure: (input) =>
			guard(async () => {
				const target = await targetFor(input);
				if (!target.ok) return target;
				const { server, projectId, key } = target.value;
				const base = `/api/projects/${encodeURIComponent(projectId)}`;
				const projectUrl = `${server}/p/${projectId}`;

				const writing = input.config ?? input.patch;
				if (writing && !key) {
					return input.taskId === undefined
						? { ok: false, warning: NO_PROJECT_WARNING }
						: unknownTask(input.taskId);
				}

				if (input.config) {
					const reply = await send<{ config: ProjectConfig }>(server, `${base}/config`, {
						method: 'PUT',
						key,
						body: input.config
					});
					return reply.ok ? { ok: true, value: { config: reply.body.config, projectUrl } } : reply;
				}
				if (input.patch) {
					const reply = await send<{ config: ProjectConfig }>(server, `${base}/config`, {
						method: 'PATCH',
						key,
						body: input.patch
					});
					return reply.ok ? { ok: true, value: { config: reply.body.config, projectUrl } } : reply;
				}
				const reply = await send<{ project: { config: ProjectConfig } }>(server, base, {
					method: 'GET'
				});
				return reply.ok
					? { ok: true, value: { config: reply.body.project.config, projectUrl } }
					: reply;
			}),

		projectUrl: (input) =>
			guard(async () => {
				const target = await targetFor(input);
				if (!target.ok) return target;
				const { server, projectId } = target.value;
				const url = `${server}/p/${projectId}`;
				return { ok: true, value: { url: input.taskId ? `${url}/t/${input.taskId}` : url } };
			}),

		async doctor(input = {}): Promise<DoctorReport> {
			const { repoKey } = await repoIdentity(input.cwd ?? process.cwd());
			const probes = await discovery.probeAll();
			const server = probes.find((p) => p.ok)?.server ?? null;
			const entry = server ? own(own(await store.readProjects(), server), repoKey) : undefined;
			return {
				configDir,
				pinned: discovery.pinned,
				probes,
				server,
				repoKey,
				registered: entry ? { projectId: entry.projectId, name: entry.name } : null
			};
		}
	};
}
