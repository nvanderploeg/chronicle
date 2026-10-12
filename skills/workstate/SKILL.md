---
name: workstate
description: "Track multi-step work live on a workstate dashboard. Use when starting work with 3 or more distinct steps that will run more than a few minutes or uses subagents; not for single-step answers, quick edits or pure Q&A."
---

# Workstate

A workstate dashboard shows a task as steps and nested subtasks, live. The site is view-only; you write through tools. Tracking is a side channel: it never blocks, delays or fails the real work.

## Pick the channel

1. The MCP tools `start_task`, `update_step`, `update_task`, `get_task`, `configure`. In Claude Code they are `mcp__workstate__*` and may be deferred: load them with ToolSearch, query `workstate`. Codex sees them as tools of server `workstate`.
2. Otherwise the `workstate` CLI, if it is on PATH.
3. Neither: skip tracking silently and do the work.

## Track the work

1. **Start.** Call `start_task` with a title, a one-line summary and the planned steps. Keys are short and stable (`step-1`, or a slug like `parser`); they are the addresses every later write uses. Show the returned `url` to the user once.
2. **Update at each transition.** `update_step` with the step's `path`, its new `state`, a short `note` and `tags` where they help (`round 2`, `opus`). A state change clears the note unless you pass one. Subtasks are nodes below a step: `path: "step-1/tests"` creates it, and any missing ancestor.
3. **Hand off.** Any agent holding the `taskId` may write any node; the last write wins. Put `workstate: task <taskId>` and the node path the subagent works under in every subagent brief. Subagents add subtasks under that path.
4. **Re-sync.** After context compaction, call `get_task` for the real state of every node before writing again.
5. **Finish.** Set the task's state with `update_task` to a done-, failed- or blocked-kind state: `done`, `failed` or `needs_input` in the default preset. Entering a done-kind state makes the dashboard celebrate and collapse the task into a badge.

States are keys from the project's config. The default preset:

| key | meaning | kind |
|---|---|---|
| `queued` | not started (initial) | pending |
| `planning` | being planned | active |
| `in_work` | being built | active |
| `testing` | being verified | active |
| `needs_input` | waiting on a person | blocked |
| `failed` | gave up | failed |
| `done` | completed | done |

The task has its own state; set it explicitly, it does not follow the steps.

## Warnings

A tool answer starting with `workstate:` is a warning (unreachable server, unknown task, unknown state). Continue the real work and do not retry. An unknown-state warning lists the valid states; use one of them next time.

## CLI

```
workstate start "<title>" --summary "<s>" --step step-1="Title" --step step-2="Title"   # prints: <taskId> <url>
workstate step <taskId> <path> <state> --note "<n>" --tag "round 2" --tag "opus|#a855f7"
workstate task <taskId> <state> --note "<n>"
workstate get <taskId>                                                                  # prints JSON
```

## Configure

Colors, states and theme change through `configure` (CLI: `workstate config`), as a patch that merges states by key:

```
configure { patch: { states: [{ key: 'in_work', color: '#14b8a6' }] } }
workstate config --color in_work=#14b8a6
```

A new state key needs a full definition (`key`, `label`, `color`, `kind`). `configure` with no `patch` or `config` reads the current config.
