import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectStream } from './stream.ts';
import { resetDb } from './test/db.ts';
import { POST as postProjectRoute } from '../../routes/api/projects/+server.ts';
import { POST as postTaskRoute } from '../../routes/api/projects/[id]/tasks/+server.ts';
import { PUT as putNodeRoute } from '../../routes/api/tasks/[taskId]/nodes/[...path]/+server.ts';
import { GET as getStreamRoute } from '../../routes/api/projects/[id]/stream/+server.ts';

const BASE = 'http://chronicle.test';
const TIMED_OUT = Symbol('timed out');

interface Frame {
	id?: string;
	event?: string;
	data?: string;
	comment?: string;
}

function parseFrames(text: string): Frame[] {
	return text
		.split('\n\n')
		.slice(0, -1)
		.map((block) => {
			const frame: Frame = {};
			for (const line of block.split('\n')) {
				if (line.startsWith(':')) {
					frame.comment = line.slice(1).trim();
					continue;
				}
				const colon = line.indexOf(':');
				const field = line.slice(0, colon);
				const value = line.slice(colon + 1).replace(/^ /, '');
				if (field === 'id') frame.id = value;
				else if (field === 'event') frame.event = value;
				else if (field === 'data') frame.data = value;
			}
			return frame;
		});
}

const eventFrames = (frames: Frame[]) => frames.filter((f) => f.event !== undefined);
const payloadOf = (frame: Frame) => JSON.parse(frame.data ?? 'null');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
		timer = setTimeout(resolve, ms, TIMED_OUT);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function collect(stream: ReadableStream<Uint8Array>) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const openedAt = performance.now();
	let buffer = '';
	let finished = false;
	let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

	async function step(deadline: number): Promise<'data' | 'done' | 'timeout'> {
		const remaining = deadline - performance.now();
		if (remaining <= 0) return 'timeout';
		pending ??= reader.read();
		const result = await withTimeout(pending, remaining);
		if (result === TIMED_OUT) return 'timeout';
		pending = null;
		if (result.done) {
			finished = true;
			return 'done';
		}
		buffer += decoder.decode(result.value, { stream: true });
		return 'data';
	}

	return {
		frames: () => parseFrames(buffer),
		text: () => buffer,
		elapsed: () => performance.now() - openedAt,
		async waitFor(match: (frames: Frame[]) => boolean, timeoutMs = 1000): Promise<boolean> {
			const deadline = performance.now() + timeoutMs;
			while (!match(parseFrames(buffer))) {
				if (finished) return false;
				if ((await step(deadline)) === 'timeout') return false;
			}
			return true;
		},
		async closed(timeoutMs = 1000): Promise<boolean> {
			const deadline = performance.now() + timeoutMs;
			while (!finished) {
				if ((await step(deadline)) === 'timeout') return false;
			}
			return true;
		},
		async cancel(): Promise<void> {
			finished = true;
			await reader.cancel().catch(() => {});
		}
	};
}

type Collector = ReturnType<typeof collect>;
const live: Collector[] = [];

function track(stream: ReadableStream<Uint8Array>): Collector {
	const collector = collect(stream);
	live.push(collector);
	return collector;
}

async function settle(c: Collector, ms: number): Promise<void> {
	await c.waitFor(() => false, ms);
}

async function readEvents(c: Collector, count: number): Promise<Frame[]> {
	const reached = await c.waitFor((frames) => eventFrames(frames).length >= count, 1000);
	expect(reached).toBe(true);
	await settle(c, 50);
	return eventFrames(c.frames());
}

async function createProject(): Promise<{ id: string; writeKey: string }> {
	const url = `${BASE}/api/projects`;
	const res = await postProjectRoute({
		request: new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'stream spec' })
		}),
		params: {},
		url: new URL(url),
		getClientAddress: () => '10.0.0.1'
	} as never);
	expect(res.status).toBe(201);
	return (await res.json()) as { id: string; writeKey: string };
}

