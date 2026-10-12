<script lang="ts">
	import { useBoard } from '../ui/board.svelte.ts';
	import { formatElapsed, stateOf } from '../ui/dashboard.ts';
	import type { Node } from '../types.ts';
	import type { Timeline } from '../ui/board.svelte.ts';
	import StateMark from './StateMark.svelte';

	let { timeline }: { timeline: Timeline } = $props();
	const board = useBoard();
</script>

<div class="timeline" data-testid="node-timeline">
	{#if timeline.status === 'loading' && timeline.events.length === 0}
		<p class="hint">Loading history</p>
	{:else if timeline.status === 'error' && timeline.events.length === 0}
		<p class="hint">Could not load history. Close and reopen to retry.</p>
	{:else}
		<ol>
			{#each timeline.events as event (event.seq)}
				{@const node = event.payload as Node}
				{@const def = stateOf(board.config, node.state)}
				<li data-testid="timeline-entry">
					<StateMark {def} variant="pill" still>{def.label}</StateMark>
					{#if node.note}<span class="note">{node.note}</span>{/if}
					<time datetime={event.at} title={new Date(event.at).toLocaleString()}
						>{formatElapsed(event.at, board.now)} ago</time
					>
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.timeline {
		margin-top: 0.5rem;
		padding: 0.6rem 0.75rem;
		border-radius: 8px;
		background: var(--panel-2);
	}

	ol {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.7rem;
		font-size: 0.88rem;
	}

	.note {
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--ink);
	}

	time {
		margin-left: auto;
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 0.78rem;
		color: var(--muted);
	}

	.hint {
		margin: 0;
		font-size: 0.88rem;
		color: var(--muted);
	}
</style>
