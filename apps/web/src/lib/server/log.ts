type Value = string | number | boolean | null | undefined;

function format(value: Exclude<Value, undefined>): string {
	const text = String(value);
	return /^[^\s"=]+$/.test(text) ? text : JSON.stringify(text);
}

// One logfmt line per event. Never pass write keys or request bodies.
export function log(event: string, fields: Record<string, Value> = {}): void {
	const pairs = Object.entries(fields)
		.filter((entry): entry is [string, Exclude<Value, undefined>] => entry[1] !== undefined)
		.map(([key, value]) => `${key}=${format(value)}`);
	console.log([new Date().toISOString(), event, ...pairs].join(' '));
}
