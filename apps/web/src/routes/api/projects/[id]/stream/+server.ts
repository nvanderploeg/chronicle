import type { RequestHandler } from './$types';
import { ApiError, parseId, route } from '#lib/server/api.ts';
import { createProjectStream } from '#lib/server/stream.ts';

function parseSince(request: Request, url: URL): number | undefined {
	const raw = request.headers.get('last-event-id') || url.searchParams.get('since');
	if (!raw) return undefined;
	if (!/^\d+$/.test(raw)) throw new ApiError(400, 'malformed since');
	return Number(raw);
}

export const GET: RequestHandler = route(async ({ request, params, url }) => {
	const projectId = parseId(params.id, 'project');
	const since = parseSince(request, url);
	const stream = await createProjectStream(projectId, { since });
	if (!stream) throw new ApiError(404, 'project not found');
	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'x-accel-buffering': 'no'
		}
	});
});
