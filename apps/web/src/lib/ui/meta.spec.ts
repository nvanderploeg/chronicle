import { describe, expect, it } from 'vitest';
import type { Node, ProjectConfig, Task } from '../types.ts';
import {
	agentParts,
	eyeColor,
	formatTokens,
	linkView,
	prView,
	tokensByModel,
	totalTokens
} from './meta.ts';

const CONFIG: ProjectConfig = {
	theme: 'system',
	initialState: 'queued',
	states: [
		{ key: 'queued', label: 'Q', color: '#999', kind: 'pending' },
		{ key: 'in_work', label: 'W', color: '#00f', kind: 'active' },
		{ key: 'review', label: 'R', color: '#7dd3fc', kind: 'review' },
		{ key: 'needs_input', label: 'N', color: '#fa0', kind: 'blocked' },
		{ key: 'done', label: 'D', color: '#0f0', kind: 'done' }
	]
};

const task = (state: string, tokens?: number) =>
	({ state, agent: tokens === undefined ? null : { tokens } }) as Task;
const node = (tokens?: number) => ({ agent: tokens === undefined ? null : { tokens } }) as Node;

describe('formatTokens', () => {
	it.each([
		[0, '0'],
		[999, '999'],
		[1000, '1k'],
		[1250, '1.3k'],
		[123_456, '123k'],
		[1_200_000, '1.2M']
	])('formats %d as %s', (n, text) => {
		expect(formatTokens(n)).toBe(text);
	});
});

describe('totalTokens', () => {
	it('adds the task and every node that reported tokens', () => {
		expect(totalTokens(task('done', 100), [node(20), node(), node(3)])).toBe(123);
	});

	it('is 0 when nobody reported', () => {
		expect(totalTokens(task('done'), [node()])).toBe(0);
	});
});

describe('agentParts', () => {
	it('lists tool, model and effort that are present, in that order', () => {
		expect(agentParts({ effort: 'high', tool: 'codex', tokens: 5 })).toEqual(['codex', 'high']);
		expect(agentParts(null)).toEqual([]);
	});
});

describe('linkView', () => {
	it('names a GitHub PR or issue as repo#number', () => {
		expect(linkView({ url: 'https://github.com/me/chronicle/pull/12' })).toMatchObject({
			site: 'GitHub',
			text: 'chronicle#12'
		});
	});

	it('names known trackers by site and keeps a given label', () => {
		expect(linkView({ url: 'https://trello.com/c/abc/1-card' }).text).toBe('Trello');
		expect(linkView({ url: 'https://acme.atlassian.net/browse/X-1', label: 'X-1' })).toMatchObject({
			site: 'Jira',
			text: 'X-1'
		});
	});

	it('falls back to the host name', () => {
		expect(linkView({ url: 'https://www.example.com/a' }).text).toBe('example.com');
	});
});

describe('eyeColor', () => {
	it('picks the most urgent kind among the tasks', () => {
		expect(eyeColor([task('done'), task('in_work'), task('needs_input')], CONFIG)).toBe('#fa0');
		expect(eyeColor([task('done'), task('in_work')], CONFIG)).toBe('#00f');
		expect(eyeColor([task('done'), task('review')], CONFIG)).toBe('#7dd3fc');
		expect(eyeColor([task('review'), task('in_work')], CONFIG)).toBe('#00f');
		expect(eyeColor([task('done')], CONFIG)).toBe('#0f0');
	});

	it('is null with no tasks', () => {
		expect(eyeColor([], CONFIG)).toBeNull();
	});
});

describe('prView', () => {
	it('names a GitHub pull as PR #n and keeps its status', () => {
		expect(
			prView({ url: 'https://github.com/o/r/pull/42', state: 'open', checks: 'passing' })
		).toMatchObject({ kind: 'PR', ref: '#42', state: 'open', checks: 'passing', review: null });
	});

	it('names a GitLab merge request as MR !n', () => {
		expect(prView({ url: 'https://gitlab.com/g/p/-/merge_requests/7', number: 7 })).toMatchObject({
			kind: 'MR',
			ref: '!7'
		});
	});
});

describe('tokensByModel', () => {
	const withModel = (id: string, model: string | undefined, tokens: number) =>
		({ id, taskId: id, agent: { model, tokens } }) as Task & Node;

	it('sums tasks and their nodes per model, largest first', () => {
		const tasks = [withModel('t1', 'opus', 100), withModel('t2', 'sonnet', 30)];
		const nodes = [withModel('t1', 'sonnet', 50), withModel('t1', undefined, 5)];
		expect(tokensByModel(tasks, nodes)).toEqual([
			{ model: 'opus', tokens: 100 },
			{ model: 'sonnet', tokens: 80 },
			{ model: 'unknown', tokens: 5 }
		]);
	});

	it('ignores nodes of tasks not listed and agents without tokens', () => {
		expect(tokensByModel([withModel('t1', 'opus', 0)], [withModel('gone', 'opus', 9)])).toEqual([]);
	});
});
