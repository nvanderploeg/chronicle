import type { Animation, ProjectConfig, StateDef, StateKind, Theme } from '#lib/types.ts';

export const KEY_PATTERN = /^[a-z0-9_-]{1,32}$/;
export const COLOR_PATTERN = /^[#a-zA-Z0-9(),.%\s-]{1,64}$/;

const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
const KINDS: readonly StateKind[] = ['pending', 'active', 'review', 'blocked', 'failed', 'done'];
const ANIMATIONS: readonly Animation[] = ['none', 'pulse', 'shimmer', 'blink', 'spin'];

type Outcome = { ok: true; config: ProjectConfig } | { ok: false; error: string };

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseState(raw: unknown, index: number): StateDef | string {
	const at = `states[${index}]`;
	if (!isObject(raw)) return `${at} must be an object`;
	const { key, label, color, kind, icon, animation } = raw;
	if (typeof key !== 'string' || !KEY_PATTERN.test(key))
		return `${at}.key must match ${KEY_PATTERN}`;
	if (typeof label !== 'string' || label === '') return `${at}.label must be a non-empty string`;
	if (typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
		return `${at}.color must match ${COLOR_PATTERN}`;
	}
	if (typeof kind !== 'string' || !KINDS.includes(kind as StateKind)) {
		return `${at}.kind must be one of ${KINDS.join(', ')}`;
	}
	const state: StateDef = { key, label, color, kind: kind as StateKind };
	if (icon !== undefined) {
		if (typeof icon !== 'string' || [...icon].length > 4) {
			return `${at}.icon must be a string of up to 4 characters`;
		}
		state.icon = icon;
	}
	if (animation !== undefined) {
		if (typeof animation !== 'string' || !ANIMATIONS.includes(animation as Animation)) {
			return `${at}.animation must be one of ${ANIMATIONS.join(', ')}`;
		}
		state.animation = animation as Animation;
	} else {
		state.animation = 'none';
	}
	return state;
}

export function validateConfig(input: unknown): Outcome {
	if (!isObject(input)) return { ok: false, error: 'config must be an object' };
	const { theme, initialState, states } = input;
	if (typeof theme !== 'string' || !THEMES.includes(theme as Theme)) {
		return { ok: false, error: `theme must be one of ${THEMES.join(', ')}` };
	}
	if (!Array.isArray(states) || states.length === 0) {
		return { ok: false, error: 'states must be a non-empty array' };
	}
	const parsed: StateDef[] = [];
	const seen = new Set<string>();
	for (const [index, raw] of states.entries()) {
		const state = parseState(raw, index);
		if (typeof state === 'string') return { ok: false, error: state };
		if (seen.has(state.key)) return { ok: false, error: `duplicate state key "${state.key}"` };
		seen.add(state.key);
		parsed.push(state);
	}
	if (typeof initialState !== 'string' || !seen.has(initialState)) {
		return { ok: false, error: 'initialState must be a key in states' };
	}
	return { ok: true, config: { theme: theme as Theme, initialState, states: parsed } };
}

export function applyPatch(config: ProjectConfig, patch: unknown): Outcome {
	if (!isObject(patch)) return { ok: false, error: 'patch must be an object' };
	const next: Record<string, unknown> = { ...structuredClone(config) };
	if (patch.theme !== undefined) next.theme = patch.theme;
	if (patch.initialState !== undefined) next.initialState = patch.initialState;
	if (patch.states !== undefined) {
		if (!Array.isArray(patch.states)) return { ok: false, error: 'states must be an array' };
		const states = [...config.states.map((state) => ({ ...state }))] as Record<string, unknown>[];
		for (const [index, entry] of patch.states.entries()) {
			if (!isObject(entry) || typeof entry.key !== 'string') {
				return { ok: false, error: `states[${index}].key must be a string` };
			}
			const existing = states.findIndex((state) => state.key === entry.key);
			if (existing >= 0) states[existing] = { ...states[existing], ...entry };
			else states.push({ ...entry });
		}
		next.states = states;
	}
	return validateConfig(next);
}
