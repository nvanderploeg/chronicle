import type { Node, Notice, ProjectConfig, Task } from '../types.ts';
import { childrenOf, runtimeOf, stateOf, stepProgress } from './dashboard.ts';
import { agentParts, formatTokens, totalTokens } from './meta.ts';

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim();
const linkText = (text: string) => oneLine(text).replace(/[[\]]/g, '\\$&');
const linkHref = (url: string) =>
	url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20');
const link = (text: string, url: string) => `- [${linkText(text)}](${linkHref(url)})`;

function nodeLines(
	nodes: Node[],
	taskId: string,
	parentPath: string | null,
	config: ProjectConfig,
	indent: string
): string[] {
	return childrenOf(nodes, taskId, parentPath).flatMap((node) => {
		const note = node.note ? `: ${oneLine(node.note)}` : '';
		const line = `${indent}- ${oneLine(node.title)} (${stateOf(config, node.state).label})${note}`;
		return [line, ...nodeLines(nodes, taskId, node.path, config, `${indent}  `)];
	});
}

export function taskMarkdown(
	task: Task,
	nodes: Node[],
	notices: Notice[],
	config: ProjectConfig,
	now: number
): string {
	const progress = stepProgress(nodes, task.id, config);
	const facts = [
		stateOf(config, task.state).label,
		progress.total ? `${progress.done}/${progress.total} steps` : '',
		runtimeOf(task, now),
		...agentParts(task.agent),
		totalTokens(task, nodes) ? `${formatTokens(totalTokens(task, nodes))} tokens` : ''
	].filter(Boolean);
	const out = [`## ${oneLine(task.title)}`, '', facts.join(' · ')];
	if (task.summary) out.push('', task.summary.trim());
	if (task.note) out.push('', `> ${oneLine(task.note)}`);
	const steps = nodeLines(nodes, task.id, null, config, '');
	if (steps.length) out.push('', '### Steps', ...steps);
	const own = notices.filter((n) => n.taskId === task.id);
	if (own.length) {
		out.push('', '### Notices');
		for (const n of own)
			out.push(`- **${n.kind}**${n.path ? ` (${n.path})` : ''}: ${oneLine(n.text)}`);
	}
	const links = [
		...task.links.map((l) => link(l.label ?? l.url, l.url)),
		...task.prs.map((p) => link(p.title ?? p.url, p.url))
	];
	if (links.length) out.push('', '### Links', ...links);
	return `${out.join('\n')}\n`;
}