async function createTask(
	projectId: string,
	writeKey: string,
	body: { title: string; steps?: { key: string }[] }
): Promise<{ taskId: string }> {
	const url = `${BASE}/api/projects/${projectId}/tasks`;
	const res = await postTaskRoute({
		request: new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${writeKey}` },
			body: JSON.stringify(body)
		}),
		params: { id: projectId },
		url: new URL(url),
		getClientAddress: () => '10.0.0.1'
	} as never);
	expect(res.status).toBe(201);
	return (await res.json()) as { taskId: string };
}

async function seed(): Promise<{ id: string; writeKey: string; taskId: string }> {
	const project = await createProject();
	const task = await createTask(project.id, project.writeKey, {
		title: 'Seed task',
		steps: [{ key: 'a' }, { key: 'b' }]
	});
	return { id: project.id, writeKey: project.writeKey, taskId: task.taskId };
}

async function putNode(
	taskId: string,
	writeKey: string,
	path: string,
	body: { state?: string; note?: string }
): Promise<void> {
	const url = `${BASE}/api/tasks/${taskId}/nodes/${path}`;
	const res = await putNodeRoute({
		request: new Request(url, {
			method: 'PUT',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${writeKey}` },
			body: JSON.stringify(body)
		}),
		params: { taskId, path },
		url: new URL(url),
		getClientAddress: () => '10.0.0.1'
	} as never);
	expect(res.status).toBe(200);
}

async function getStream(
	projectId: string,
	opts: { lastEventId?: string; since?: string } = {}
): Promise<Response> {
	const query = opts.since !== undefined ? `?since=${opts.since}` : '';
	const url = `${BASE}/api/projects/${projectId}/stream${query}`;
	const headers: Record<string, string> = {};
	if (opts.lastEventId !== undefined) headers['last-event-id'] = opts.lastEventId;
	return getStreamRoute({
		request: new Request(url, { headers }),
		params: { id: projectId },
		url: new URL(url),
		getClientAddress: () => '10.0.0.1'
	} as never);
}

function bodyOf(res: Response): Collector {
	expect(res.body).not.toBeNull();
	return track(res.body!);
}

async function openStream(
	projectId: string,
	options: { since?: number; idleMs?: number; heartbeatMs?: number; now?: () => number }
): Promise<Collector> {
	const stream = await createProjectStream(projectId, options);
	expect(stream).not.toBeNull();
	return track(stream!);
}

beforeEach(async () => {
	await resetDb();
});

afterEach(async () => {
	await Promise.all(live.splice(0).map((c) => c.cancel()));
});

