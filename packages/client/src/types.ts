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

export interface ClientOptions {
	env?: Record<string, string | undefined>;
	configDir?: string;
	fetch?: typeof fetch;
	candidates?: string[];
	probeTimeoutMs?: number;
	requestTimeoutMs?: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; warning: string };

export interface StepInput {
	key: string;
	title?: string;
	state?: string;
	note?: string;
	tags?: Tag[];
}

export interface DoctorReport {
	configDir: string;
	pinned: string | null;
	probes: { server: string; ok: boolean; version?: string }[];
	server: string | null;
	repoKey: string;
	registered: { projectId: string; name: string } | null;
}

export interface WorkstateClient {
	discover(): Promise<string | null>;
	startTask(input: {
		title: string;
		summary?: string;
		state?: string;
		note?: string;
		steps?: StepInput[];
		cwd?: string;
	}): Promise<
		Result<{
			taskId: string;
			url: string;
			server: string;
			projectId: string;
			projectUrl: string;
			createdProject: boolean;
		}>
	>;
	updateStep(input: {
		taskId: string;
		path: string;
		title?: string;
		state?: string;
		note?: string;
		tags?: Tag[];
		position?: number;
	}): Promise<Result<{ node: Node }>>;
	updateTask(input: {
		taskId: string;
		title?: string;
		summary?: string;
		state?: string;
		note?: string;
	}): Promise<Result<{ task: Task }>>;
	getTask(input: { taskId: string }): Promise<Result<{ task: Task; nodes: Node[]; url: string }>>;
	configure(input: {
		taskId?: string;
		cwd?: string;
		config?: ProjectConfig;
		patch?: ConfigPatch;
	}): Promise<Result<{ config: ProjectConfig; projectUrl: string }>>;
	projectUrl(input: { taskId?: string; cwd?: string }): Promise<Result<{ url: string }>>;
	doctor(input?: { cwd?: string }): Promise<DoctorReport>;
}
