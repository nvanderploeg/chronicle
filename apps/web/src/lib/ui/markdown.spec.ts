import { describe, expect, it } from 'vitest';
import type { Node, Notice, ProjectConfig, Task } from '../types.ts';
import { taskMarkdown } from './markdown.ts';

const CONFIG: ProjectConfig = {
	theme: 'system',
	initialState: 'queued',
	states: [
		{ key: 'queued', label: 'Queued', color: '#999', kind: 'pending' },
		{ key: 'in_work', label: 'In work', color: '#00f', kind: 'active' },
		{ key: 'done', label: 'Done', color: '#0f0', kind: 'done' }
	]
};

const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

const task = {
	id: 't',
	title: 'Add limits',
	summary: 'Rate limiting',
	state: 'in_work',
	note: 'tests next',
	agent: { tool: 'claude-code', tokens: 2000 },
	links: [{ url: 'https://github.com/me/r/issues/7', label: '#7' }],
	prs: [{ url: 'https://github.com/me/r/pull/9', title: 'Limits' }],
	createdAt: iso(T0),
	finishedAt: null
} as Task;

const node = (path: string, state: string, position: number, note = '') =>
	({
		taskId: 't',
		path,
		parentPath: path.includes('/') ? path.split('/').slice(0, -1).join('/') : null,
		title: path,
		state,
		note,
		position,
		depth: path.split('/').length,
		agent: null
	}) as Node;

describe('taskMarkdown', () => {
	it('renders facts, nested steps, notices and links', () => {
		const nodes = [node('a', 'done', 0), node('b', 'in_work', 1, 'wip'), node('b/x', 'queued', 0)];
		const notices = [
			{ taskId: 't', kind: 'caveat', path: 'b', text: 'Skipped e2e' },
			{ taskId: 'other', kind: 'assumption', path: null, text: 'nope' }
		] as Notice[];
		expect(taskMarkdown(task, nodes, notices, CONFIG, T0 + 12 * 60_000)).toBe(`## Add limits

In work · 1/2 steps · 12m · claude-code · 2k tokens

Rate limiting

> tests next

### Steps
- a (Done)
- b (In work): wip
  - b/x (Queued)

### Notices
- **caveat** (b): Skipped e2e

### Links
- [#7](https://github.com/me/r/issues/7)
- [Limits](https://github.com/me/r/pull/9)
`);
	});

	it('omits sections that have nothing in them', () => {
		const bare = { ...task, summary: '', note: '', agent: null, links: [], prs: [] } as Task;
		expect(taskMarkdown(bare, [], [], CONFIG, T0)).toBe('## Add limits\n\nIn work · 0s\n');
	});

	it('keeps multi-line text and awkward links inside their list items', () => {
		const messy = {
			...task,
			note: 'one\ntwo',
			links: [{ url: 'https://x.test/a_(b)', label: 'a [b]' }],
			prs: []
		} as Task;
		const nodes = [node('a', 'in_work', 0, 'wip\nmore')];
		const notices = [{ taskId: 't', kind: 'caveat', path: null, text: 'x\ny' }] as Notice[];
		const md = taskMarkdown(messy, nodes, notices, CONFIG, T0);
		expect(md).toContain('> one two\n');
		expect(md).toContain('- a (In work): wip more\n');
		expect(md).toContain('- **caveat**: x y\n');
		expect(md).toContain('- [a \\[b\\]](https://x.test/a_%28b%29)\n');
	});
});