describe('createProjectStream', () => {
	it('resolves to null for a project that does not exist', async () => {
		const stream = await createProjectStream(randomUUID(), { idleMs: 200, heartbeatMs: 50 });
		expect(stream).toBeNull();
	});

	it('replays every event with seq > since in ascending order with its type and row payload', async () => {
		const project = await createProject();
		const task = await createTask(project.id, project.writeKey, {
			title: 'Ship it',
			steps: [{ key: 'a' }, { key: 'b' }]
		});

		const c = await openStream(project.id, { since: 0, idleMs: 5000, heartbeatMs: 10_000 });
		const frames = await readEvents(c, 3);

		expect(frames.map((f) => f.event)).toEqual(['task', 'node', 'node']);
		const ids = frames.map((f) => Number(f.id));
		expect(ids.every(Number.isInteger)).toBe(true);
		expect(new Set(ids).size).toBe(3);
		expect(ids).toEqual([...ids].sort((x, y) => x - y));

		const [taskRow, nodeA, nodeB] = frames.map(payloadOf);
		expect(taskRow).toMatchObject({ id: task.taskId, projectId: project.id, title: 'Ship it' });
		expect(nodeA).toMatchObject({
			taskId: task.taskId,
			path: 'a',
			key: 'a',
			depth: 1,
			state: 'queued'
		});
		expect(nodeB).toMatchObject({ taskId: task.taskId, path: 'b', key: 'b', depth: 1 });
		for (const row of [taskRow, nodeA, nodeB]) {
			expect(row).not.toHaveProperty('seq');
			expect(row).not.toHaveProperty('payload');
		}
	});

	it('replays only events after since when since is the seq of the first event', async () => {
		const project = await createProject();
		await createTask(project.id, project.writeKey, {
			title: 'Ship it',
			steps: [{ key: 'a' }, { key: 'b' }]
		});

		const all = await readEvents(
			await openStream(project.id, { since: 0, idleMs: 5000, heartbeatMs: 10_000 }),
			3
		);
		const ids = all.map((f) => Number(f.id));

		const later = await readEvents(
			await openStream(project.id, { since: ids[0], idleMs: 5000, heartbeatMs: 10_000 }),
			2
		);
		expect(later.map((f) => f.event)).toEqual(['node', 'node']);
		expect(later.map((f) => Number(f.id))).toEqual([ids[1], ids[2]]);
	});

	it('sends only live events when since is omitted and pushes a node write as it is published', async () => {
		const { id, writeKey, taskId } = await seed();

		const c = await openStream(id, { idleMs: 5000, heartbeatMs: 10_000 });
		await putNode(taskId, writeKey, 'a', { state: 'in_work', note: 'half way' });

		expect(await c.waitFor((frames) => eventFrames(frames).length >= 1, 1000)).toBe(true);
		await settle(c, 30);
		const frames = eventFrames(c.frames());
		expect(frames.map((f) => f.event)).toEqual(['node']);
		expect(payloadOf(frames[0])).toMatchObject({
			taskId,
			path: 'a',
			state: 'in_work',
			note: 'half way'
		});
	});

	it('never delivers events written to a different project', async () => {
		const projectA = await seed();
		const projectB = await seed();

		const c = await openStream(projectA.id, { idleMs: 5000, heartbeatMs: 10_000 });
		await putNode(projectB.taskId, projectB.writeKey, 'a', { state: 'in_work' });
		await putNode(projectA.taskId, projectA.writeKey, 'b', { state: 'in_work' });

		const sawA = await c.waitFor(
			(frames) => eventFrames(frames).some((f) => payloadOf(f).taskId === projectA.taskId),
			1000
		);
		expect(sawA).toBe(true);
		await settle(c, 50);

		const frames = eventFrames(c.frames());
		expect(frames.map((f) => f.event)).toEqual(['node']);
		expect(payloadOf(frames[0])).toMatchObject({ taskId: projectA.taskId, path: 'b' });
		expect(c.text()).not.toContain(projectB.taskId);
	});

	it('delivers an event written while replay runs exactly once, with no gap', async () => {
		const { id, writeKey, taskId } = await seed();

		const c = await openStream(id, { since: 0, idleMs: 5000, heartbeatMs: 10_000 });
		await putNode(taskId, writeKey, 'a', { state: 'in_work' });
		await putNode(taskId, writeKey, 'b', { state: 'in_work' });

		const frames = await readEvents(c, 5);
		expect(frames.map((f) => f.event)).toEqual(['task', 'node', 'node', 'node', 'node']);
		const ids = frames.map((f) => Number(f.id));
		const base = ids[0];
		expect(base).toBeGreaterThanOrEqual(1);
		expect(ids).toEqual([base, base + 1, base + 2, base + 3, base + 4]);
	});

	it('sends a ": ping" comment roughly every heartbeatMs', async () => {
		const project = await createProject();

		const c = await openStream(project.id, { heartbeatMs: 50, idleMs: 5000 });
		const pings = (frames: Frame[]) => frames.filter((f) => f.comment === 'ping');

		expect(await c.waitFor((frames) => pings(frames).length >= 1, 1000)).toBe(true);
		const firstAt = c.elapsed();
		expect(await c.waitFor((frames) => pings(frames).length >= 2, 1000)).toBe(true);
		const secondAt = c.elapsed();

		expect(firstAt).toBeGreaterThanOrEqual(20);
		expect(firstAt).toBeLessThan(500);
		expect(secondAt - firstAt).toBeGreaterThanOrEqual(15);
		expect(secondAt - firstAt).toBeLessThan(400);
		expect(c.text()).toContain(': ping\n\n');
	});

	it('emits event: idle and then closes after idleMs with no writes', async () => {
		const project = await createProject();

		const c = await openStream(project.id, { idleMs: 200, heartbeatMs: 10_000 });
		expect(await c.waitFor((frames) => frames.some((f) => f.event === 'idle'), 1000)).toBe(true);
		expect(c.elapsed()).toBeGreaterThanOrEqual(150);
		expect(c.text()).toContain('event: idle\ndata: {}\n\n');

		expect(await c.closed(500)).toBe(true);
	});

	it('pushes the idle deadline out on every write, so idle arrives after a write made before it', async () => {
		const { id, writeKey, taskId } = await seed();

		const c = await openStream(id, { idleMs: 300, heartbeatMs: 10_000 });
		await sleep(120);
		await putNode(taskId, writeKey, 'a', { state: 'in_work' });

		expect(await c.waitFor((frames) => frames.some((f) => f.event === 'idle'), 1500)).toBe(true);
		expect(c.elapsed()).toBeGreaterThanOrEqual(380);
		expect(eventFrames(c.frames()).map((f) => f.event)).toEqual(['node', 'idle']);
	});

	it('gives a project whose last write is long past a full idleMs window from open', async () => {
		const { id } = await seed();
		await sleep(300);

		const c = await openStream(id, { idleMs: 200, heartbeatMs: 10_000 });
		expect(await c.waitFor((frames) => frames.some((f) => f.event === 'idle'), 120)).toBe(false);
		expect(await c.waitFor((frames) => frames.some((f) => f.event === 'idle'), 1000)).toBe(true);
		expect(c.elapsed()).toBeGreaterThanOrEqual(150);
	});

	it('stops publishing and timers once the reader is cancelled', async () => {
		const { id, writeKey, taskId } = await seed();

		const stream = await createProjectStream(id, { idleMs: 100, heartbeatMs: 30 });
		expect(stream).not.toBeNull();
		const reader = stream!.getReader();
		const opening = await reader.read();
		expect(new TextDecoder().decode(opening.value)).toBe(': ok\n\n');
		const first = await reader.read();
		expect(first.done).toBe(false);
		expect(new TextDecoder().decode(first.value)).toContain(': ping\n\n');

		await reader.cancel();
		expect((await reader.read()).done).toBe(true);

		await putNode(taskId, writeKey, 'a', { state: 'in_work' });
		await sleep(300);
		expect((await reader.read()).done).toBe(true);
	});
});

