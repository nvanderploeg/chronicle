<script lang="ts">
	import { resolve } from '$app/paths';
	import { useBoard } from '../ui/board.svelte.ts';
	import { needsReview } from '../ui/dashboard.ts';
	import NoticeList from './NoticeList.svelte';

	const board = useBoard();

	const filters = [
		{ key: 'open', label: 'To review' },
		{ key: 'flagged', label: 'Flagged' },
		{ key: 'approved', label: 'Approved' },
		{ key: 'all', label: 'All' }
	] as const;
	let filter = $state<(typeof filters)[number]['key']>('open');

	const matches = (id: string) => {
		const status = board.statusOf(id);
		if (filter === 'all') return true;
		if (filter === 'open') return needsReview(status);
		return status === filter;
	};

	// Newest first within a task; tasks in board order.
	const groups = $derived(
		board.tasks
			.map((task) => ({
				task,
				notices: board
					.noticesOf(task.id)
					.filter((n) => matches(n.id))
					.reverse()
			}))
			.filter((g) => g.notices.length)
	);
</script>

<section class="tab" data-testid="notices-tab">
	<div class="filters" role="group" aria-label="Filter notices">
		{#each filters as f (f.key)}
			<button
				type="button"
				aria-pressed={filter === f.key}
				data-testid="notice-filter-{f.key}"
				onclick={() => (filter = f.key)}>{f.label}</button
			>
		{/each}
	</div>

	{#each groups as { task, notices } (task.id)}
		<div class="group" data-testid="notice-group">
			<h2>
				{#if board.only}
					{task.title}
				{:else}
					<a href={resolve('/p/[id]/t/[taskId]', { id: task.projectId, taskId: task.id })}
						>{task.title}</a
					>
				{/if}
			</h2>
			<NoticeList {notices} />
		</div>
	{:else}
		<p class="empty" data-testid="notices-empty">
			{filter === 'open' ? 'Nothing to review.' : 'No notices here.'}
		</p>
	{/each}
</section>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1.1rem;
	}

	.filters button {
		padding: 0.25rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--panel);
		color: var(--ink);
		font: inherit;
		font-size: 0.88rem;
		cursor: pointer;
	}

	.filters button[aria-pressed='true'] {
		border-color: var(--ink);
		font-weight: 600;
	}

	.filters button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.group {
		margin-bottom: 1.5rem;
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	h2 a {
		color: inherit;
		text-underline-offset: 3px;
	}

	.empty {
		margin: 3rem 0;
		color: var(--muted);
		text-align: center;
	}
</style>
