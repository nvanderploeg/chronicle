# workstate

Follow your agents' work progress live.

workstate is a live dashboard for agent work. An agent reports a multi-step task (steps, nested
subtasks, a color-coded state on every node) to a project page, and anyone with the link watches it
update over server-sent events. Agents write through an MCP server or a CLI; the web page is
view-only. It is built for runs like [`build-it`](skills/build-it/SKILL.md): a plan split into
chunks, workers and reviewers running in parallel, and a person who wants to see where it is
without reading a transcript.

![A task moving through planning, in work, testing and done, then collapsing into a badge](docs/captures/dashboard-light.gif)

_The simulator (`scripts/simulate.mjs`) driving the dashboard through a build-it style run._

## Features

- **Live.** Every write is pushed to open pages over SSE; a page that reconnects replays what it
  missed from the last `seq` it saw.
- **Tasks, steps, subtasks.** A task holds steps (`chunk-1`) and subtasks at any depth
  (`chunk-1/tests`), addressed by path and created on first write.
- **States with meaning.** Each state has a label, color, icon, animation and a kind (`pending`,
  `active`, `blocked`, `failed`, `done`). Behavior follows the kind, so you can rename and recolor
  states freely.
- **Celebrates and tidies.** A task entering a done state flashes green and collapses into a badge;
  when every task settles the page frame flashes. A blocked task puts `(!)` in the tab title.
- **Per-node history.** Click a node title to see every transition with its note.
- **Tags.** Short colored labels on a node (`round 2`, `opus`, `worktree`).
- **Stale detection.** A running task with no update for four hours is marked as one the agent may
  have stopped.
- **Light, dark or system theme**, configurable per project.
- **Never in the way.** If no server answers, the agent continues untracked. A tracker failure
  turns into a one-line warning, never an error in the work.
- **Read-only links.** The dashboard URL is safe to share. Writing needs the secret write key,
  which stays on the machine that created the project.

![The same run in dark mode](docs/captures/dashboard-dark.gif)

## Install

### Prerequisites

- Node.js 22 or newer
- pnpm 11, via corepack: `corepack enable` (ships with Node)
- Docker with the compose plugin, to run the local tracker (optional if you point at another
  server)
- Claude Code and/or Codex on `PATH`, if you want the MCP server registered for them

### Steps

```sh
git clone https://github.com/nvanderploeg/work-state
cd work-state
scripts/install.sh --with-server
```

The script installs dependencies (`pnpm install --frozen-lockfile`), builds the client, CLI and MCP
packages, links the skills and CLI, registers the MCP server, and with `--with-server` starts the
local tracker on <http://localhost:3280> and waits for it to be healthy. It is safe to re-run.

| Flag            | Effect                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `--with-server` | Run `docker compose up -d` (MySQL and the app) and wait for `http://localhost:3280/api/health`.                         |
| `--replace`     | Move conflicting paths aside to `<name>.bak-<timestamp>` and re-register the MCP server, instead of skipping them.      |
| `--allow-tools` | Add `mcp__workstate__*` to `permissions.allow` in `~/.claude/settings.json`, so Claude Code stops asking for each tool. |
| `--skip-mcp`    | Do not register the MCP server with Claude Code or Codex (skills and CLI are still linked).                             |
| `--dry-run`     | Print what would happen and change nothing.                                                                             |

Without `--replace`, anything already at a destination that is not ours is left alone and reported
as `skip`.

### What it changes

| Where                                        | What                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `~/.agents/skills/workstate`, `.../build-it` | Symlinks to this checkout's `skills/`.                                            |
| `~/.claude/skills/workstate`, `.../build-it` | Symlinks to the `~/.agents/skills` entries.                                       |
| `~/.local/bin/workstate`                     | Symlink to the built CLI. Add `~/.local/bin` to `PATH` if the installer warns.    |
| Claude Code user config                      | `claude mcp add -s user workstate -- node <checkout>/packages/mcp/dist/index.js`. |
| `~/.codex/config.toml`                       | A `[mcp_servers.workstate]` block (only if `codex` is on `PATH`).                 |
| `~/.config/workstate/install.json`           | A manifest of the above, so uninstall removes exactly what install added.         |
| `~/.claude/settings.json`                    | Only with `--allow-tools`; the original is backed up first.                       |

The checkout is referenced in place, not copied. Do not move it after installing; re-run the
installer if you do.

### Verify

```sh
workstate doctor      # config dir, pin, server probes, repo registration
claude mcp list       # should list workstate and report it connected
curl http://localhost:3280/api/health
```

