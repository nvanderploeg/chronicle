import { sql } from 'drizzle-orm';
import {
	char,
	index,
	int,
	json,
	mysqlTable,
	primaryKey,
	serial,
	text,
	timestamp,
	varchar
} from 'drizzle-orm/mysql-core';

const now = (name: string) =>
	timestamp(name, { fsp: 3 })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP(3)`);

export const projects = mysqlTable('projects', {
	id: varchar('id', { length: 36 }).primaryKey(),
	name: varchar('name', { length: 255 }).notNull(),
	writeKeyHash: char('write_key_hash', { length: 64 }).notNull(),
	config: json('config').notNull(),
	createdAt: now('created_at'),
	lastWriteAt: now('last_write_at')
});

export const tasks = mysqlTable(
	'tasks',
	{
		id: varchar('id', { length: 36 }).primaryKey(),
		projectId: varchar('project_id', { length: 36 })
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		summary: text('summary').notNull(),
		state: varchar('state', { length: 32 }).notNull(),
		note: text('note').notNull(),
		createdAt: now('created_at'),
		updatedAt: now('updated_at'),
		stateSince: now('state_since'),
		finishedAt: timestamp('finished_at', { fsp: 3 })
	},
	(table) => [index('tasks_project_created_idx').on(table.projectId, table.createdAt)]
);

// Path columns are `CHARACTER SET ascii COLLATE ascii_bin` in drizzle/0000_init.sql: drizzle cannot
// express it, and paths are case-sensitive.
export const nodes = mysqlTable(
	'nodes',
	{
		taskId: varchar('task_id', { length: 36 })
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		path: varchar('path', { length: 512 }).notNull(),
		parentPath: varchar('parent_path', { length: 512 }),
		key: varchar('key', { length: 64 }).notNull(),
		depth: int('depth').notNull(),
		title: text('title').notNull(),
		state: varchar('state', { length: 32 }).notNull(),
		note: text('note').notNull(),
		tags: json('tags').notNull(),
		position: int('position').notNull(),
		createdAt: now('created_at'),
		updatedAt: now('updated_at'),
		stateSince: now('state_since')
	},
	(table) => [primaryKey({ columns: [table.taskId, table.path] })]
);

export const events = mysqlTable(
	'events',
	{
		seq: serial('seq').primaryKey(),
		projectId: varchar('project_id', { length: 36 })
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		taskId: varchar('task_id', { length: 36 }),
		path: varchar('path', { length: 512 }),
		type: varchar('type', { length: 16 }).notNull(),
		payload: json('payload').notNull(),
		at: now('at')
	},
	(table) => [
		index('events_project_seq_idx').on(table.projectId, table.seq),
		index('events_task_path_seq_idx').on(table.taskId, table.path, table.seq)
	]
);
