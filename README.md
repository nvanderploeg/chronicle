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

- **Live.** Every write is pushed to open pages over server-sent events; a reconnecting page replays
  what it missed.
- **Tasks, steps, subtasks.** Addressed by path (`chunk-1/tests`), nested to any depth.
- **Tells runs apart.** Repo, branch, tool, model, effort and tokens on every card.
- **Links and pull requests.** Tickets and docs show as chips; PRs show state, checks and review,
  and a task moves to done when its PRs merge.
- **States with meaning.** Rename and recolor states freely; behavior follows each state's kind
  (`pending`, `active`, `blocked`, `failed`, `done`).
- **Celebrates and tidies.** Finished tasks flash and collapse into badges; a blocked task flags the
  tab title.
- **Per-node history**, tags, stale detection and light, dark or system theme.
- **Never in the way.** If no server answers, the agent carries on untracked.
- **Read-only links.** The dashboard URL is safe to share; writing needs a key that stays on the
  machine that created the project.

![The same run in dark mode](docs/captures/dashboard-dark.gif)

## Install

Needs Node.js 22+, pnpm 11 (`corepack enable`), and Docker with compose for the local tracker.

```sh
git clone https://github.com/nvanderploeg/work-state
cd work-state
scripts/install.sh --with-server
workstate doctor
```

This builds the packages, links the `workstate` and `build-it` skills and the CLI, registers the MCP
server with Claude Code (and Codex if present), and starts the tracker on <http://localhost:3280>.
It is safe to re-run; `scripts/uninstall.sh` removes exactly what it added.

## Use it

Agents track work on their own: the `workstate` skill opens a task when work has three or more
steps, runs more than a few minutes or uses subagents, then updates each step as it moves and
shares the dashboard link once. The same is available from the shell:

```sh
id=$(workstate start "Add rate limiting" --step chunk-1="Token bucket core" --step chunk-2="Apply limits" | cut -d' ' -f1)
workstate step "$id" chunk-1 in_work --note "implementing"
workstate step "$id" chunk-1 done
workstate task "$id" review --pr "https://github.com/me/repo/pull/42"
workstate url "$id"
```

![Drilling into a task and opening per-node history](docs/captures/timeline.gif)

## Documentation

- [`docs/usage.md`](docs/usage.md): install flags, MCP tools, full CLI, configuration, server
  discovery, running and deploying the server, simulator, development.
- [`docs/api.md`](docs/api.md), [`docs/client.md`](docs/client.md), [`docs/ui.md`](docs/ui.md):
  the HTTP, client and dashboard contracts.
- [`deploy/`](deploy/README.md): example production configuration.

## License

BSD 3-Clause. See [`LICENSE`](LICENSE).
