import { ApiError } from '#lib/server/api.ts';
import { COLOR_PATTERN, isObject, validateConfig } from '#lib/server/config.ts';
import { PRESETS } from '#lib/server/presets.ts';
import type { ProjectConfig, Tag } from '#lib/types.ts';

const MAX_TEXT = 10_000;
const MAX_NAME = 255;
const MAX_PATH = 512;
const SEGMENT = /^[A-Za-z0-9._-]{1,64}$/;
const INT32_MAX = 2_147_483_647;

type Body = Record<string, unknown>;

export interface NodeInput {
	title?: string;
	state?: string;
	note?: string;
	tags?: Tag[];
	position?: number;
}

export interface StepInput extends NodeInput {
	key: string;
}

export interface TaskInput {
	title: string;
	summary?: string;
	state?: string;
	note?: string;
	steps?: StepInput[];
}

export interface TaskPatch {
	title?: string;
	summary?: string;
	state?: string;
	note?: string;
}

function text(body: Body, field: string, opts: { nonEmpty?: boolean; max?: number } = {}) {
	const value = body[field];
	if (value === undefined) return undefined;
	const max = opts.max ?? MAX_TEXT;
	if (typeof value !== 'string' || value.length > max || (opts.nonEmpty && value === '')) {
		throw new ApiError(
			400,
			`${field} must be a ${opts.nonEmpty ? 'non-empty ' : ''}string of at most ${max} characters`
		);
	}
	return value;
}

function stateField(body: Body): string | undefined {
	const value = body.state;
	if (value === undefined) return undefined;
	if (typeof value !== 'string') throw new ApiError(400, 'state must be a string');
	return value;
}

function tags(body: Body): Tag[] | undefined {
	const value = body.tags;
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new ApiError(400, 'tags must be an array');
	return value.map((raw, index) => {
		if (!isObject(raw) || typeof raw.text !== 'string' || raw.text === '') {
			throw new ApiError(400, `tags[${index}].text must be a non-empty string`);
		}
		const tag: Tag = { text: raw.text };
		if (raw.color !== undefined) {
			if (typeof raw.color !== 'string' || !COLOR_PATTERN.test(raw.color)) {
				throw new ApiError(400, `tags[${index}].color must match ${COLOR_PATTERN}`);
			}
			tag.color = raw.color;
		}
		return tag;
	});
}

function position(body: Body): number | undefined {
	const value = body.position;
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || Math.abs(value as number) > INT32_MAX) {
		throw new ApiError(400, 'position must be an integer');
	}
	return value as number;
}

function defined<T extends object>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function parseNodeBody(body: Body): NodeInput {
	return defined({
		title: text(body, 'title', { nonEmpty: true }),
		state: stateField(body),
		note: text(body, 'note'),
		tags: tags(body),
		position: position(body)
	});
}

function parseStep(raw: unknown, index: number): StepInput {
	if (!isObject(raw)) throw new ApiError(400, `steps[${index}] must be an object`);
	if (typeof raw.key !== 'string' || !SEGMENT.test(raw.key)) {
		throw new ApiError(400, `steps[${index}].key must match ${SEGMENT}`);
	}
	const { title, state, note, tags } = parseNodeBody(raw);
	return defined({ key: raw.key, title, state, note, tags });
}

export function parseTaskCreate(body: Body): TaskInput {
	const title = text(body, 'title', { nonEmpty: true });
	if (title === undefined) throw new ApiError(400, 'title is required');
	let steps: StepInput[] | undefined;
	if (body.steps !== undefined) {
		if (!Array.isArray(body.steps)) throw new ApiError(400, 'steps must be an array');
		steps = body.steps.map(parseStep);
		const keys = new Set<string>();
		for (const step of steps) {
			if (keys.has(step.key)) throw new ApiError(400, `duplicate step key "${step.key}"`);
			keys.add(step.key);
		}
	}
	return defined({
		title,
		summary: text(body, 'summary'),
		state: stateField(body),
		note: text(body, 'note'),
		steps
	});
}

export function parseTaskPatch(body: Body): TaskPatch {
	return defined({
		title: text(body, 'title', { nonEmpty: true }),
		summary: text(body, 'summary'),
		state: stateField(body),
		note: text(body, 'note')
	});
}

export function parsePath(raw: string | null | undefined): string[] {
	const segments = (raw ?? '').split('/');
	if (
		raw === null ||
		raw === undefined ||
		raw.length > MAX_PATH ||
		!segments.every((segment) => SEGMENT.test(segment))
	) {
		throw new ApiError(400, 'malformed node path');
	}
	return segments;
}

export function parseProjectCreate(body: Body): { name: string; config: ProjectConfig } {
	const name = text(body, 'name', { nonEmpty: true, max: MAX_NAME }) ?? 'Untitled project';
	let preset: ProjectConfig | undefined;
	if (body.preset !== undefined) {
		if (typeof body.preset !== 'string' || !Object.hasOwn(PRESETS, body.preset)) {
			throw new ApiError(400, 'unknown preset');
		}
		preset = PRESETS[body.preset];
	}
	if (body.config !== undefined) {
		const result = validateConfig(body.config);
		if (!result.ok) throw new ApiError(400, result.error);
		return { name, config: result.config };
	}
	return { name, config: structuredClone(preset ?? PRESETS['build-it']) };
}
