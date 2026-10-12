export const UNREACHABLE_WARNING = 'workstate unreachable — continuing untracked';

export type Failure = { ok: false; warning: string; status?: number };
export type Reply<T> = { ok: true; status: number; body: T } | Failure;

export interface RequestInit {
	method: 'GET' | 'POST' | 'PUT' | 'PATCH';
	key?: string;
	body?: unknown;
}

export function normaliseServer(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

export function compact<T extends object>(input: T): Partial<T> {
	return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export async function request<T>(
	fetchFn: typeof fetch,
	timeoutMs: number,
	url: string,
	init: RequestInit
): Promise<Reply<T>> {
	const headers: Record<string, string> = { accept: 'application/json' };
	if (init.key) headers.authorization = `Bearer ${init.key}`;
	if (init.body !== undefined) headers['content-type'] = 'application/json';

	let status: number;
	let text: string;
	try {
		const res = await fetchFn(url, {
			method: init.method,
			headers,
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			signal: AbortSignal.timeout(timeoutMs)
		});
		status = res.status;
		text = await res.text();
	} catch {
		return { ok: false, warning: UNREACHABLE_WARNING };
	}

	if (status >= 500) return { ok: false, warning: UNREACHABLE_WARNING, status };

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		body = undefined;
	}

	if (status >= 200 && status < 300) {
		if (body === undefined) return { ok: false, warning: UNREACHABLE_WARNING, status };
		return { ok: true, status, body: body as T };
	}

	const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
	const error = typeof fields.error === 'string' ? fields.error : `HTTP ${status}`;
	const valid = Array.isArray(fields.validStates)
		? ` (valid states: ${fields.validStates.join(', ')})`
		: '';
	return { ok: false, warning: `workstate rejected the update: ${error}${valid}`, status };
}
