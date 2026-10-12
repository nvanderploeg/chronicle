import { WORKSTATE_HEARTBEAT_MS, WORKSTATE_IDLE_MS } from '$app/env/private';
import { subscribe } from '#lib/server/bus.ts';
import { eventsSince, getProjectRow, lastWriteAt } from '#lib/server/store.ts';
import type { WorkstateEvent } from '#lib/types.ts';

export interface StreamOptions {
	since?: number;
	idleMs?: number;
	heartbeatMs?: number;
	now?: () => number;
}

const encoder = new TextEncoder();

function frame(event: WorkstateEvent): string {
	return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
}

export async function createProjectStream(
	projectId: string,
	options: StreamOptions = {}
): Promise<ReadableStream<Uint8Array> | null> {
	const now = options.now ?? Date.now;
	const idleMs = options.idleMs ?? WORKSTATE_IDLE_MS;
	const heartbeatMs = options.heartbeatMs ?? WORKSTATE_HEARTBEAT_MS;
	const { since } = options;

	if (!(await getProjectRow(projectId))) return null;

	const openedAt = now();
	const lastWrite = (await lastWriteAt(projectId))?.getTime() ?? 0;
	let deadline = Math.max(lastWrite, openedAt) + idleMs;

	let controller!: ReadableStreamDefaultController<Uint8Array>;
	let closed = false;
	let replaying = since !== undefined;
	let lastSeq = since ?? -1;
	const buffered: WorkstateEvent[] = [];
	let unsubscribe: (() => void) | undefined;
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

	function send(text: string): void {
		if (closed) return;
		try {
			controller.enqueue(encoder.encode(text));
		} catch {
			cleanup();
		}
	}

	function cleanup(): void {
		closed = true;
		unsubscribe?.();
		unsubscribe = undefined;
		clearTimeout(idleTimer);
		clearInterval(heartbeatTimer);
	}

	function armIdle(): void {
		clearTimeout(idleTimer);
		idleTimer = setTimeout(
			() => {
				if (closed) return;
				send('event: idle\ndata: {}\n\n');
				cleanup();
				try {
					controller.close();
				} catch {
					// already errored or cancelled
				}
			},
			Math.max(0, deadline - now())
		);
	}

	function emit(event: WorkstateEvent): void {
		if (event.seq <= lastSeq) return;
		lastSeq = event.seq;
		send(frame(event));
	}

	function onLive(event: WorkstateEvent): void {
		if (closed) return;
		deadline = now() + idleMs;
		armIdle();
		if (replaying) buffered.push(event);
		else emit(event);
	}

	return new ReadableStream<Uint8Array>({
		async start(c) {
			controller = c;
			unsubscribe = subscribe(projectId, onLive);
			armIdle();
			send(': ok\n\n');
			try {
				if (since !== undefined) {
					for (const event of await eventsSince(projectId, since)) {
						if (closed) return;
						emit(event);
					}
				}
			} catch (error) {
				cleanup();
				controller.error(error);
				return;
			}
			replaying = false;
			for (const event of buffered.splice(0)) emit(event);
			if (closed) return;
			heartbeatTimer = setInterval(() => send(': ping\n\n'), heartbeatMs);
		},
		cancel() {
			cleanup();
		}
	});
}
