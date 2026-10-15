<script lang="ts">
	import { useBoard } from '../ui/board.svelte.ts';
	import { formatElapsed } from '../ui/dashboard.ts';
	import type { Notice } from '../types.ts';

	let { notices }: { notices: Notice[] } = $props();
	const board = useBoard();
</script>

<ul class="notices" data-testid="notice-list">
	{#each notices as notice (notice.id)}
		{@const status = board.statusOf(notice.id)}
		<li class="notice kind-{notice.kind} status-{status}" data-testid="notice" data-status={status}>
			<div class="head">
				<span class="kind">{notice.kind}</span>
				{#if notice.path}<span class="path">{notice.path}</span>{/if}
				<time datetime={notice.createdAt} title={new Date(notice.createdAt).toLocaleString()}
					>{formatElapsed(notice.createdAt, board.now)} ago</time
				>
			</div>
			<p class="text">{notice.text}</p>
			<div class="actions">
				<button
					type="button"
					aria-pressed={status === 'approved'}
					data-testid="notice-approve"
					onclick={() => board.setNoticeStatus(notice.id, 'approved')}>Approve</button
				>
				<button
					type="button"
					aria-pressed={status === 'flagged'}
					data-testid="notice-flag"
					onclick={() => board.setNoticeStatus(notice.id, 'flagged')}>Flag</button
				>
			</div>
		</li>
	{/each}
</ul>

<style>
	.notices {
		display: grid;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.notice {
		--nc: #eab308;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line);
		border-left: 4px solid var(--nc);
		border-radius: 10px;
		background: var(--panel-2);
	}

	.kind-assumption {
		--nc: #38bdf8;
	}

	.status-flagged {
		--nc: #ef4444;
	}

	.status-approved {
		--nc: #22c55e;
		opacity: 0.7;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 0.7rem;
		font-size: 0.8rem;
	}

	.kind {
		color: color-mix(in srgb, var(--nc) 60%, var(--ink));
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.path {
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		color: var(--muted);
		overflow-wrap: anywhere;
	}

	time {
		margin-left: auto;
		color: var(--muted);
	}

	.text {
		margin: 0.35rem 0 0;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}

	button {
		padding: 0.15rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--panel);
		color: var(--ink);
		font: inherit;
		font-size: 0.82rem;
		cursor: pointer;
	}

	button[aria-pressed='true'] {
		border-color: var(--nc);
		background: color-mix(in srgb, var(--nc) 22%, var(--panel));
		font-weight: 600;
	}

	button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
</style>
