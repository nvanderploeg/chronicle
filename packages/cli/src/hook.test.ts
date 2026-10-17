import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleHook, QUIET_EVERY, type HookInput } from './hook.ts';

const TASK = '8e609f7e-85c4-4dfd-916b-a84bb7efde63';
const URL = `https://chronicle.example/p/proj/t/${TASK}`;
const START_RESPONSE = [
	{ type: 'text', text: JSON.stringify({ taskId: TASK, url: URL, server: 'x', projectId: 'proj' }) }
];

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function session(id = 'sess-1') {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-hook-'));
	dirs.push(dir);
	const send = (input: HookInput) => {
		const out = handleHook(JSON.stringify({ session_id: id, ...input }), dir);
		return out ? JSON.parse(out) : null;
	};
	const context = (input: HookInput): string | undefined =>
		send(input)?.hookSpecificOutput?.additionalContext;
	return { dir, send, context };
}

const post = (tool_name: string, extra: Partial<HookInput> = {}): HookInput => ({
	hook_event_name: 'PostToolUse',
	tool_name,
	tool_input: {},
	...extra
});

const loadSkill = post('Skill', { tool_input: { skill: 'chronicle' } });
const startTask = post('mcp__chronicle__start_task', { tool_response: START_RESPONSE });
const prompt: HookInput = { hook_event_name: 'UserPromptSubmit' };

describe('sessions that never load chronicle', () => {
	it('stay silent on every event and write no state', () => {
		const { dir, context } = session();

		expect(context(prompt)).toBeUndefined();
		expect(context(post('Bash'))).toBeUndefined();
		expect(context({ hook_event_name: 'SessionStart', source: 'compact' })).toBeUndefined();
		expect(fs.readdirSync(dir)).toEqual([]);
	});

	it('ignore a ToolSearch for some other tool', () => {
		const { context } = session();
		context(post('ToolSearch', { tool_input: { query: 'select:WebFetch' } }));

		expect(context(post('Bash'))).toBeUndefined();
	});
});

describe('loaded chronicle but no task yet', () => {
	it.each([
		['the chronicle skill', loadSkill],
		[
			'a plugin-scoped chronicle skill',
			post('Skill', { tool_input: { skill: 'chronicle:chronicle' } })
		],
		[
			'a ToolSearch for chronicle',
			post('ToolSearch', { tool_input: { query: 'select:mcp__chronicle__start_task' } })
		]
	])('nudges on the next work call after %s', (_label, load) => {
		const { context } = session();
		context(load);

		expect(context(post('Read'))).toMatch(/no task started.*start_task/);
	});

	it('nudges on each of the first three calls, then every fifth', () => {
		const { context } = session();
		context(loadSkill);

		const nudged = Array.from({ length: 10 }, () => context(post('Bash')) !== undefined);

		expect(nudged).toEqual([true, true, true, false, true, false, false, false, false, true]);
	});

	it('reminds on the next user prompt and after compaction', () => {
		const { context } = session();
		context(loadSkill);

		expect(context(prompt)).toMatch(/no task started/);
		expect(context({ hook_event_name: 'SessionStart', source: 'compact' })).toMatch(
			/no task started/
		);
	});

	it('goes quiet once start_task warns the server is unreachable', () => {
		const { context } = session();
		context(loadSkill);
		context(
			post('mcp__chronicle__start_task', {
				tool_response: [
					{ type: 'text', text: 'chronicle: chronicle unreachable — continuing untracked' }
				]
			})
		);

		expect(context(post('Bash'))).toBeUndefined();
		expect(context(prompt)).toBeUndefined();
	});

	it('does not nudge inside a subagent', () => {
		const { context } = session();
		context(loadSkill);

		expect(context(post('Read', { agent_id: 'sub-1' }))).toBeUndefined();
	});
});

