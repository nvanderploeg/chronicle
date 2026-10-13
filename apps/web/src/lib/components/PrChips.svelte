<script lang="ts">
	import { prView } from '../ui/meta.ts';
	import type { PullRequest } from '../types.ts';

	let { prs }: { prs: PullRequest[] } = $props();
	const views = $derived(prs.map(prView));

	const STATE = { draft: 'Draft', open: 'Open', merged: 'Merged', closed: 'Closed' } as const;
	const CHECKS = {
		passing: ['✓', 'checks passing'],
		failing: ['✕', 'checks failing'],
		pending: ['●', 'checks running']
	} as const;
	const REVIEW = {
		approved: 'approved',
		changes_requested: 'changes requested',
		pending: 'awaiting review'
	} as const;
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- every href is an external URL -->
{#each views as pr (pr.href)}
	<a
		class="pr state-{pr.state ?? 'unknown'}"
		href={pr.href}
		target="_blank"
		rel="noopener noreferrer"
		title={pr.title ?? pr.href}
		data-testid="pr-chip"
	>
		<span class="ref">{pr.kind} {pr.ref}</span>
		{#if pr.state}<span class="state">{STATE[pr.state]}</span>{/if}
		{#if pr.checks}<span class="checks checks-{pr.checks}" title={CHECKS[pr.checks][1]}
				>{CHECKS[pr.checks][0]}</span
			>{/if}
		{#if pr.review}<span class="review review-{pr.review}">{REVIEW[pr.review]}</span>{/if}
		{#if pr.title}<span class="title">{pr.title}</span>{/if}
	</a>
{/each}

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
	.pr {
		--pc: #7dd3fc;
		display: inline-flex;
		align-items: baseline;
		gap: 0.45rem;
		max-width: 100%;
		padding: 0.15rem 0.6rem;
		border: 1.5px solid color-mix(in srgb, var(--pc) 70%, transparent);
		border-radius: 8px;
		background: color-mix(in srgb, var(--pc) 14%, var(--panel));
		color: var(--ink);
		font-size: 0.82rem;
		text-decoration: none;
	}

	.pr:hover {
		background: color-mix(in srgb, var(--pc) 26%, var(--panel));
	}

	.state-open {
		--pc: #22c55e;
	}

	.state-draft {
		--pc: #9ca3af;
	}

	.state-merged {
		--pc: #a855f7;
	}

	.state-closed {
		--pc: #ef4444;
	}

	.ref {
		font-weight: 700;
		white-space: nowrap;
	}

	.state {
		color: color-mix(in srgb, var(--pc) 65%, var(--ink));
		font-weight: 600;
	}

	.checks-passing {
		color: #16a34a;
	}

	.checks-failing {
		color: #dc2626;
	}

	.checks-pending {
		color: #ca8a04;
	}

	.review {
		color: var(--muted);
	}

	.review-approved {
		color: #16a34a;
	}

	.review-changes_requested {
		color: #dc2626;
	}

	.title {
		min-width: 0;
		overflow: hidden;
		color: var(--muted);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