`workstate doctor` prints which server discovery picks (`server: http://localhost:3280`). Before
the first task in a repo, `registered: no` is normal.

### Uninstall

```sh
scripts/uninstall.sh --dry-run   # preview
scripts/uninstall.sh             # remove links, MCP registrations and the allowlist entry
scripts/uninstall.sh --purge     # also delete projects.json and tasks.json (write keys!)
```

Uninstall touches only what `install.json` recorded for this checkout. Backups (`*.bak-*`) are
listed, never restored or deleted. It does not stop the tracker; use `docker compose down`.

## Use it

### Agents track work on their own

The `workstate` skill tells an agent to open a task when it starts work with three or more steps
that will run more than a few minutes or uses subagents. It does not fire for one-step answers or
quick edits. The agent then:

1. calls `start_task` with a title, one-line summary and planned steps, and shows you the returned
   dashboard link once;
2. calls `update_step` at each transition (state, short note, tags);
3. finishes the task with `update_task` set to `done`, `failed` or `needs_input`.

The first task in a repo creates a project named after the repo and remembers its write key; later
tasks in the same repo reuse it. Subagents get the `taskId` in their brief and write under their
own node path, so parallel workers show up as parallel rows.

![Drilling into a task and opening per-node history](docs/captures/timeline.gif)

### MCP tools

| Tool          | Input                                                               | Does                                                           |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `start_task`  | `title`, `summary?`, `state?`, `note?`, `steps?`, `cwd?`            | Open a task on this repo's project; returns `taskId`, `url`.   |
| `update_step` | `taskId`, `path`, `title?`, `state?`, `note?`, `tags?`, `position?` | Upsert a step or subtask by path (`chunk-2`, `chunk-2/tests`). |
| `update_task` | `taskId`, `title?`, `summary?`, `state?`, `note?`                   | Change the task itself.                                        |
| `get_task`    | `taskId`                                                            | Read a task and its nodes back (use after context compaction). |
| `configure`   | `taskId?`, `cwd?`, `config?`, `patch?`                              | Read, replace or patch the project's states, colors, theme.    |

A failure comes back as a text answer starting with `workstate:` (unreachable, unknown task,
unknown state with the list of valid ones); the agent carries on. Details: `docs/client.md`.

### CLI

```sh
id=$(workstate start "Add rate limiting" --summary "Token bucket per API key" \
      --step chunk-1="Token bucket core" --step chunk-2="Apply limits" | cut -d' ' -f1)

workstate step "$id" chunk-1 in_work --note "implementing" --tag "round 1" --tag "opus|#a855f7"
workstate step "$id" chunk-1/tests testing
workstate task "$id" needs_input --note "Limit per key or per IP?"
workstate task "$id" done --note "https://github.com/me/repo/pull/42"

workstate get "$id"        # JSON of the task and its nodes
workstate url "$id"        # the task page; without an id, the project page
workstate doctor
```

`start` prints `<taskId> <url>`. A state change clears the note unless you pass `--note`.

### With build-it

When the `workstate` skill or MCP tools are available, the `build-it` skill mirrors its run onto the
dashboard (its "Track it" section): chunks become steps with `deps:` tags, prework and workers move
them through planning and in work, a parallel test agent becomes `chunk-N/tests`, a repair round
adds `round 2` and `opus` tags, a one-way-door Stop sets the step and task to `needs_input` with the
question as the note, and the commit sets `done` with `<short sha> <subject>`. The dashboards above
are `scripts/simulate.mjs` replaying exactly that mapping.

### Open and share the dashboard

`start_task` returns the task URL (`<server>/p/<projectId>/t/<taskId>`); `workstate url` prints the
project or task URL any time. Anyone with a dashboard link can watch; nobody can change anything
from the browser. The write key is returned once at project creation and stored in
`~/.config/workstate/projects.json` (mode 0600). Share the link, never the key, and never commit
the registry files.

![A project page that has gone idle](docs/captures/idle.gif)

A page with no writes for the idle window (four hours by default) stops following and offers to
reload.

## Configure

States, colors and the theme live in the project config and change live on open pages.

```sh
workstate config                                  # read the current config
workstate config --theme dark                     # system | light | dark
workstate config --color in_work=#14b8a6          # recolor one state (patch)
workstate config --initial planning               # state new nodes start in
workstate config --file my-config.json            # replace the whole config
workstate config --task <taskId> --color failed=#b91c1c   # target a task's project
```

