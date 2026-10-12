import type { RequestHandler } from './$types';
import { ApiError, parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeTask } from '#lib/server/auth.ts';
import { getTaskWithNodes, patchTask } from '#lib/server/store.ts';
import { parseTaskPatch } from '#lib/server/validate.ts';

export const GET: RequestHandler = route(async ({ params }) => {
	const result = await getTaskWithNodes(parseId(params.taskId, 'task'));
	if (!result) throw new ApiError(404, 'task not found');
	return Response.json(result);
});

export const PATCH: RequestHandler = route(async ({ request, params }) => {
	const taskId = parseId(params.taskId, 'task');
	const { project } = await authorizeTask(request, taskId);
	const task = await patchTask(project.id, taskId, parseTaskPatch(await readBody(request)));
	return Response.json({ task });
});
