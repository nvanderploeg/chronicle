<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { StateDef } from '../types.ts';

	let {
		def,
		variant = 'dot',
		still = false,
		children
	}: {
		def: StateDef;
		variant?: 'dot' | 'pill';
		still?: boolean;
		children?: Snippet;
	} = $props();

	const animation = $derived(still ? 'none' : (def.animation ?? 'none'));
</script>

<span
	class="mark {variant} anim-{animation} state-{def.key} kind-{def.kind}"
	style:--sc={def.color}
	data-testid="state-mark"
>
	<span class="glyph" aria-hidden="true">{def.icon ?? ''}</span>
	{#if children}<span class="text">{@render children()}</span>{/if}
</span>

<style>
	.mark {
		--tint: color-mix(in srgb, var(--sc) 20%, var(--panel, transparent));
		--edge: color-mix(in srgb, var(--sc) 55%, transparent);
		--text: color-mix(in srgb, var(--sc) 58%, var(--ink, currentColor));
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		gap: 0.4em;
		border: 1.5px solid var(--edge);
		border-radius: 999px;
		background-color: var(--tint);
		color: var(--text);
		line-height: 1;
		white-space: nowrap;
		transition:
			background-color 0.6s ease,
			border-color 0.6s ease,
			color 0.6s ease;
	}

	.dot {
		width: 1.45rem;
		height: 1.45rem;
		font-size: 0.78rem;
	}

	.pill {
		padding: 0.34em 0.8em 0.34em 0.62em;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.glyph {
		display: inline-block;
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-weight: 700;
	}

	.text {
		font-variant-numeric: tabular-nums;
	}

	.anim-pulse {
		animation: ring 2s ease-out infinite;
	}

	.anim-shimmer {
		background-image: linear-gradient(
			100deg,
			transparent 25%,
			color-mix(in srgb, var(--sc) 38%, transparent) 50%,
			transparent 75%
		);
		background-size: 250% 100%;
		animation: sweep 1.8s linear infinite;
	}

	.anim-blink {
		animation: blink 1.1s steps(2, jump-none) infinite;
	}

	.anim-spin .glyph {
		animation: spin 1.6s linear infinite;
	}

	@keyframes ring {
		0% {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--sc) 55%, transparent);
		}
		70%,
		100% {
			box-shadow: 0 0 0 0.55rem transparent;
		}
	}

	@keyframes sweep {
		from {
			background-position: 150% 0;
		}
		to {
			background-position: -50% 0;
		}
	}

	@keyframes blink {
		0% {
			opacity: 1;
		}
		100% {
			opacity: 0.3;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mark,
		.glyph {
			animation: none;
		}
	}
</style>