The `configure` MCP tool takes the same thing as `patch`, which merges states by key; a new state
key needs a full definition (`key`, `label`, `color`, `kind`):

```
configure { patch: { states: [{ key: 'in_work', color: '#14b8a6' }] } }
```

### The default preset

New projects use `build-it` unless `POST /api/projects` names another preset or a `config`. It
starts nodes in `queued` with the `system` theme.

| Key           | Label       | Color     | Kind      | Icon | Animation |
| ------------- | ----------- | --------- | --------- | ---- | --------- |
| `queued`      | Not started | `#9ca3af` | `pending` | ○    | none      |
| `planning`    | Planning    | `#f97316` | `active`  | ◔    | shimmer   |
| `in_work`     | In work     | `#eab308` | `active`  | ◑    | pulse     |
| `testing`     | Testing     | `#a855f7` | `active`  | ◕    | pulse     |
| `needs_input` | Needs input | `#ef4444` | `blocked` | !    | blink     |
| `failed`      | Failed      | `#ef4444` | `failed`  | ✕    | none      |
| `done`        | Completed   | `#22c55e` | `done`    | ✓    | none      |

Task state is set explicitly and does not follow its steps. Entering a `done`-kind state flashes the
card and collapses it into a badge; a `failed`-kind state becomes a red badge.

### Which server

At each task start the client picks a server in this order and uses the first healthy one (a
`GET /api/health` answering with `service: "workstate"` within 300 ms for a loopback address, 2 s
for any other):

1. `WORKSTATE_URL`, when set. This is a pin: only that server is tried, never another.
2. `http://localhost:3280`, the local tracker.
3. `https://workstate.nanzero.com`, the hosted one.

If none answers, the agent continues untracked. Later writes for a task go to the server in that
task's handle (`~/.config/workstate/tasks.json`) without probing again.

```sh
export WORKSTATE_URL=http://localhost:5180   # always use this server
```

## Run the server

**Compose (local tracker).** `docker compose up -d` (or `scripts/install.sh --with-server`) starts
MySQL 8.4 and the app on <http://localhost:3280>; the app applies its migrations at boot.
`pnpm db:start` starts only the database, on `127.0.0.1:3316`.

**Dev mode.** With the database up:

```sh
pnpm install
pnpm db:start
pnpm --filter web dev --port 5180      # defaults DATABASE_URL to workstate_dev on :3316
```

**Built app.** The migrations folder is resolved from the working directory, so run it from
`apps/web`:

```sh
pnpm --filter web build
cd apps/web
DATABASE_URL=mysql://workstate:workstate@127.0.0.1:3316/workstate_dev \
ORIGIN=http://localhost:3000 PORT=3000 node build
```

| Variable                      | Meaning                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | MySQL connection string. Required outside dev and test mode.                                                                                                                     |
| `ORIGIN`                      | Public origin the app is served at. The node adapter builds request URLs from it, so the `url` fields the API returns start with it.                                             |
| `PORT`                        | Port the built app listens on (default 3000).                                                                                                                                    |
| `WORKSTATE_IDLE_MS`           | Quiet time after the last write before a stream sends `idle` and closes. Default 14 400 000 (4 h).                                                                               |
| `WORKSTATE_HEARTBEAT_MS`      | Interval between `: ping` keep-alives on a stream. Default 25 000.                                                                                                               |
| `WORKSTATE_WRITES_PER_MINUTE` | Writes (`POST`/`PUT`/`PATCH` under `/api`) one client address may burst, refilled at this many a minute; the rest get 429 with `Retry-After`. Default 30; 0 turns the limit off. |
| `ADDRESS_HEADER`              | Header the client address is read from behind a proxy (`x-real-ip` with the bundled nginx). Unset: the socket address.                                                           |

The local `compose.yaml` passes only `DATABASE_URL` and `ORIGIN` to the app; set the other
`WORKSTATE_*` variables when running the built app directly or through `deploy/compose.prod.yml`.
Compose reads `WORKSTATE_PORT` (host port, default 3280), `WORKSTATE_ORIGIN`, `MYSQL_PASSWORD`,
`MYSQL_ROOT_PASSWORD` and `MYSQL_PORT` from the environment.

## Simulate and captures

`scripts/simulate.mjs` is a zero-dependency Node script that plays a realistic build-it run through
the HTTP API: a four-chunk task with parallel chunks, a repair round, a one-way-door question, a PR
at the end, then a second task that fails and a third that finishes. It is how the captures above
were made.

