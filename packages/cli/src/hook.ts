import {
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export interface HookInput {
	session_id?: string;
	hook_event_name?: string;
	source?: string;
	tool_name?: string;
	tool_input?: Record<string, unknown>;
	tool_response?: unknown;
	agent_id?: string;
}

export interface SessionState {
	armed: boolean;
	untracked: boolean;
	taskId?: string;
	url?: string;
	finished: boolean;
	quiet: number;
	waiting: number;
	rejected?: string;
}

export const QUIET_EVERY = 12;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Keep in step with the finished kinds (done, failed, blocked, review) of the default preset.
const FINISHED_STATES = new Set(['done', 'failed', 'needs_input', 'review']);

const fresh = (): SessionState => ({
	armed: false,
	untracked: false,
	finished: false,
	quiet: 0,
	waiting: 0
});

const noTask = () =>
	'chronicle: loaded, but no task started. Call start_task with your plan now, before any more work, then print its url to the user as a link.';

const openTask = (s: SessionState) =>
	`chronicle: task ${s.taskId} is open (${s.url}). Update its steps as this work moves, and finish it with update_task.`;

const quietTask = (s: SessionState) =>
	`chronicle: task ${s.taskId} has had no update in ${s.quiet} tool calls. If a step changed state, call update_step; if the work is finished, call update_task.`;

const resumed = (s: SessionState) =>
	`chronicle: this session tracks task ${s.taskId} (${s.url}). Call get_task before writing to it again.`;

const briefLine = (s: SessionState) =>
	`chronicle: task ${s.taskId} is open and this brief does not carry it. Add "chronicle: task ${s.taskId}" and the node path the subagent reports under, then launch again; an unchanged brief goes through untracked.`;

const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

const isChronicle = (tool: string) => tool.startsWith('mcp__chronicle__');

function loadsChronicle(input: HookInput): boolean {
	const ti = input.tool_input ?? {};
	if (input.tool_name === 'Skill')
		return String(ti.skill ?? '').replace(/^.*:/, '') === 'chronicle';
	if (input.tool_name === 'ToolSearch') return /chronicle/i.test(String(ti.query ?? ''));
	return false;
}

function responseText(response: unknown): string {
	if (typeof response === 'string') return response;
	if (Array.isArray(response)) return response.map(responseText).join('\n');
	if (response && typeof response === 'object') {
		const text = (response as { text?: unknown }).text;
		if (typeof text === 'string') return text;
		const content = (response as { content?: unknown }).content;
		if (content !== undefined) return responseText(content);
	}
	return JSON.stringify(response ?? '');
}

function onStartTask(state: SessionState, response: unknown): void {
	const text = responseText(response);
	const taskId = text.match(/"taskId\\?":\\?"([^"\\]+)/)?.[1];
	if (!taskId) {
		if (text.trimStart().startsWith('chronicle:')) state.untracked = true;
		return;
	}
	state.taskId = taskId;
	state.url = text.match(/"url\\?":\\?"([^"\\]+)/)?.[1];
	state.finished = false;
	state.untracked = false;
	state.quiet = 0;
}

function context(event: string, text: string | undefined): object | null {
	return text ? { hookSpecificOutput: { hookEventName: event, additionalContext: text } } : null;
}

// Pure transition: the next state and what to tell the model, if anything.
export function step(
	state: SessionState,
	input: HookInput
): { state: SessionState; output: object | null } {
	const s = { ...state };
	const event = input.hook_event_name ?? '';
	const tool = input.tool_name ?? '';
	const open = !!s.taskId && !s.finished && !s.untracked;
	const waiting = s.armed && !s.taskId && !s.untracked;

	switch (event) {
		case 'SessionStart':
			if (input.source !== 'compact' && input.source !== 'resume')
				return { state: s, output: null };
			return {
				state: s,
				output: context(event, open ? resumed(s) : waiting ? noTask() : undefined)
			};

		case 'UserPromptSubmit':
			return {
				state: s,
				output: context(event, open ? openTask(s) : waiting ? noTask() : undefined)
			};

		case 'PreToolUse': {
			if (!open || tool !== 'Agent') return { state: s, output: null };
			const prompt = String(input.tool_input?.prompt ?? '');
			const mark = digest(prompt);
			if (prompt.includes(s.taskId!) || s.rejected === mark) return { state: s, output: null };
			s.rejected = mark;
			return {
				state: s,
				output: {
					hookSpecificOutput: {
						hookEventName: event,
						permissionDecision: 'deny',
						permissionDecisionReason: briefLine(s)
					}
				}
			};
		}

		case 'PostToolUse': {
			if (tool === 'mcp__chronicle__start_task') {
				s.armed = true;
				onStartTask(s, input.tool_response);
				return { state: s, output: null };
			}
			if (isChronicle(tool)) {
				s.armed = true;
				s.quiet = 0;
				if (tool === 'mcp__chronicle__update_task' && s.taskId) {
					const next = input.tool_input?.state;
					if (typeof next === 'string') s.finished = FINISHED_STATES.has(next);
				}
				return { state: s, output: null };
			}
			if (loadsChronicle(input)) {
				s.armed = true;
				return { state: s, output: null };
			}
			if (input.agent_id) return { state: s, output: null };
			if (waiting) {
				s.waiting += 1;
				const nudge = s.waiting <= 3 || s.waiting % 5 === 0;
				return { state: s, output: nudge ? context(event, noTask()) : null };
			}
			if (open) {
				s.quiet += 1;
				return {
					state: s,
					output: s.quiet % QUIET_EVERY === 0 ? context(event, quietTask(s)) : null
				};
			}
			return { state: s, output: null };
		}
	}
	return { state: s, output: null };
}

export function sessionsDir(env: Record<string, string | undefined>, home: string): string {
	return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'chronicle', 'sessions');
}

function load(file: string): SessionState {
	try {
		return { ...fresh(), ...JSON.parse(readFileSync(file, 'utf8')) };
	} catch {
		return fresh();
	}
}

function save(dir: string, file: string, state: SessionState): void {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
	renameSync(tmp, file);
}

function prune(dir: string, now: number): void {
	for (const name of readdirSync(dir)) {
		const file = join(dir, name);
		if (now - statSync(file).mtimeMs > SESSION_TTL_MS) rmSync(file, { force: true });
	}
}

// Never throws and never blocks: a broken hook must not reach the agent's work.
export function handleHook(raw: string, dir: string, now = Date.now()): string {
	try {
		const input = JSON.parse(raw) as HookInput;
		const id = input.session_id?.replace(/[^\w-]/g, '');
		if (!id) return '';
		const file = join(dir, `${id}.json`);
		if (input.hook_event_name === 'SessionStart') {
			try {
				prune(dir, now);
			} catch {
				// nothing to prune yet
			}
		}
		const before = load(file);
		const { state, output } = step(before, input);
		if (JSON.stringify(state) !== JSON.stringify(before)) save(dir, file, state);
		return output ? JSON.stringify(output) : '';
	} catch {
		return '';
	}
}
