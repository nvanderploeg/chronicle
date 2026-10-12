import { describe, it, expect } from 'vitest';
import { PRESETS } from '#lib/server/presets.ts';
import { applyPatch, validateConfig } from '#lib/server/config.ts';

const BUILD_IT_STATES = [
	{ key: 'queued', label: 'Not started', color: '#9ca3af', kind: 'pending', icon: '○', animation: 'none' },
	{ key: 'planning', label: 'Planning', color: '#f97316', kind: 'active', icon: '◔', animation: 'shimmer' },
	{ key: 'in_work', label: 'In work', color: '#eab308', kind: 'active', icon: '◑', animation: 'pulse' },
	{ key: 'testing', label: 'Testing', color: '#a855f7', kind: 'active', icon: '◕', animation: 'pulse' },
	{ key: 'needs_input', label: 'Needs input', color: '#ef4444', kind: 'blocked', icon: '!', animation: 'blink' },
	{ key: 'failed', label: 'Failed', color: '#ef4444', kind: 'failed', icon: '✕', animation: 'none' },
	{ key: 'done', label: 'Completed', color: '#22c55e', kind: 'done', icon: '✓', animation: 'none' }
];

function base() {
	return {
		theme: 'light',
		initialState: 'todo',
		states: [
			{ key: 'todo', label: 'To do', color: '#9ca3af', kind: 'pending', animation: 'none' },
			{ key: 'done', label: 'Done', color: '#22c55e', kind: 'done', animation: 'none' }
		]
	};
}

function withState(override: Record<string, unknown>) {
	const c = base();
	c.states[0] = { ...c.states[0], ...override } as (typeof c.states)[0];
	return c;
}

describe('PRESETS', () => {
	it('build-it is the contract preset table with system theme and queued initial state', () => {
		expect(PRESETS['build-it']).toEqual({
			theme: 'system',
			initialState: 'queued',
			states: BUILD_IT_STATES
		});
	});

	it('the build-it preset itself passes validateConfig', () => {
		const result = validateConfig(PRESETS['build-it']);
		expect(result.ok).toBe(true);
	});
});

