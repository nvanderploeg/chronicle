import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index.ts';
import pkg from '../../../../package.json' with { type: 'json' };

export const GET: RequestHandler = async () => {
	const body = { service: 'workstate', version: pkg.version };
	const headers = { 'cache-control': 'no-store' };
	try {
		await db.execute(sql`select 1`);
		return Response.json({ ...body, db: 'ok' }, { headers });
	} catch {
		return Response.json({ ...body, db: 'unavailable' }, { status: 503, headers });
	}
};
