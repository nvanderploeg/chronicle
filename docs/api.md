# workstate API contract

Every package builds against this file. When behaviour and this file disagree, this file wins until it is changed.

## Domain

- **Project** — a dashboard page. `id` is a UUID v4 and doubles as the public view URL (`/p/<id>`). A secret **write key** is returned once at creation; the server stores only its sha256 hex.
- **Task** — one multi-step job on a project. Server-generated UUID v4. Has its own explicit state, set by agents.
- **Node** — a step or subtask in a task's tree, addressed by a **path** of agent-chosen keys joined by `/` (`chunk-2`, `chunk-2/tests`). Depth 1 = step.
- **State** — a key from the project config. Each state has a **kind**.

## Types

```ts
type StateKind = 'pending' | 'active' | 'blocked' | 'failed' | 'done';
type Animation = 'none' | 'pulse' | 'shimmer' | 'blink' | 'spin';
type Theme = 'system' | 'light' | 'dark';

interface StateDef {
	key: string; // /^[a-z0-9_-]{1,32}$/, unique within a config
	label: string; // non-empty
	color: string; // /^[#a-zA-Z0-9(),.%\s-]{1,64}$/
	kind: StateKind;
	icon?: string; // up to 4 characters, rendered as text
	animation?: Animation; // default 'none'
}

interface ProjectConfig {
	theme: Theme;
	initialState: string; // must be a key in states
	states: StateDef[]; // non-empty, ordered as the legend shows them
}

// PATCH body: fields present replace; states merge by key.
interface ConfigPatch {
	theme?: Theme;
	initialState?: string;
	states?: (Partial<StateDef> & { key: string })[]; // existing key → fields merged; new key → must be a full StateDef, appended
}

interface Tag {
	text: string; // non-empty
	color?: string; // same pattern as StateDef.color
}

interface Project {
	id: string;
	name: string;
	config: ProjectConfig;
	createdAt: string; // ISO 8601 UTC
	lastWriteAt: string;
}

interface Task {
	id: string;
	projectId: string;
	title: string;
	summary: string; // '' when unset
	state: string;
	note: string; // '' when unset
	createdAt: string;
	updatedAt: string;
	stateSince: string; // last time `state` changed
	finishedAt: string | null; // set while state's kind is done or failed
}

interface Node {
	taskId: string;
	path: string; // segments /^[A-Za-z0-9._-]{1,64}$/, total ≤ 512 chars
	parentPath: string | null; // null at depth 1
	key: string; // last path segment
	depth: number; // 1 for a step
	title: string;
	state: string;
	note: string;
	tags: Tag[];
	position: number;
	createdAt: string;
	updatedAt: string;
	stateSince: string;
}

interface Snapshot {
	project: Project;
	tasks: Task[]; // ordered by createdAt desc
	nodes: Node[]; // all nodes of those tasks, ordered by taskId, depth, position
	lastSeq: number; // highest event seq for this project, 0 if none
}

interface WorkstateEvent {
	seq: number;
	type: 'config' | 'task' | 'node';
	taskId: string | null;
	path: string | null;
	payload: { config: ProjectConfig } | Task | Node; // full row snapshot after the write
	at: string;
}
```

Write semantics shared by tasks and nodes:

- `state` omitted on create → `config.initialState`. Unknown `state` → 400 `{ error, validStates: string[] }`.
- When `state` changes and `note` is omitted, `note` resets to `''`. `note` given (including `''`) always wins.
- `stateSince` moves only when `state` changes. `finishedAt` is set when the new state's kind is `done` or `failed`, cleared otherwise.
- Every write bumps the project's `lastWriteAt`, appends one event per changed row, and publishes it.

Node upsert semantics:

- Create when absent; update when present. `title` defaults to `key` on create.
- Missing ancestors are created first (title = key, state = initialState), each with its own event.
- `position` given → set; omitted on create → `1 + max(position)` among siblings (0 when first); omitted on update → unchanged.
- `tags` given → replaces the array; omitted → unchanged.

## HTTP

JSON in and out. Errors are `{ error: string }` (plus `validStates` for unknown states).
Writes (🔑) need `Authorization: Bearer <writeKey>` of the project that owns the target.

