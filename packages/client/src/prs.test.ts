import { describe, expect, it, vi } from 'vitest';
import { fetchPr, isFinalPr, prTarget } from './prs.ts';

const GH = 'https://github.com/me/repo/pull/42';
const GL = 'https://gitlab.com/group/sub/proj/-/merge_requests/7';

const answering = (body: unknown) => vi.fn(async () => JSON.stringify(body));

describe('prTarget', () => {
	it('recognises GitHub pulls and GitLab merge requests, and nothing else', () => {
		expect(prTarget(GH)).toEqual({ forge: 'github', url: GH });
		expect(prTarget(GL)).toEqual({ forge: 'gitlab', url: GL, project: 'group/sub/proj', iid: '7' });
		expect(prTarget('https://git.acme.io/team/app/-/merge_requests/3')).toMatchObject({
			project: 'git.acme.io/team/app'
		});
		expect(prTarget('https://github.com/me/repo/issues/1')).toBeNull();
		expect(prTarget('not a url')).toBeNull();
	});
});

describe('fetchPr on GitHub', () => {
	it('asks gh for the PR and maps state, checks and review', async () => {
		const run = answering({
			number: 42,
			title: 'Add rate limiting',
			state: 'OPEN',
			isDraft: false,
			reviewDecision: 'APPROVED',
			statusCheckRollup: [
				{ status: 'COMPLETED', conclusion: 'SUCCESS' },
				{ status: 'COMPLETED', conclusion: 'SKIPPED' }
			]
		});

		expect(await fetchPr(GH, run)).toEqual({
			url: GH,
			number: 42,
			title: 'Add rate limiting',
			state: 'open',
			checks: 'passing',
			review: 'approved'
		});
		expect(run).toHaveBeenCalledWith('gh', [
			'pr',
			'view',
			GH,
			'--json',
			'number,title,state,isDraft,reviewDecision,statusCheckRollup'
		]);
	});

	it.each([
		[{ state: 'OPEN', isDraft: true }, { state: 'draft' }],
		[{ state: 'MERGED' }, { state: 'merged' }],
		[{ state: 'CLOSED' }, { state: 'closed' }],
		[
			{ state: 'OPEN', statusCheckRollup: [{ status: 'IN_PROGRESS' }, { conclusion: 'SUCCESS' }] },
			{ checks: 'pending' }
		],
		[
			{ state: 'OPEN', statusCheckRollup: [{ status: 'IN_PROGRESS' }, { conclusion: 'FAILURE' }] },
			{ checks: 'failing' }
		],
		[{ state: 'OPEN', statusCheckRollup: [{ state: 'PENDING' }] }, { checks: 'pending' }],
		[{ state: 'OPEN', reviewDecision: 'CHANGES_REQUESTED' }, { review: 'changes_requested' }],
		[{ state: 'OPEN', reviewDecision: 'REVIEW_REQUIRED' }, { review: 'pending' }]
	])('maps %j', async (body, expected) => {
		expect(await fetchPr(GH, answering(body))).toMatchObject(expected);
	});

	it('leaves checks and review out when GitHub reports none', async () => {
		const pr = await fetchPr(
			GH,
			answering({ state: 'OPEN', statusCheckRollup: [], reviewDecision: '' })
		);
		expect(pr).toEqual({ url: GH, state: 'open' });
	});

	it('returns null when gh is missing, signed out or answers garbage', async () => {
		expect(
			await fetchPr(
				GH,
				vi.fn(async () => null)
			)
		).toBeNull();
		expect(
			await fetchPr(
				GH,
				vi.fn(async () => 'not json')
			)
		).toBeNull();
	});
});

describe('fetchPr on GitLab', () => {
	it('asks glab for the MR in its project and maps state and pipeline', async () => {
		const run = answering({
			iid: 7,
			title: 'Draft: thing',
			state: 'opened',
			draft: true,
			head_pipeline: { status: 'running' }
		});

		expect(await fetchPr(GL, run)).toEqual({
			url: GL,
			number: 7,
			title: 'Draft: thing',
			state: 'draft',
			checks: 'pending'
		});
		expect(run).toHaveBeenCalledWith('glab', [
			'mr',
			'view',
			'7',
			'--repo',
			'group/sub/proj',
			'--output',
			'json'
		]);
	});

	it('maps merged, closed and pipeline outcomes', async () => {
		expect(
			await fetchPr(GL, answering({ state: 'merged', head_pipeline: { status: 'success' } }))
		).toMatchObject({
			state: 'merged',
			checks: 'passing'
		});
		expect(
			await fetchPr(GL, answering({ state: 'closed', head_pipeline: { status: 'failed' } }))
		).toMatchObject({
			state: 'closed',
			checks: 'failing'
		});
	});
});

describe('isFinalPr', () => {
	it('is true only for merged or closed', () => {
		expect(isFinalPr({ url: GH, state: 'merged' })).toBe(true);
		expect(isFinalPr({ url: GH, state: 'closed' })).toBe(true);
		expect(isFinalPr({ url: GH, state: 'open' })).toBe(false);
		expect(isFinalPr({ url: GH })).toBe(false);
	});
});
