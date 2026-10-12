import type { RequestHandler } from './$types';
import { readBody, route } from '#lib/server/api.ts';
import { generateWriteKey, hashWriteKey } from '#lib/server/auth.ts';
import { insertProject } from '#lib/server/store.ts';
import { parseProjectCreate } from '#lib/server/validate.ts';

export const POST: RequestHandler = route(async ({ request, url }) => {
	const { name, config } = parseProjectCreate(await readBody(request));
	const id = crypto.randomUUID();
	const writeKey = generateWriteKey();
	const now = new Date();
	await insertProject({
		id,
		name,
		writeKeyHash: hashWriteKey(writeKey),
		config,
		createdAt: now,
		lastWriteAt: now
	});
	return Response.json({ id, writeKey, url: `${url.origin}/p/${id}`, config }, { status: 201 });
});
