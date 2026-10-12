import type { RequestHandler } from './$types';
import { PRESETS } from '#lib/server/presets.ts';

export const GET: RequestHandler = async () => {
	const presets = Object.entries(PRESETS).map(([name, config]) => ({ name, config }));
	return Response.json({ presets });
};
