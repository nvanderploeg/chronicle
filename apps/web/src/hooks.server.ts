import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { WORKSTATE_WRITES_PER_MINUTE } from '$app/env/private';
import { bootstrap } from '#lib/server/bootstrap.ts';
import { createRateLimiter, limitWrites } from '#lib/server/ratelimit.ts';

const writes = createRateLimiter(WORKSTATE_WRITES_PER_MINUTE);

export const init: ServerInit = async () => {
	if (building) return;
	await bootstrap();
};

export const handle: Handle = async ({ event, resolve }) =>
	limitWrites(writes, event) ?? resolve(event);
