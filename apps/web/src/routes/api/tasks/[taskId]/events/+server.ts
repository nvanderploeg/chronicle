import type { RequestHandler } from './$types';
import { ApiError, parseId, route } from '#lib/server/api.ts';
import { getTaskRow, taskEvents } from '#lib/server/store.ts';
import { parsePath } from '#lib/server/validate.ts';

export const GET: RequestHandler = route(async ({ params, url }) => {
	const taskId = parseId(params.taskId, 'task');
	const path = url.searchParams.get('path');
	const filter = path === null ? undefined : parsePath(path).join('/');
	if (!(await getTaskRow(taskId))) throw new ApiError(404, 'task not found');
	return Response.json({ events: await taskEvents(taskId, filter) });
});
