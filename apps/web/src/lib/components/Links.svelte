<script lang="ts">
	import { linkView } from '../ui/meta.ts';
	import type { Link } from '../types.ts';

	let { links }: { links: Link[] } = $props();
	const views = $derived(links.map(linkView));
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- every href is an external URL -->
{#each views as view, i (i)}
	<a
		class="link"
		href={view.href}
		target="_blank"
		rel="noopener noreferrer"
		title={view.href}
		data-testid="link-chip"
		><span class="site">{view.site}</span>{#if view.text !== view.site}<span class="text"
				>{view.text}</span
			>{/if}</a
	>
{/each}

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
	.link {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35rem;
		max-width: 100%;
		padding: 0.05rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--panel-2);
		color: var(--ink);
		font-size: 0.78rem;
		text-decoration: none;
		white-space: nowrap;
	}

	.link:hover {
		border-color: var(--muted);
	}

	.site {
		color: var(--muted);
		font-weight: 600;
	}

	.text {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
