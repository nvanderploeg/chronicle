import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { WORKSTATE_WRITE_WINDOW_MS, WORKSTATE_WRITES_PER_WINDOW } from '$app/env/private';
import { bootstrap } from '#lib/server/bootstrap.ts';
import { log } from '#lib/server/log.ts';
import { createRateLimiter, limitWrites } from '#lib/server/ratelimit.ts';

const writes = createRateLimiter(WORKSTATE_WRITES_PER_WINDOW, WORKSTATE_WRITE_WINDOW_MS);

export const init: ServerInit = async () => {
	if (building) return;
	await bootstrap();
};

export const handle: Handle = async ({ event, resolve }) => {
	const refused = limitWrites(writes, event);
	if (refused) {
		log('ratelimit', {
			ip: event.getClientAddress(),
			method: event.request.method,
			path: event.url.pathname,
			retry_after: refused.headers.get('retry-after')
		});
		return refused;
	}
	const response = await resolve(event);
	if (response.status >= 400 && event.url.pathname.startsWith('/api/')) {
		const body = await response
			.clone()
			.json()
			.catch(() => null);
		log('api.fail', {
			ip: event.getClientAddress(),
			method: event.request.method,
			path: event.url.pathname,
			status: response.status,
			error: typeof body?.error === 'string' ? body.error : undefined
		});
	}
	return response;
};

export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return;
	log('error', {
		method: event.request.method,
		path: event.url.pathname,
		error: error instanceof Error ? (error.stack ?? error.message) : String(error)
	});
};