describe('an open task', () => {
	it('is named with its url on every user prompt', () => {
		const { context } = session();
		context(startTask);

		expect(context(prompt)).toContain(TASK);
		expect(context(prompt)).toContain(URL);
	});

	it('reads the task id from a response serialised as a JSON string', () => {
		const { context } = session();
		context(post('mcp__chronicle__start_task', { tool_response: JSON.stringify(START_RESPONSE) }));

		expect(context(prompt)).toContain(TASK);
	});

	it(`is flagged after ${QUIET_EVERY} tool calls without a chronicle write`, () => {
		const { context } = session();
		context(startTask);

		const outputs = Array.from({ length: QUIET_EVERY }, () => context(post('Edit')));

		expect(outputs.slice(0, -1).every((o) => o === undefined)).toBe(true);
		expect(outputs.at(-1)).toMatch(new RegExp(`${TASK}.*no update in ${QUIET_EVERY}`));
	});

	it('restarts the quiet count on any chronicle write, including from a subagent', () => {
		const { context } = session();
		context(startTask);
		for (let i = 0; i < QUIET_EVERY - 1; i++) context(post('Edit'));
		context(post('mcp__chronicle__update_step', { agent_id: 'sub-1' }));

		expect(context(post('Edit'))).toBeUndefined();
	});

	it('does not count subagent tool calls as silence', () => {
		const { context } = session();
		context(startTask);
		for (let i = 0; i < QUIET_EVERY - 1; i++) context(post('Read', { agent_id: 'sub-1' }));

		expect(context(post('Edit'))).toBeUndefined();
	});

	it('is handed back with get_task after compaction or resume', () => {
		const { context } = session();
		context(startTask);

		expect(context({ hook_event_name: 'SessionStart', source: 'compact' })).toMatch(
			new RegExp(`${TASK}.*get_task`)
		);
		expect(context({ hook_event_name: 'SessionStart', source: 'resume' })).toContain(TASK);
		expect(context({ hook_event_name: 'SessionStart', source: 'startup' })).toBeUndefined();
	});

	it.each(['done', 'failed', 'needs_input', 'review'])(
		'goes quiet once update_task sets %s',
		(state) => {
			const { context } = session();
			context(startTask);
			context(post('mcp__chronicle__update_task', { tool_input: { taskId: TASK, state } }));

			expect(context(prompt)).toBeUndefined();
			for (let i = 0; i < QUIET_EVERY; i++) expect(context(post('Edit'))).toBeUndefined();
		}
	);

	it('speaks up again when update_task reopens it', () => {
		const { context } = session();
		context(startTask);
		context(
			post('mcp__chronicle__update_task', { tool_input: { taskId: TASK, state: 'needs_input' } })
		);
		context(
			post('mcp__chronicle__update_task', { tool_input: { taskId: TASK, state: 'in_work' } })
		);

		expect(context(prompt)).toContain(TASK);
	});

	it('is tracked per session', () => {
		const a = session('a');
		a.context(startTask);
		const b = {
			context: (i: HookInput) => {
				const out = handleHook(JSON.stringify({ session_id: 'b', ...i }), a.dir);
				return out ? JSON.parse(out).hookSpecificOutput?.additionalContext : undefined;
			}
		};

		expect(b.context(prompt)).toBeUndefined();
	});
});

describe('subagent briefs', () => {
	const agent = (prompt: string): HookInput => ({
		hook_event_name: 'PreToolUse',
		tool_name: 'Agent',
		tool_input: { prompt, description: 'x' }
	});

	it('rejects a brief that does not carry the open task id, naming it', () => {
		const { send } = session();
		send(startTask);

		const out = send(agent('Go research the parser'));

		expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
		expect(out.hookSpecificOutput.permissionDecisionReason).toContain(`chronicle: task ${TASK}`);
	});

	it('lets the same brief through on a second launch', () => {
		const { send } = session();
		send(startTask);
		send(agent('Go research the parser'));

		expect(send(agent('Go research the parser'))).toBeNull();
	});

	it('passes a brief that carries the task id', () => {
		const { send } = session();
		send(startTask);

		expect(send(agent(`Research. chronicle: task ${TASK}, node research`))).toBeNull();
	});

	it('passes every brief when no task is open', () => {
		const { send } = session();
		send(loadSkill);

		expect(send(agent('Go research'))).toBeNull();
	});
});

describe('robustness', () => {
	it.each([['not json'], [''], [JSON.stringify({ hook_event_name: 'UserPromptSubmit' })]])(
		'returns nothing for unusable input %j',
		(raw) => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-hook-'));
			dirs.push(dir);

			expect(handleHook(raw, dir)).toBe('');
		}
	);

	it('treats a corrupt state file as a fresh session', () => {
		const { dir, context } = session('sess-x');
		fs.writeFileSync(path.join(dir, 'sess-x.json'), '{oops');

		expect(context(prompt)).toBeUndefined();
		context(startTask);
		expect(context(prompt)).toContain(TASK);
	});

	it('prunes session files older than two weeks on session start', () => {
		const { dir, send } = session('new');
		const old = path.join(dir, 'old.json');
		fs.writeFileSync(old, '{}');
		const past = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
		fs.utimesSync(old, past, past);

		send({ hook_event_name: 'SessionStart', source: 'startup' });

		expect(fs.existsSync(old)).toBe(false);
	});
});
