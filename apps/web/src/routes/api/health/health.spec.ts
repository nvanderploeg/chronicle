import { expect, test } from 'vitest';
import { GET } from './+server.ts';

test('health reports the service and a reachable database', async () => {
	const response = await GET({} as Parameters<typeof GET>[0]);

	expect(response.status).toBe(200);
	expect(response.headers.get('cache-control')).toBe('no-store');
	expect(await response.json()).toEqual({
		service: 'chronicle',
		version: expect.any(String),
		db: 'ok'
	});
});
