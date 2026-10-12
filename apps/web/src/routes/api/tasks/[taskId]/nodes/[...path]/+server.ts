import type { RequestHandler } from './$types';
import { parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeTask } from '#lib/server/auth.ts';
import { upsertNode } from '#lib/server/store.ts';
import { parseNodeBody, parsePath } from '#lib/server/validate.ts';

export const PUT: RequestHandler = route(async ({ request, params }) => {
	const taskId = parseId(params.taskId, 'task');
	const segments = parsePath(params.path);
	const { project } = await authorizeTask(request, taskId);
	const node = await upsertNode(
		project.id,
		taskId,
		segments,
		parseNodeBody(await readBody(request))
	);
	return Response.json({ node });
});
