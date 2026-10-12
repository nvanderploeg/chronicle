import { isObject } from '#lib/server/config.ts';

export class ApiError extends Error {
	readonly status: number;
	readonly body: Record<string, unknown>;

	constructor(status: number, error: string, extra: Record<string, unknown> = {}) {
		super(error);
		this.status = status;
		this.body = { error, ...extra };
	}
}

// Client errors are returned, never thrown, so handlers stay callable with a bare event object.
export function route<E>(
	handler: (event: E) => Promise<Response>
): (event: E) => Promise<Response> {
	return async (event) => {
		try {
			return await handler(event);
		} catch (error) {
			if (error instanceof ApiError) return Response.json(error.body, { status: error.status });
			throw error;
		}
	};
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseId(value: string | undefined, what: string): string {
	if (value === undefined || !UUID_V4.test(value)) throw new ApiError(400, `malformed ${what} id`);
	return value.toLowerCase();
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
	const text = await request.text();
	if (text.trim() === '') return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new ApiError(400, 'malformed JSON body');
	}
	if (!isObject(parsed)) throw new ApiError(400, 'body must be a JSON object');
	return parsed;
}
