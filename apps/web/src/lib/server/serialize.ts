import type { events, nodes, projects, tasks } from '#lib/server/db/schema.ts';
import type { Node, Project, ProjectConfig, Tag, Task, WorkstateEvent } from '#lib/types.ts';

export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type NodeRow = typeof nodes.$inferSelect;
export type EventRow = typeof events.$inferSelect;

const iso = (date: Date) => date.toISOString();

export function toProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		config: row.config as ProjectConfig,
		createdAt: iso(row.createdAt),
		lastWriteAt: iso(row.lastWriteAt)
	};
}

export function toTask(row: TaskRow): Task {
	return {
		id: row.id,
		projectId: row.projectId,
		title: row.title,
		summary: row.summary,
		state: row.state,
		note: row.note,
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
		stateSince: iso(row.stateSince),
		finishedAt: row.finishedAt ? iso(row.finishedAt) : null
	};
}

export function toNode(row: NodeRow): Node {
	return {
		taskId: row.taskId,
		path: row.path,
		parentPath: row.parentPath,
		key: row.key,
		depth: row.depth,
		title: row.title,
		state: row.state,
		note: row.note,
		tags: row.tags as Tag[],
		position: row.position,
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
		stateSince: iso(row.stateSince)
	};
}

export function toEvent(row: EventRow): WorkstateEvent {
	return {
		seq: Number(row.seq),
		type: row.type as WorkstateEvent['type'],
		taskId: row.taskId,
		path: row.path,
		payload: row.payload as WorkstateEvent['payload'],
		at: iso(row.at)
	};
}
