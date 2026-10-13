import type { ProjectConfig } from '#lib/types.ts';

export const PRESETS: Record<string, ProjectConfig> = {
	'build-it': {
		theme: 'system',
		initialState: 'queued',
		states: [
			{
				key: 'queued',
				label: 'Not started',
				color: '#9ca3af',
				kind: 'pending',
				icon: '○',
				animation: 'none'
			},
			{
				key: 'planning',
				label: 'Planning',
				color: '#f97316',
				kind: 'active',
				icon: '◔',
				animation: 'shimmer'
			},
			{
				key: 'in_work',
				label: 'In work',
				color: '#eab308',
				kind: 'active',
				icon: '◑',
				animation: 'pulse'
			},
			{
				key: 'testing',
				label: 'Testing',
				color: '#a855f7',
				kind: 'active',
				icon: '◕',
				animation: 'pulse'
			},
			{
				key: 'review',
				label: 'In review',
				color: '#7dd3fc',
				kind: 'review',
				icon: '◎',
				animation: 'none'
			},
			{
				key: 'needs_input',
				label: 'Needs input',
				color: '#ef4444',
				kind: 'blocked',
				icon: '!',
				animation: 'blink'
			},
			{
				key: 'failed',
				label: 'Failed',
				color: '#ef4444',
				kind: 'failed',
				icon: '✕',
				animation: 'none'
			},
			{
				key: 'done',
				label: 'Completed',
				color: '#22c55e',
				kind: 'done',
				icon: '✓',
				animation: 'none'
			}
		]
	}
};
