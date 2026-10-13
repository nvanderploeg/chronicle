import type {
	AgentInfo,
	Link,
	Node,
	ProjectConfig,
	PullRequest,
	StateKind,
	Task
} from '../types.ts';

export function formatTokens(n: number): string {
	if (n < 1000) return String(n);
	if (n < 1_000_000) return `${trim(n / 1000)}k`;
	return `${trim(n / 1_000_000)}M`;
}

const trim = (value: number) => (value >= 100 ? Math.round(value) : Number(value.toFixed(1)));

// The task's own tokens plus every node's: subagents report on their node, the lead on the task.
export function totalTokens(task: Task, nodes: Node[]): number {
	return nodes.reduce((sum, node) => sum + (node.agent?.tokens ?? 0), task.agent?.tokens ?? 0);
}

export function agentParts(agent: AgentInfo | null): string[] {
	if (!agent) return [];
	return [agent.tool, agent.model, agent.effort].filter((part): part is string => !!part);
}

export interface LinkView {
	href: string;
	site: string;
	text: string;
}

const SITES: [RegExp, string][] = [
	[/(^|\.)github\.com$/, 'GitHub'],
	[/(^|\.)gitlab\.com$/, 'GitLab'],
	[/(^|\.)trello\.com$/, 'Trello'],
	[/(^|\.)linear\.app$/, 'Linear'],
	[/(^|\.)atlassian\.net$/, 'Jira'],
	[/(^|\.)notion\.(so|site)$/, 'Notion'],
	[/^docs\.google\.com$/, 'Google Docs'],
	[/^claude\.ai$/, 'Claude']
];

function githubText(path: string): string | undefined {
	const match = /^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/.exec(path);
	return match ? `${match[2]}#${match[4]}` : undefined;
}

export function linkView(link: Link): LinkView {
	let url: URL;
	try {
		url = new URL(link.url);
	} catch {
		return { href: link.url, site: 'Link', text: link.label ?? link.url };
	}
	const host = url.hostname.replace(/^www\./, '');
	const site = SITES.find(([pattern]) => pattern.test(host))?.[1] ?? host;
	const fallback = (site === 'GitHub' && githubText(url.pathname)) || site;
	return { href: url.href, site, text: link.label ?? fallback };
}

const EYE_ORDER: StateKind[] = ['blocked', 'failed', 'active', 'review', 'pending', 'done'];

// The tab icon's frame: the most urgent kind any task is in, so a glance at the tab says enough.
export function eyeColor(tasks: Task[], config: ProjectConfig): string | null {
	const kinds = new Set(
		tasks.map((task) => config.states.find((s) => s.key === task.state)?.kind ?? 'pending')
	);
	const kind = EYE_ORDER.find((k) => kinds.has(k));
	if (!kind) return null;
	return config.states.find((s) => s.kind === kind)?.color ?? null;
}

export const ORANJE = '#ff6600';

// `frame` colours the triangle and the lid; the iris stays oranje.
export function eyeSvg(frame: string = ORANJE): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 4 61 58H3Z" fill="#121c25" stroke="${frame}" stroke-width="6" stroke-linejoin="round"/><path d="M12 42q20-22 40 0-20 16-40 0Z" fill="#f8f4e3" stroke="${frame}" stroke-width="4"/><circle cx="32" cy="40" r="9" fill="${ORANJE}"/><circle cx="32" cy="40" r="4" fill="#121c25"/></svg>`;
}

export interface PrView {
	href: string;
	kind: 'PR' | 'MR';
	ref: string;
	title: string | null;
	state: PullRequest['state'] | null;
	checks: PullRequest['checks'] | null;
	review: PullRequest['review'] | null;
}

export function prView(pr: PullRequest): PrView {
	const mr = /\/-\/merge_requests\/\d+/.test(pr.url);
	const number = pr.number ?? Number(/\/(?:pull|merge_requests)\/(\d+)/.exec(pr.url)?.[1]);
	return {
		href: pr.url,
		kind: mr ? 'MR' : 'PR',
		ref: Number.isFinite(number) ? `${mr ? '!' : '#'}${number}` : '',
		title: pr.title ?? null,
		state: pr.state ?? null,
		checks: pr.checks ?? null,
		review: pr.review ?? null
	};
}
