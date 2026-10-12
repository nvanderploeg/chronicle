import type { RequestHandler } from './$types';
import { parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeProject } from '#lib/server/auth.ts';
import { createTask } from '#lib/server/store.ts';
import { parseTaskCreate } from '#lib/server/validate.ts';
import { publicOrigin } from '#lib/server/origin.ts';

export const POST: RequestHandler = route(async ({ request, params, url }) => {
	const projectId = parseId(params.id, 'project');
	await authorizeProject(request, projectId);
	const { task, nodes } = await createTask(projectId, parseTaskCreate(await readBody(request)));
	return Response.json(
		{ taskId: task.id, url: `${publicOrigin(url)}/p/${projectId}/t/${task.id}`, task, nodes },
		{ status: 201 }
	);
});