```sh
node scripts/simulate.mjs                                   # new project on http://localhost:3280
node scripts/simulate.mjs --server http://localhost:5180 --speed 4
node scripts/simulate.mjs --project <id> --key <writeKey>   # replay into an existing project
node scripts/simulate.mjs --quiet                           # print only the dashboard URL
```

It prints the dashboard URL first, so open it before the run gets going. `--speed n` divides every
delay (one full run takes about 35 seconds at speed 1) and a non-2xx answer ends it with exit code 1.
`simulate({ server, speed, projectId, writeKey, log, onProject })` is also exported.

The Playwright suite in `e2e/` opens the live dashboard while the simulator runs and asserts that the
page reacts: cards appearing, state classes changing, tags, the needs-input block, the flash, the
badges, the frame flash, the timeline and the idle overlay. It starts its own dev server on port
5191 against the dev database, so the database must be up (`pnpm db:start`).

```sh
pnpm exec playwright install chromium   # once
pnpm e2e                                # run the suite (records video)
pnpm captures                           # run it, then rebuild docs/captures/*.gif and dashboard.png
```

`pnpm captures` needs `ffmpeg` on `PATH` and converts each test's video with a two-pass palette
(12 fps, 960 px wide; it lowers both if a GIF would exceed 6 MB).

## API

JSON in and out. Anyone can read; writes need `Authorization: Bearer <writeKey>` of the owning
project.

| Method    | Path                               | Notes                                              |
| --------- | ---------------------------------- | -------------------------------------------------- |
| GET       | `/api/health`                      | Service and database status.                       |
| GET       | `/api/presets`                     | Available state presets.                           |
| POST      | `/api/projects`                    | Create a project; returns `id`, `writeKey`, `url`. |
| GET       | `/api/projects/:id`                | Snapshot: project, tasks, nodes, `lastSeq`.        |
| PUT/PATCH | `/api/projects/:id/config`         | Replace or patch the config (key).                 |
| POST      | `/api/projects/:id/tasks`          | Create a task, optionally with steps (key).        |
| GET       | `/api/tasks/:taskId`               | A task and its nodes.                              |
| GET       | `/api/tasks/:taskId/events`        | History, optionally for one node `path`.           |
| PATCH     | `/api/tasks/:taskId`               | Title, summary, state, note (key).                 |
| PUT       | `/api/tasks/:taskId/nodes/<path…>` | Upsert a step or subtask (key).                    |
| GET       | `/api/projects/:id/stream`         | SSE; resume with `Last-Event-ID` or `?since=`.     |

```sh
curl -s -X POST localhost:3280/api/projects -H 'content-type: application/json' -d '{"name":"demo"}'
# {"id":"…","writeKey":"…","url":"http://localhost:3280/p/…","config":{…}}
```

The full contract, with types, write semantics and the stream format, is in
[`docs/api.md`](docs/api.md); the client, CLI and MCP contract is in
[`docs/client.md`](docs/client.md) and the dashboard helpers are in [`docs/ui.md`](docs/ui.md).

## Deploy

The image is published as `ghcr.io/nvanderploeg/work-state`. [`DEPLOY.md`](DEPLOY.md) covers
the production stack (`deploy/compose.prod.yml`, an nginx server block and certbot) for
`workstate.nanzero.com`, including upgrades and rollback with `WORKSTATE_TAG`.

## Development

```
apps/web/        SvelteKit app: dashboard pages, HTTP API, SSE stream, MySQL via drizzle
packages/client/ discovery, registry files and HTTP calls (@workstate/client)
packages/cli/    the workstate command
packages/mcp/    the workstate-mcp stdio server
skills/          the workstate and build-it agent skills
scripts/         install, uninstall, simulate, captures
e2e/             Playwright capture suite
docs/            contracts (api.md, client.md, ui.md) and captures/
CONTEXT.md       domain vocabulary
```

```sh
pnpm install
pnpm check      # builds the packages, then type-checks every workspace
pnpm lint       # prettier --check and eslint
pnpm format     # prettier --write
pnpm test       # builds the packages, then runs every workspace's tests
```

`pnpm test` uses the compose database (`pnpm db:start`): the web tests run against
`workstate_test` on `127.0.0.1:3316`. The contracts in `docs/` win over the code until they are
edited; [`CONTEXT.md`](CONTEXT.md) holds the vocabulary.

## License

BSD 3-Clause. See [`LICENSE`](LICENSE).
