import type { RequestHandler } from './$types';
import { ApiError, parseId, route } from '#lib/server/api.ts';
import { snapshot } from '#lib/server/store.ts';

export const GET: RequestHandler = route(async ({ params }) => {
	const result = await snapshot(parseId(params.id, 'project'));
	if (!result) throw new ApiError(404, 'project not found');
	return Response.json(result);
});
