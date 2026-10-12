# workstate client, CLI and MCP contract

Builds on `docs/api.md` (types, HTTP routes, client files, discovery). Nothing here may throw into an agent's work: every failure becomes a warning.

## `@workstate/client` (`packages/client/src/index.ts`)

```ts
export const DEFAULT_CANDIDATES = ['http://localhost:3280', 'https://workstate.nanzero.com'];
export const UNREACHABLE_WARNING = 'workstate unreachable — continuing untracked';

export interface ClientOptions {
	env?: Record<string, string | undefined>; // default process.env
	configDir?: string; // default `${XDG_CONFIG_HOME ?? ~/.config}/workstate`, read from `env`
	fetch?: typeof fetch; // default globalThis.fetch
	candidates?: string[]; // default DEFAULT_CANDIDATES
	probeTimeoutMs?: number; // loopback hosts; default 300
	remoteProbeTimeoutMs?: number; // every other host; default 2000
	requestTimeoutMs?: number; // default 2000
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
	pinned: string | null; // WORKSTATE_URL, normalised
	probes: { server: string; ok: boolean; version?: string }[];
	server: string | null; // what discover() picked
	repoKey: string;
	registered: { projectId: string; name: string } | null; // registry entry for (server, repoKey)
	registryError: string | null; // why projects.json or tasks.json cannot be read
}

export interface WorkstateClient {
	discover(): Promise<string | null>;
	startTask(input: {
		title: string;
		summary?: string;
		state?: string;
		note?: string;
		steps?: StepInput[];
		cwd?: string; // default process.cwd()
	}): Promise<
		Result<{
			taskId: string;
			url: string; // from the server response
			server: string;
			projectId: string;
			projectUrl: string; // the task `url` minus `/t/<taskId>`
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
		config?: ProjectConfig; // → PUT
		patch?: ConfigPatch; // → PATCH (ignored when config is given)
	}): Promise<Result<{ config: ProjectConfig; projectUrl: string }>>; // neither → read current config
	projectUrl(input: { taskId?: string; cwd?: string }): Promise<Result<{ url: string }>>;
	doctor(input?: { cwd?: string }): Promise<DoctorReport>;
}

export function createClient(options?: ClientOptions): WorkstateClient;
export function repoIdentity(cwd: string): Promise<{ repoKey: string; name: string }>;
```

Also export the `Tag`, `Task`, `Node`, `ProjectConfig`, `ConfigPatch`, `StateDef` types exactly as `docs/api.md` defines them.

Behaviour:

- **discover** — server URLs are normalised by trimming whitespace and trailing `/`. `WORKSTATE_URL` set and non-empty → probe it alone; healthy → it, else `null`; the candidates are never tried. Otherwise the first healthy candidate in order, else `null`. Healthy = `GET <server>/api/health` answers 2xx with JSON `service === 'workstate'` within `probeTimeoutMs` when the host is loopback (`localhost`, `*.localhost`, `127.*`, `[::1]`), else within `remoteProbeTimeoutMs`.
- **startTask** — `discover()`; `null` → `{ ok: false, warning: UNREACHABLE_WARNING }`. Look up `projects.json[server][repoKey]`; absent → `POST /api/projects { name }` and save the entry with the returned `url` as `projectUrl` (`createdProject: true`). Then `POST /api/projects/:id/tasks` with `Authorization: Bearer <writeKey>`, body `{ title, summary, state, note, steps }` (omit undefined fields). If that answers 401, 403 or 404, create a fresh project, overwrite the registry entry, and retry once (`createdProject: true`). Save `tasks.json[taskId] = { server, projectId, projectUrl }`.
- **updateStep / updateTask / getTask** — need `tasks.json[taskId]`; absent → `{ ok: false, warning: 'unknown task <taskId> on this machine — continuing untracked' }`. The write key is the `projects.json[handle.server]` entry whose `projectId` matches. They use `handle.server` only — no discovery. Each path segment is URI-encoded; `/` separators are kept. `getTask`'s `url` = `${projectUrl}/t/${taskId}`.
- **configure / projectUrl** — the project comes from the `taskId` handle when given, else from `projects.json[discover()][repoKey(cwd)]`. Neither → `{ ok: false, warning: 'no workstate project for this repo yet — start a task first' }`. Every returned link starts with the project's `projectUrl` from the handle or registry entry, else `${server}/p/${projectId}`.
- **Rate limit** — a 429 whose `Retry-After` is at most 5 s is waited out and the request sent once more; a longer or missing one is reported like any other rejection.
- **Failures** — network error, timeout (`requestTimeoutMs`) or 5xx → `UNREACHABLE_WARNING`. Other non-2xx → `workstate rejected the update: <error>`, plus ` (valid states: a, b, c)` when the body has `validStates`. Methods never throw or reject.
- **Files** — `projects.json` and `tasks.json` in `configDir` (layout in `docs/api.md`). A missing file reads as `{}`. An unreadable file, or one that is not a JSON object, is never overwritten: the call returns `workstate failed: <path> is not a JSON object; fix or delete it` (or `cannot read <path>`) before contacting a server, and `startTask` checks both files first. Writes create `configDir` (0700) and write to a temp file then rename, mode 0600.
- **repoIdentity** — `git -C <cwd> rev-parse --path-format=absolute --git-common-dir`; success → `repoKey` = that path, `name` = basename of its parent when the path's basename is `.git`, else basename of the path. Failure (not a repo / no git) → `repoKey` = `realpath(cwd)`, `name` = its basename.

