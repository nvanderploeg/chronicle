import type { ChronicleEvent } from '#lib/types.ts';

type Listener = (event: ChronicleEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(projectId: string, listener: Listener): () => void {
	let set = listeners.get(projectId);
	if (!set) listeners.set(projectId, (set = new Set()));
	set.add(listener);
	return () => {
		set.delete(listener);
		if (set.size === 0 && listeners.get(projectId) === set) listeners.delete(projectId);
	};
}

export function publish(projectId: string, event: ChronicleEvent): void {
	for (const listener of [...(listeners.get(projectId) ?? [])]) {
		try {
			listener(event);
		} catch (error) {
			console.error('chronicle bus listener failed', error);
		}
	}
}
