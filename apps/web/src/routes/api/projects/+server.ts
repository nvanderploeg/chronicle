import type { RequestHandler } from './$types';
import { readBody, route } from '#lib/server/api.ts';
import { generateWriteKey, hashWriteKey } from '#lib/server/auth.ts';
import { insertProject } from '#lib/server/store.ts';
import { parseProjectCreate } from '#lib/server/validate.ts';
import { publicOrigin } from '#lib/server/origin.ts';
import { log } from '#lib/server/log.ts';

export const POST: RequestHandler = route(async ({ request, url, getClientAddress }) => {
	const { name, notes, links, config } = parseProjectCreate(await readBody(request));
	const id = crypto.randomUUID();
	const writeKey = generateWriteKey();
	const now = new Date();
	await insertProject({
		id,
		name,
		notes,
		links,
		writeKeyHash: hashWriteKey(writeKey),
		config,
		createdAt: now,
		lastWriteAt: now
	});
	log('project.create', { id, name, ip: getClientAddress() });
	return Response.json(
		{ id, name, writeKey, url: `${publicOrigin(url)}/p/${id}`, config },
		{ status: 201 }
	);
});
