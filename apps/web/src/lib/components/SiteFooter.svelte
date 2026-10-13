<!-- eslint-disable svelte/no-navigation-without-resolve -- every href is an external URL -->
<nav class="site" aria-label="About workstate" data-testid="site-footer">
	<a href="https://github.com/nvanderploeg/work-state" target="_blank" rel="noopener noreferrer"
		>github.com/nvanderploeg/work-state</a
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
</nav>

<style>
	.site {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem 1.5rem;
		font-size: 0.85rem;
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
