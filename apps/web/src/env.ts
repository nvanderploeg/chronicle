import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	ORIGIN: {
		description:
			'Public base URL used in links the API returns, e.g. `https://workstate.nanzero.com`. Unset: the request origin.',
		schema: (value) => value?.trim().replace(/\/+$/, '') || undefined
	},
	WORKSTATE_IDLE_MS: {
		description: 'Milliseconds without a project write before its stream sends `idle` and closes.',
		schema: (value) => Number(value || 14_400_000)
	},
	WORKSTATE_WRITES_PER_MINUTE: {
		description:
			'Writes one client address may burst, refilled at this many a minute; excess gets 429. 0 disables the limit.',
		schema: (value) => Number(value || 30)
	},
	WORKSTATE_HEARTBEAT_MS: {
		description: 'Milliseconds between `: ping` heartbeats on a project stream.',
		schema: (value) => Number(value || 25_000)
	}
});
