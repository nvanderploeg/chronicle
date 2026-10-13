import { execFile } from 'node:child_process';
import type { PrChecks, PrReview, PullRequest } from './types.ts';

// Resolves stdout, or null when the tool is missing, signed out, or the call fails.
export type RunCommand = (command: string, args: string[]) => Promise<string | null>;

export const runCommand: RunCommand = (command, args) =>
	new Promise((resolve) => {
		execFile(command, args, { timeout: 15_000, encoding: 'utf8' }, (error, stdout) =>
			resolve(error ? null : stdout)
		);
	});

type Target =
	{ forge: 'github'; url: string } | { forge: 'gitlab'; url: string; project: string; iid: string };

export function prTarget(url: string): Target | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const gitlab = /^\/(.+)\/-\/merge_requests\/(\d+)/.exec(parsed.pathname);
	if (gitlab) {
		const project = parsed.hostname === 'gitlab.com' ? gitlab[1] : `${parsed.host}/${gitlab[1]}`;
		return { forge: 'gitlab', url, project, iid: gitlab[2] };
	}
	if (/^\/[^/]+\/[^/]+\/pull\/\d+/.test(parsed.pathname)) return { forge: 'github', url };
	return null;
}

export function isFinalPr(pr: PullRequest): boolean {
	return pr.state === 'merged' || pr.state === 'closed';
}

interface GhCheck {
	status?: string;
	conclusion?: string;
	state?: string;
}

const FAILED = new Set([
	'FAILURE',
	'ERROR',
	'CANCELLED',
	'TIMED_OUT',
	'ACTION_REQUIRED',
	'STARTUP_FAILURE'
]);
const PENDING = new Set(['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED']);

function ghChecks(rollup: GhCheck[] | undefined): PrChecks | undefined {
	if (!rollup?.length) return undefined;
	const outcomes = rollup.map((c) => c.conclusion || c.state || c.status || '');
	if (outcomes.some((o) => FAILED.has(o))) return 'failing';
	if (rollup.some((c) => (c.status && c.status !== 'COMPLETED') || PENDING.has(c.state ?? '')))
		return 'pending';
	return 'passing';
}

function ghReview(decision: string | undefined): PrReview | undefined {
	if (decision === 'APPROVED') return 'approved';
	if (decision === 'CHANGES_REQUESTED') return 'changes_requested';
	if (decision === 'REVIEW_REQUIRED') return 'pending';
	return undefined;
}

function glabChecks(status: string | undefined): PrChecks | undefined {
	if (!status) return undefined;
	if (status === 'success') return 'passing';
	if (status === 'failed' || status === 'canceled') return 'failing';
	return 'pending';
}

function parseJson(text: string | null): Record<string, unknown> | null {
	if (text === null) return null;
	try {
		const value: unknown = JSON.parse(text);
		return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function compact(pr: PullRequest): PullRequest {
	return Object.fromEntries(Object.entries(pr).filter(([, v]) => v !== undefined)) as PullRequest;
}

// Current status of a PR or MR from its forge's CLI; null when the forge is unknown or unreachable.
export async function fetchPr(
	url: string,
	run: RunCommand = runCommand
): Promise<PullRequest | null> {
	const target = prTarget(url);
	if (!target) return null;
	if (target.forge === 'github') {
		const body = parseJson(
			await run('gh', [
				'pr',
				'view',
				url,
				'--json',
				'number,title,state,isDraft,reviewDecision,statusCheckRollup'
			])
		);
		if (!body) return null;
		const state = String(body.state ?? '').toUpperCase();
		return compact({
			url,
			number: typeof body.number === 'number' ? body.number : undefined,
			title: typeof body.title === 'string' && body.title ? body.title : undefined,
			state:
				state === 'MERGED'
					? 'merged'
					: state === 'CLOSED'
						? 'closed'
						: body.isDraft
							? 'draft'
							: 'open',
			checks: ghChecks(body.statusCheckRollup as GhCheck[] | undefined),
			review: ghReview(body.reviewDecision as string | undefined)
		});
	}
	const body = parseJson(
		await run('glab', ['mr', 'view', target.iid, '--repo', target.project, '--output', 'json'])
	);
	if (!body) return null;
	const state = String(body.state ?? '');
	const pipeline = body.head_pipeline as { status?: string } | null | undefined;
	return compact({
		url,
		number: typeof body.iid === 'number' ? body.iid : Number(target.iid),
		title: typeof body.title === 'string' && body.title ? body.title : undefined,
		state:
			state === 'merged'
				? 'merged'
				: state === 'closed' || state === 'locked'
					? 'closed'
					: body.draft || body.work_in_progress
						? 'draft'
						: 'open',
		checks: glabChecks(pipeline?.status)
	});
}
