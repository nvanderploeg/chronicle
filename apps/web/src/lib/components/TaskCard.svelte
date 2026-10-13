<script lang="ts">
	import { resolve } from '$app/paths';
	import { useBoard } from '../ui/board.svelte.ts';
	import { formatElapsed, isStale, latestActivity, stateOf } from '../ui/dashboard.ts';
	import { totalTokens } from '../ui/meta.ts';
	import type { Task } from '../types.ts';
	import AgentChip from './AgentChip.svelte';
	import Links from './Links.svelte';
	import NodeTree from './NodeTree.svelte';
	import PrChips from './PrChips.svelte';
	import StateMark from './StateMark.svelte';

	let { task, drill = false }: { task: Task; drill?: boolean } = $props();
	const board = useBoard();

	const def = $derived(stateOf(board.config, task.state));
	const nodes = $derived(board.nodesOf(task.id));
	const stale = $derived(isStale(task, nodes, board.config, board.now));
	const flashing = $derived(board.finishing.has(task.id));
	const tokens = $derived(totalTokens(task, nodes));
	const ref = $derived([task.repo, task.branch].filter(Boolean).join(' @ '));
</script>

<article
	class="card state-{task.state} kind-{def.kind}"
	class:stale
	class:flashing
	data-testid="task-card"
	data-task-id={task.id}
	style:--sc={def.color}
>
	<header>
		<div class="heading">
			<h2>{task.title}</h2>
			{#if !drill}
				<a
					class="open"
					href={resolve('/p/[id]/t/[taskId]', { id: task.projectId, taskId: task.id })}
					data-testid="task-link">Open</a
				>
			{/if}
		</div>
		<StateMark {def} variant="pill">
			{def.label} · {formatElapsed(task.stateSince, board.now)}
		</StateMark>
	</header>

	{#if task.prs.length}
		<div class="prs" data-testid="task-prs"><PrChips prs={task.prs} /></div>
	{/if}
	{#if ref || task.agent || tokens || task.links.length}
		<div class="meta" data-testid="task-meta">
			{#if ref}<span class="ref" data-testid="task-ref">{ref}</span>{/if}
			<AgentChip agent={task.agent} {tokens} />
			<Links links={task.links} />
		</div>
	{/if}
	{#if task.summary}<p class="summary">{task.summary}</p>{/if}
	{#if task.note}<p class="note" data-testid="task-note">{task.note}</p>{/if}
	{#if stale}
		<p class="stale-note" data-testid="stale-note">
			No update for {formatElapsed(new Date(latestActivity(task, nodes)).toISOString(), board.now)}
			— agent may have stopped
		</p>
	{/if}

	<div class="steps">
		<NodeTree taskId={task.id} />
	</div>
</article>

<style>
	.card {
		--glow: var(--sc);
		position: relative;
		padding: 1.15rem 1.25rem 1rem 1.6rem;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--panel);
		overflow: hidden;
		transition:
			border-color 0.6s ease,
			filter 0.8s ease,
			opacity 0.8s ease;
	}

	.card::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 0.45rem;
		background: var(--sc);
		transition: background-color 0.6s ease;
	}

	.kind-blocked {
		border-color: color-mix(in srgb, var(--sc) 60%, var(--line));
	}

	.stale {
		filter: grayscale(1);
		opacity: 0.62;
	}

	.flashing {
		animation: flash 0.6s ease-in-out 3;
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem 1rem;
	}

	.heading {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		min-width: 0;
	}

	h2 {
		margin: 0;
		font-size: clamp(1.25rem, 3.4vw, 1.6rem);
		font-weight: 700;
		letter-spacing: -0.015em;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.open {
		flex: none;
		color: var(--muted);
		font-size: 0.82rem;
		text-underline-offset: 3px;
	}

	.open:hover {
		color: var(--ink);
	}

	.prs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.6rem;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.75rem;
		margin-top: 0.5rem;
	}

	.ref {
		color: var(--ink);
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 0.8rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.summary {
		max-width: 62ch;
		margin: 0.55rem 0 0;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.note {
		max-width: 62ch;
		margin: 0.5rem 0 0;
		padding-left: 0.75rem;
		border-left: 3px solid color-mix(in srgb, var(--sc) 70%, transparent);
		color: var(--muted);
		overflow-wrap: anywhere;
		transition: border-color 0.6s ease;
	}

	.stale-note {
		margin: 0.6rem 0 0;
		color: var(--muted);
		font-size: 0.9rem;
		font-style: italic;
	}

	.steps {
		margin-top: 1.1rem;
	}

	@keyframes flash {
		0%,
		100% {
			box-shadow: 0 0 0 0 transparent;
			border-color: var(--line);
		}
		45% {
			box-shadow:
				0 0 0 3px var(--glow),
				0 0 28px color-mix(in srgb, var(--glow) 55%, transparent);
			border-color: var(--glow);
		}
	}

	@keyframes glow {
		0%,
		100% {
			box-shadow: 0 0 0 0 transparent;
		}
		15%,
		70% {
			box-shadow:
				0 0 0 3px var(--glow),
				0 0 28px color-mix(in srgb, var(--glow) 55%, transparent);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.flashing {
			animation: glow 1.5s ease-out 1;
		}
	}
</style>
