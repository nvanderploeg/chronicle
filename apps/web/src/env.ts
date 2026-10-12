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
	WORKSTATE_HEARTBEAT_MS: {
		description: 'Milliseconds between `: ping` heartbeats on a project stream.',
		schema: (value) => Number(value || 25_000)
	}
});
