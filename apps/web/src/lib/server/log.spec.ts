import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from './log.ts';

describe('log', () => {
	afterEach(() => vi.restoreAllMocks());

	function line(event: string, fields?: Parameters<typeof log>[1]): string {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		log(event, fields);
		return spy.mock.calls[0][0] as string;
	}

	it('prints a timestamp, the event and key=value pairs on one line', () => {
		expect(line('project.create', { id: 'p1', ip: '10.0.0.1' })).toMatch(
			/^\d{4}-\d{2}-\d{2}T\S+Z project\.create id=p1 ip=10\.0\.0\.1$/
		);
	});

	it('quotes values with spaces, quotes or equals signs and skips undefined', () => {
		expect(line('x', { name: 'amber quiet fox', a: undefined, b: 'k=v' })).toMatch(
			/ x name="amber quiet fox" b="k=v"$/
		);
	});
});
