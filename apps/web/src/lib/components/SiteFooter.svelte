<script lang="ts">
	const repo = 'https://github.com/nvanderploeg/chronicle';
	const hash = __GIT_HASH__;
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- every href is an external URL -->
<nav class="site" aria-label="About chronicle" data-testid="site-footer">
	<a href="https://github.com/nvanderploeg/chronicle" target="_blank" rel="noopener noreferrer"
		>github.com/nvanderploeg/chronicle</a
	>
	<a href="https://nanzero.com" target="_blank" rel="noopener noreferrer"
		>Powered by <strong>Nanzero</strong></a
	>
	<a
		href="https://ko-fi.com/skadiarchery"
		target="_blank"
		rel="noopener noreferrer"
		data-testid="kofi-link">☕ Buy me a coffee</a
	>
	<span class="build" data-testid="build-stamp"
		>v{__APP_VERSION__} ·
		{#if hash === 'unknown'}{hash}{:else}<a
				href="{repo}/commit/{hash}"
				target="_blank"
				rel="noopener noreferrer"><span class="hash">{hash}</span></a
			>{/if}</span
	>
</nav>

<style>
	.site {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem 1.5rem;
		font-size: 0.85rem;
	}

	.build {
		opacity: 0.7;
		font-variant-numeric: tabular-nums;
	}

	.hash {
		font-family: ui-monospace, monospace;
	}

	a {
		color: inherit;
		text-underline-offset: 3px;
		overflow-wrap: anywhere;
	}

	a:hover {
		color: var(--ink, var(--fg));
	}
</style>
