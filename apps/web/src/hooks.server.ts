import type { ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { bootstrap } from '#lib/server/bootstrap.ts';

export const init: ServerInit = async () => {
	if (building) return;
	await bootstrap();
};