describe('validateConfig', () => {
	it('accepts a well-formed config and returns it unchanged', () => {
		const input = base();
		const result = validateConfig(input);
		expect(result).toEqual({ ok: true, config: input });
	});

	it('fills animation with none when a state omits it', () => {
		const input = base();
		const { animation: _omitted, ...withoutAnimation } = input.states[0];
		const result = validateConfig({
			...input,
			states: [withoutAnimation, input.states[1]]
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.config.states[0].animation).toBe('none');
	});

	it('accepts rgb() and hsl() colors that use commas, spaces, and percent signs', () => {
		const rgb = validateConfig(withState({ color: 'rgb(10, 20, 30)' }));
		const hsl = validateConfig(withState({ color: 'hsl(120 50% 40%)' }));
		expect(rgb.ok).toBe(true);
		expect(hsl.ok).toBe(true);
	});

	it('rejects a config that is not an object', () => {
		expect(validateConfig(null).ok).toBe(false);
		expect(validateConfig('build-it').ok).toBe(false);
		expect(validateConfig(42).ok).toBe(false);
	});

	it('rejects duplicate state keys', () => {
		const c = base();
		c.states[1] = { ...c.states[1], key: 'todo' };
		const result = validateConfig(c);
		expect(result.ok).toBe(false);
	});

	it.each([
		['uppercase letters', 'Todo'],
		['a space', 'to do'],
		['a dot', 'to.do'],
		['an empty key', ''],
		['a key of 33 characters', 'a'.repeat(33)]
	])('rejects a state key with %s', (_name, key) => {
		const result = validateConfig(withState({ key }));
		expect(result.ok).toBe(false);
	});

	it('accepts a key of exactly 32 characters', () => {
		const key = 'a'.repeat(32);
		const c = base();
		c.initialState = key;
		c.states[0] = { ...c.states[0], key };
		expect(validateConfig(c).ok).toBe(true);
	});

	it('rejects an empty states array', () => {
		const result = validateConfig({ ...base(), states: [] });
		expect(result.ok).toBe(false);
	});

	it('rejects a state with an empty label', () => {
		const result = validateConfig(withState({ label: '' }));
		expect(result.ok).toBe(false);
	});

	it('rejects a state with no color', () => {
		const c = base();
		const { color: _omitted, ...noColor } = c.states[0];
		const result = validateConfig({ ...c, states: [noColor, c.states[1]] });
		expect(result.ok).toBe(false);
	});

	it.each([
		['a semicolon', 'red;background:url(x)'],
		['a colon', 'a:b'],
		['a double quote', 'x"y'],
		['a single quote', "x'y"],
		['a color longer than 64 characters', 'a'.repeat(65)]
	])('rejects a color containing %s', (_name, color) => {
		const result = validateConfig(withState({ color }));
		expect(result.ok).toBe(false);
	});

	it('rejects an unknown state kind', () => {
		const result = validateConfig(withState({ kind: 'stalled' }));
		expect(result.ok).toBe(false);
	});

	it('rejects an unknown animation', () => {
		const result = validateConfig(withState({ animation: 'wobble' }));
		expect(result.ok).toBe(false);
	});

	it('rejects an unknown theme', () => {
		const result = validateConfig({ ...base(), theme: 'neon' });
		expect(result.ok).toBe(false);
	});

	it('rejects an initialState that is not a key in states', () => {
		const result = validateConfig({ ...base(), initialState: 'ghost' });
		expect(result.ok).toBe(false);
	});

	it('rejects an icon longer than 4 characters', () => {
		const result = validateConfig(withState({ icon: 'abcde' }));
		expect(result.ok).toBe(false);
	});

	it('accepts an icon of up to 4 characters', () => {
		const result = validateConfig(withState({ icon: 'abcd' }));
		expect(result.ok).toBe(true);
	});
});

describe('applyPatch', () => {
	it('replaces the theme and leaves states alone', () => {
		const result = applyPatch(base(), { theme: 'dark' });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.config.theme).toBe('dark');
			expect(result.config.states).toEqual(base().states);
		}
	});

	it('moves initialState to another existing key', () => {
		const result = applyPatch(base(), { initialState: 'done' });
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.config.initialState).toBe('done');
	});

	it('merges fields of an existing state by key and keeps its position', () => {
		const result = applyPatch(base(), { states: [{ key: 'done', label: 'Shipped' }] });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.config.states).toEqual([
				{ key: 'todo', label: 'To do', color: '#9ca3af', kind: 'pending', animation: 'none' },
				{ key: 'done', label: 'Shipped', color: '#22c55e', kind: 'done', animation: 'none' }
			]);
		}
	});

	it('appends a new state that is a full StateDef', () => {
		const result = applyPatch(base(), {
			states: [{ key: 'review', label: 'Review', color: '#0ea5e9', kind: 'active', animation: 'pulse' }]
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.config.states.map((s) => s.key)).toEqual(['todo', 'done', 'review']);
			expect(result.config.states[2]).toEqual({
				key: 'review',
				label: 'Review',
				color: '#0ea5e9',
				kind: 'active',
				animation: 'pulse'
			});
		}
	});

	it('rejects a new state key that is missing label, color, or kind', () => {
		const result = applyPatch(base(), { states: [{ key: 'review', label: 'Review' }] });
		expect(result.ok).toBe(false);
	});

	it('rejects a patch whose initialState is not in the resulting states', () => {
		const result = applyPatch(base(), { initialState: 'ghost' });
		expect(result.ok).toBe(false);
	});

	it('accepts an initialState that names a state added in the same patch', () => {
		const result = applyPatch(base(), {
			initialState: 'review',
			states: [{ key: 'review', label: 'Review', color: '#0ea5e9', kind: 'active', animation: 'none' }]
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.config.initialState).toBe('review');
	});

	it('rejects a patch with an unknown theme', () => {
		const result = applyPatch(base(), { theme: 'neon' });
		expect(result.ok).toBe(false);
	});

	it('rejects a merged field that breaks the color pattern', () => {
		const result = applyPatch(base(), { states: [{ key: 'done', color: 'red;' }] });
		expect(result.ok).toBe(false);
	});

	it('rejects a patch that is not an object', () => {
		expect(applyPatch(base(), null).ok).toBe(false);
		expect(applyPatch(base(), 'theme').ok).toBe(false);
	});
});
