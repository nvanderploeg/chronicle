import type { RequestHandler } from './$types';
import { ApiError, parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeProject } from '#lib/server/auth.ts';
import { applyPatch, validateConfig } from '#lib/server/config.ts';
import { patchConfig, replaceConfig } from '#lib/server/store.ts';

export const PUT: RequestHandler = route(async ({ request, params }) => {
	const id = parseId(params.id, 'project');
	await authorizeProject(request, id);
	const result = validateConfig(await readBody(request));
	if (!result.ok) throw new ApiError(400, result.error);
	return Response.json({ config: await replaceConfig(id, result.config) });
});

export const PATCH: RequestHandler = route(async ({ request, params }) => {
	const id = parseId(params.id, 'project');
	await authorizeProject(request, id);
	const patch = await readBody(request);
	return Response.json({ config: await patchConfig(id, (config) => applyPatch(config, patch)) });
});
