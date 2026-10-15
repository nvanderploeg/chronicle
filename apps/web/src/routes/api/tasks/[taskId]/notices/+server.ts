import type { RequestHandler } from './$types';
import { parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeTask } from '#lib/server/auth.ts';
import { addNotice } from '#lib/server/store.ts';
import { parseNoticeBody } from '#lib/server/validate.ts';

export const POST: RequestHandler = route(async ({ request, params }) => {
	const taskId = parseId(params.taskId, 'task');
	const { project } = await authorizeTask(request, taskId);
	const notice = await addNotice(project.id, taskId, parseNoticeBody(await readBody(request)));
	return Response.json({ notice }, { status: 201 });
});
