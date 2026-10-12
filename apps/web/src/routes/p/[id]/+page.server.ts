import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, parseId } from '#lib/server/api.ts';
import { snapshot } from '#lib/server/store.ts';

export const load: PageServerLoad = async ({ params }) => {
	let id: string;
	try {
		id = parseId(params.id, 'project');
	} catch (e) {
		if (e instanceof ApiError) error(404, 'Project not found');
		throw e;
	}
	const result = await snapshot(id);
	if (!result) error(404, 'Project not found');
	return { snapshot: result, now: Date.now() };
};
