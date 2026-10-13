import { describe, expect, it } from 'vitest';
import { moniker } from './moniker.ts';

describe('moniker', () => {
	it('is three capitalised words', () => {
		expect(moniker()).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+$/);
	});

	it('rarely repeats across a handful of projects', () => {
		const names = new Set(Array.from({ length: 50 }, moniker));

		expect(names.size).toBeGreaterThan(45);
	});
});
