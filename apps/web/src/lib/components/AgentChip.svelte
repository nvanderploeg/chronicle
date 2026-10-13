<script lang="ts">
	import { agentParts, formatTokens } from '../ui/meta.ts';
	import type { AgentInfo } from '../types.ts';

	let { agent, tokens }: { agent: AgentInfo | null; tokens?: number } = $props();
	const parts = $derived(agentParts(agent));
	const count = $derived(tokens ?? agent?.tokens);
</script>

{#if parts.length || count}
	<span class="agent" data-testid="agent-chip">
		{#each parts as part, i (i)}<span class="part">{part}</span>{/each}
		{#if count}<span class="tokens" title="{count.toLocaleString()} tokens"
				>{formatTokens(count)} tokens</span
			>{/if}
	</span>
{/if}

<style>
	.agent {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 0.4rem;
		color: var(--muted);
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 0.76rem;
	}

	.part + .part::before,
	.part + .tokens::before {
		content: '·';
		margin-right: 0.4rem;
	}

	.tokens {
		color: var(--ink);
		font-weight: 600;
	}
</style>