describe('GET /api/projects/[id]/stream', () => {
	it('answers 404 with a JSON error for an unknown project', async () => {
		const res = await getStream(randomUUID());
		expect(res.status).toBe(404);
		expect(res.headers.get('content-type')).toContain('application/json');
		expect(await res.json()).toEqual({ error: 'project not found' });
	});

	it('answers 400 for a malformed project id', async () => {
		const res = await getStream('not-a-uuid');
		expect(res.status).toBe(400);
	});

	it('answers 200 with the SSE headers and a stream body', async () => {
		const { id } = await seed();

		const res = await getStream(id);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/event-stream');
		expect(res.headers.get('cache-control')).toBe('no-cache');
		expect(res.headers.get('x-accel-buffering')).toBe('no');
		expect(res.body).not.toBeNull();
		await res.body?.cancel();
	});

	it('replays events after ?since=', async () => {
		const { id } = await seed();

		const frames = await readEvents(bodyOf(await getStream(id, { since: '0' })), 3);
		expect(frames.map((f) => f.event)).toEqual(['task', 'node', 'node']);
		const ids = frames.map((f) => Number(f.id));
		expect(ids).toEqual([...ids].sort((x, y) => x - y));
		expect(new Set(ids).size).toBe(3);
	});

	it('replays events after the Last-Event-ID header', async () => {
		const { id } = await seed();
		const all = await readEvents(bodyOf(await getStream(id, { since: '0' })), 3);
		const ids = all.map((f) => Number(f.id));

		const frames = await readEvents(
			bodyOf(await getStream(id, { lastEventId: String(ids[0]) })),
			2
		);
		expect(frames.map((f) => f.event)).toEqual(['node', 'node']);
		expect(frames.map((f) => Number(f.id))).toEqual([ids[1], ids[2]]);
	});

	it('takes the Last-Event-ID header over ?since= when both are given', async () => {
		const { id } = await seed();
		const all = await readEvents(bodyOf(await getStream(id, { since: '0' })), 3);
		const ids = all.map((f) => Number(f.id));

		const c = bodyOf(await getStream(id, { since: '0', lastEventId: String(ids[1]) }));
		const frames = await readEvents(c, 1);
		expect(frames.map((f) => Number(f.id))).toEqual([ids[2]]);
	});
});