## `workstate` CLI (`packages/cli`)

`src/run.ts` exports `run(argv: string[], io: { stdout: (s: string) => void; stderr: (s: string) => void; client?: WorkstateClient }): Promise<number>`; `src/index.ts` calls it with `process.argv.slice(2)` and exits with its code. Parse with `node:util` `parseArgs`.

```
workstate start <title> [--summary s] [--state k] [--note n] [--step key=Title]... [--cwd dir]
    stdout: "<taskId> <url>"
workstate step <taskId> <path> [state] [--title t] [--note n] [--tag text[|color]]... [--position n]
    stdout: "<path> <state>"
workstate task <taskId> [state] [--title t] [--summary s] [--note n]
    stdout: "<taskId> <state>"
workstate get <taskId>
    stdout: JSON of { task, nodes, url }
workstate config [--file path.json] [--theme t] [--color state=color]... [--initial state] [--task id] [--cwd dir]
    --file → PUT that config; --theme/--color/--initial → PATCH; nothing → read. stdout: JSON config
workstate url [taskId] [--cwd dir]
    stdout: the task URL with a taskId, else the project URL
workstate doctor [--cwd dir]
    stdout: human-readable DoctorReport
```

- `--step key=Title` without `=Title` → title omitted. `--tag "round 2|#a855f7"` → `{ text: 'round 2', color: '#a855f7' }`; no `|` → text only. `--color in_work=#14b8a6` → patch `states: [{ key: 'in_work', color: '#14b8a6' }]`. `--position` must be an integer (`--position=-1` for a negative one).
- A `Result` with `ok: false` → stderr `workstate: <warning>` and exit 0.
- Unknown command, missing positional, or bad flag → usage text on stderr, exit 2.

## `workstate-mcp` (`packages/mcp`)

`src/server.ts` exports `createServer(client?: WorkstateClient): McpServer` (from `@modelcontextprotocol/sdk`), server name `workstate`. `src/index.ts` connects it over stdio. Tools, with zod input schemas mirroring the client inputs:

| Tool          | Input                                                                 | Client call  |
| ------------- | --------------------------------------------------------------------- | ------------ |
| `start_task`  | `{ title, summary?, state?, note?, steps?: StepInput[], cwd? }`      | `startTask`  |
| `update_step` | `{ taskId, path, title?, state?, note?, tags?: Tag[], position? }`   | `updateStep` |
| `update_task` | `{ taskId, title?, summary?, state?, note? }`                        | `updateTask` |
| `get_task`    | `{ taskId }`                                                          | `getTask`    |
| `configure`   | `{ taskId?, cwd?, config?: ProjectConfig, patch?: ConfigPatch }`      | `configure`  |

- `ok: true` → one text content item, `JSON.stringify(value)`.
- `ok: false` → one text content item, `workstate: <warning>`. Never `isError`.
- Each tool has a one-sentence description an agent can act on; `start_task`'s says to show the returned `url` to the user once.
