import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db/index.ts';
import { projects } from './db/schema.ts';
import { PRESETS } from './presets.ts';
import { resetDb } from './test/db.ts';
import type { ProjectConfig } from '#lib/types.ts';

const REVIEW_SQL = readFileSync(resolve('drizzle/0003_review_state.sql'), 'utf8');

const stockWithoutReview = (): ProjectConfig => {
	const config = structuredClone(PRESETS['build-it']);
	config.states = config.states.filter((s) => s.key !== 'review');
	return config;
};

async function seed(id: string, config: ProjectConfig): Promise<void> {
	await db.insert(projects).values({ id, name: id, writeKeyHash: 'x'.repeat(64), config });
}

async function keysOf(id: string): Promise<string[]> {
	const [row] = await db.select().from(projects).where(eq(projects.id, id));
	return (row.config as ProjectConfig).states.map((s) => s.key);
}

describe('0003_review_state', () => {
	beforeEach(resetDb);

	it('adds review after testing to a project on the stock states, once', async () => {
		await seed('stock', stockWithoutReview());

		await db.execute(sql.raw(REVIEW_SQL));
		await db.execute(sql.raw(REVIEW_SQL));

		expect(await keysOf('stock')).toEqual(PRESETS['build-it'].states.map((s) => s.key));
	});

	it('leaves a custom config alone', async () => {
		const custom: ProjectConfig = {
			theme: 'system',
			initialState: 'todo',
			states: [{ key: 'todo', label: 'To do', color: '#111111', kind: 'pending' }]
		};
		await seed('custom', custom);

		await db.execute(sql.raw(REVIEW_SQL));

		expect(await keysOf('custom')).toEqual(['todo']);
	});
});
