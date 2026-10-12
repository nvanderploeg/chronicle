export type StateKind = 'pending' | 'active' | 'blocked' | 'failed' | 'done';
export type Animation = 'none' | 'pulse' | 'shimmer' | 'blink' | 'spin';
export type Theme = 'system' | 'light' | 'dark';

export interface StateDef {
	key: string;
	label: string;
	color: string;
	kind: StateKind;
	icon?: string;
	animation?: Animation;
}

export interface ProjectConfig {
	theme: Theme;
	initialState: string;
	states: StateDef[];
}

export interface ConfigPatch {
	theme?: Theme;
	initialState?: string;
	states?: (Partial<StateDef> & { key: string })[];
}

export interface Tag {
	text: string;
	color?: string;
}

export interface Project {
	id: string;
	name: string;
	config: ProjectConfig;
	createdAt: string;
	lastWriteAt: string;
}

export interface Task {
	id: string;
	projectId: string;
	title: string;
	summary: string;
	state: string;
	note: string;
	createdAt: string;
	updatedAt: string;
	stateSince: string;
	finishedAt: string | null;
}

export interface Node {
	taskId: string;
	path: string;
	parentPath: string | null;
	key: string;
	depth: number;
	title: string;
	state: string;
	note: string;
	tags: Tag[];
	position: number;
	createdAt: string;
	updatedAt: string;
	stateSince: string;
}

export interface Snapshot {
	project: Project;
	tasks: Task[];
	nodes: Node[];
	lastSeq: number;
}

export interface WorkstateEvent {
	seq: number;
	type: 'config' | 'task' | 'node';
	taskId: string | null;
	path: string | null;
	payload: { config: ProjectConfig } | Task | Node;
	at: string;
}