| Method | Path                                | Body                                             | Success                                               |
| ------ | ----------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| GET    | `/api/health`                       | —                                                | 200 `{ service: 'workstate', version, db: 'ok' }`; 503 `{ service, version, db: 'unavailable' }` |
| GET    | `/api/presets`                      | —                                                | 200 `{ presets: { name, config }[] }`                 |
| POST   | `/api/projects`                     | `{ name?, preset?, config? }`                    | 201 `{ id, writeKey, url, config }`                   |
| GET    | `/api/projects/:id`                 | —                                                | 200 `Snapshot`                                        |
| PUT 🔑  | `/api/projects/:id/config`          | `ProjectConfig`                                  | 200 `{ config }`                                      |
| PATCH 🔑 | `/api/projects/:id/config`         | `ConfigPatch`                                    | 200 `{ config }`                                      |
| POST 🔑 | `/api/projects/:id/tasks`           | `{ title, summary?, state?, note?, steps? }`     | 201 `{ taskId, url, task, nodes }`                    |
| GET    | `/api/tasks/:taskId`                | —                                                | 200 `{ task, nodes }`                                 |
| GET    | `/api/tasks/:taskId/events`         | query `path?`                                    | 200 `{ events: WorkstateEvent[] }` (seq asc; `path` filters to that node) |
| PATCH 🔑 | `/api/tasks/:taskId`               | `{ title?, summary?, state?, note? }`            | 200 `{ task }`                                        |
| PUT 🔑  | `/api/tasks/:taskId/nodes/<path…>`  | `{ title?, state?, note?, tags?, position? }`    | 200 `{ node }`                                        |
| GET    | `/api/projects/:id/stream`          | header `Last-Event-ID` or query `since`          | 200 `text/event-stream`                               |

- `POST /api/projects`: `name` defaults to `'Untitled project'`; `preset` defaults to `'build-it'`; `config`, when given, is used instead of the preset. Unknown preset or invalid config → 400. `url` = `<origin>/p/<id>`.
- `steps` on task create: `{ key, title?, state?, note?, tags? }[]`, created as depth-1 nodes in array order. `url` = `<origin>/p/<projectId>/t/<taskId>`.
- 401 `{ error: 'missing write key' }` with no bearer token; 403 `{ error: 'invalid write key' }` on mismatch; 404 `{ error: 'project not found' | 'task not found' }`; 400 for malformed ids, paths, or bodies.

## Stream

`GET /api/projects/:id/stream` (404 JSON for an unknown project). Headers: `content-type: text/event-stream`, `cache-control: no-cache`, `x-accel-buffering: no`.

- Replay: with `Last-Event-ID: N` or `?since=N`, first send every project event with `seq > N` in order, then live events. Without either, live only.
- Event frame: `id: <seq>\nevent: <type>\ndata: <JSON payload>\n\n` — `payload` as in `WorkstateEvent`.
- Opening: `: ok\n\n` as soon as the stream opens, before any replay.
- Heartbeat: `: ping\n\n` every `WORKSTATE_HEARTBEAT_MS` (default 25 000).
- Idle: deadline = max(project `lastWriteAt`, stream open time) + `WORKSTATE_IDLE_MS` (default 14 400 000); each published write resets it. At the deadline send `event: idle\ndata: {}\n\n` and close the stream.

## Presets

`build-it` (default): `theme: 'system'`, `initialState: 'queued'`.

| key         | label       | color     | kind    | icon | animation |
| ----------- | ----------- | --------- | ------- | ---- | --------- |
| queued      | Not started | `#9ca3af` | pending | ○    | none      |
| planning    | Planning    | `#f97316` | active  | ◔    | shimmer   |
| in_work     | In work     | `#eab308` | active  | ◑    | pulse     |
| testing     | Testing     | `#a855f7` | active  | ◕    | pulse     |
| needs_input | Needs input | `#ef4444` | blocked | !    | blink     |
| failed      | Failed      | `#ef4444` | failed  | ✕    | none      |
| done        | Completed   | `#22c55e` | done    | ✓    | none      |

## Client files

Under `$XDG_CONFIG_HOME/workstate` (default `~/.config/workstate`), written atomically with mode 0600:

- `projects.json` — `{ [server]: { [repoKey]: { projectId, writeKey, name } } }`. `repoKey` = absolute `git rev-parse --path-format=absolute --git-common-dir` of the cwd, or the cwd's realpath outside git. `name` = basename of the repo root (parent of a common dir named `.git`), else basename of the cwd.
- `tasks.json` — `{ [taskId]: { server, projectId } }`.

Discovery: `WORKSTATE_URL` set → only that server, never another. Otherwise probe `http://localhost:3280` then `https://workstate.nanzero.com` with `GET /api/health` (300 ms timeout, needs 2xx and `service === 'workstate'`), at every task start. Updates go to the server in the task's handle.
