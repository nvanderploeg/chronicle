---
name: build-it
description: Build a plan or a single ticket unattended — worker/reviewer rounds on a working branch, independent chunks in parallel worktrees and the next one researched while the current builds, each committed green, open questions queued rather than asked.
disable-model-invocation: true
---

# Build It

You are the **orchestrator**. You hold the plan, cut it into **chunks**, and dispatch each one. The implementation is typed by a **worker** agent — your hands stay on the research, the branch, the verdicts, and the nits.

Each chunk runs **rounds**: a worker implements it, then a **fresh** reviewer attacks the result. Rounds repeat until nothing structural is left, and the chunk lands as one commit on the working branch. A second round escalates to a stronger model and a fuller brief; a third means the chunk was cut wrong, not built wrong.

Chunks that share the working directory run one at a time — workers will stash, reset, and clobber each other if two run at once. Chunks that share nothing run side by side, each in its own worktree. And no serial step starts cold: the next chunk is researched while the current one is still building, and a chunk's tests are written beside the work rather than after it, by an agent that never sees it.

## Make the call

You run this to the PR on your own. The plan is your mandate: whatever it settled is settled, and you build it rather than re-confirming it. Every question it left open is yours to answer, in one of three ways:

- **Decide it** — you know the answer: the plan implies it, the surrounding code answers it, or the choice is reversible. Pick the option consistent with what is already there, put it in the worker brief so the chunk is built on it, and name it in the commit. A bug you found and know how to fix is a decision, not a discovery — fix it in the code this chunk already touches. Writing it down is what you do when you can't fix it here, never instead of fixing it.
- **Queue it** — you genuinely cannot answer it, or the answer lives outside anything this build touches. Take the narrowest reversible option that unblocks the code and write the question down as you make the call, so it rides along in that chunk's commit: design questions to the project's grill queue (docs/grill-queue.md, in the shape of the entries already there — create it if absent), engineering ones to its issue tracker. An entry that resolves itself on reading should have been a code comment.
- **Stop** — a **one-way door**: destroying data, moving money, breaking a published contract or a shipped migration, with no defensible default. Bring it to the user with your recommendation and wait.

Stopping is for the one-way door, not for the merely hard question.

## 1. Ground yourself

Research first — the worker gets one brief and cannot ask you follow-ups, so every ambiguity you leave becomes an invention it makes up.

Read the source of the work (the ticket, plan, spec, or conversation), then the code it lands in: the modules it touches, the conventions of those files, the project's `CLAUDE.md` and any ADR governing the area, and the existing tests around it.

You are grounded when, for every chunk you are about to cut, you can name the files it touches, the behaviour that proves it works, and the **narrow test command** that runs in seconds over just that behaviour.

## 2. Branch and cut the chunks

Create the working branch off the default branch (or enter a worktree if this session is isolated). Everything below commits there — never to `main`.

Cut the work into chunks. A chunk is a vertical slice sized to fit one fresh context window, landing green on its own. A single ticket is usually **one chunk** — don't manufacture more.

Name each chunk's dependencies: the chunks whose commits it needs, and the files it touches. That gives you both orders at once — the sequence chained chunks must run in, and the chunks that chain to nothing and can run beside each other.

Post the chunk list — title, what it delivers, what it depends on, its narrow test command — then start the first chunk and stage the second.

## Track it

Applies only when the `chronicle` skill or the `chronicle` MCP tools are available; otherwise skip this section entirely. Invoke the `chronicle` skill, then mirror the run onto the dashboard:

| build-it moment | chronicle write |
|---|---|
| grounding | `start_task` (plan title, summary, `agent`, the issue in `links`), task state `planning` |
| chunk list posted | each chunk as step `chunk-N`, state `queued`, tag `deps:…`, with known subtasks (`tests`) nested |
| prework for chunk N | `chunk-N` → `planning`, note `prework`, `agent.model` the prework model |
| worker dispatched | `chunk-N` → `in_work`, tags `round 1`, `worktree` or `serial`, `agent` the worker's tool, model, effort; task → `in_work` |
| parallel test agent | subtask `chunk-N/tests` → `in_work`; → `testing` at reconcile |
| reviewer dispatched | `chunk-N` → `testing`, note `review round N` |
| structural → repair round | `chunk-N` → `in_work`, tag `round 2`, `agent.model` the repair model |
| re-cut (round 3) | `chunk-N` → `planning`, note `re-cut`; pieces as `chunk-N/a`, `chunk-N/b` … |
| comment sweep | `chunk-N` → `testing`, note `comment sweep` |
| commit | `chunk-N` → `done`, note `<short sha> <subject>`, `agent.tokens` the chunk's workers used |
| stashed / stuck | `chunk-N` → `failed`, note the stash name |
| question queued | tag `queued:grill` or `queued:issue` on the chunk |
| Stop (one-way door) | the step and the task → `needs_input`, note = the question |
| close-out full suite | task → `testing`, note `full suite` |
| draft PR opened | task → `review`, `prs: [{ url }]`, `agent.tokens` the lead used; it moves to `done` when the PR merges |

## 3. Run the chunks

**Independent chunks run together.** Dispatch each with `isolation: "worktree"` so it gets its own checkout and no two workers reach for the same files. A worktree chunk runs the whole round loop below inside its worktree and **commits there** when it comes up green; you cherry-pick it onto the working branch in dependency order. Everything else is unchanged.

**Chained chunks run one at a time** in the working tree, in dependency order — and while one is in flight, you stage the next.

### Stage the next chunk

The serial lane is where the clock goes, so never let it run empty. The moment you dispatch a chunk, dispatch a **prework** agent for the one after it — `model: "sonnet"`, read-only, running alongside — using the prework brief below.

Prework **gathers; it never decides**. The calls are yours and stay yours (*Make the call*): a prework agent records an open question, it does not answer one.

**Check it when you spend it, not when it lands.** Prework is researched against a tree the in-flight chunk is still changing, so it goes stale as it sits. Before folding it into a worker brief, pass it to a fresh `Agent`, `model: "haiku"`, with the freshness brief below — a fact check against the current tree, not a review. What holds goes into the brief's **Context** already written; what comes back stale or wrong you drop or repair yourself. Where prework and the tree disagree, the tree wins.

A chunk dispatched with checked prework in its brief starts on the code instead of starting on the search.

### Write the tests beside the work

Where a chunk's tests are substantial and its interface can be named in advance, they are written in parallel with the implementation instead of after it.

**Declare the contract first.** Before dispatching either agent, write down what they will both build against: the function and route signatures, the request and response shapes, the error cases, the states the behaviour moves between. It goes into both briefs, word for word. Prework is where it comes from — it names the conventions and the code being reused, which is what keeps a contract in the codebase's own dialect instead of inventing a new one.

If you cannot name the contract, **do not split the tests out** — the worker writes them as part of the chunk, as before. Skip the split too where the chunk's test is three assertions: the coordination costs more than the parallelism returns.

**Dispatch them together.** The worker as always, in the working tree. The test agent alongside it — `model: "sonnet"`, `isolation: "worktree"` — writing **only test files**, and never seeing the implementation. That blindness is the whole point: a test written against the contract is evidence, a test written against the finished code is a mirror.

**Reconcile when the work lands.** Copy the test files into the working tree and run them.

A failure here is two agents that never spoke disagreeing, which means one of them left the contract. Rule it, don't patch it:

- the **implementation** deviated → a finding against the chunk, fixed like any other
- the **test** misread the contract → fix the test
- the **contract** was silent or wrong → yours to settle, and name the call in the commit

Never edit a test merely to make it green. That single move is what this whole arrangement exists to prevent, and from the outside it is indistinguishable from the bug it was supposed to catch.

Then the rounds run over implementation and tests together.

### Run the rounds

For each chunk, in order:

**Dispatch the worker.** A fresh `Agent` call, `model: "sonnet"`, using the worker brief below. Never a fork — the worker gets its context from the brief, not from your conversation.

**Dispatch the reviewer.** A fresh `Agent` call, `model: "sonnet"` on a first round — a new agent every round, never a fork, never the worker continued, so it reads the diff cold with no memory of why the code looks like it does. Use the review brief below, and fill in its map from your own grounding: you already hold the files, the governing ADRs and the test command, so the reviewer's round is spent attacking the diff rather than rediscovering them.

**Rule the verdict.** Each finding is one of two things:

- **Nit** — you can fix it without re-deciding how the chunk works: naming, a missed error case, a stray log, a thin test, a DTO field. Fix nits yourself, then re-run the narrow tests.
- **Structural** — the finding says the chunk is built wrong: wrong seam, wrong data shape, a broken contract, behaviour the brief asked for that isn't there. Send another round, and **escalate it**: a fresh worker on `model: "opus"` carrying the repair brief below, then a fresh reviewer on `model: "opus"` over the new diff.

Escalate on the second round because it is nearly free and nearly decisive. Rounds are rare, so the stronger model is paid for on a fraction of chunks — while a third round costs a re-cut and every round already spent on that chunk. The second round is also where the brief itself is on trial: round one missing something usually means the brief was thin, so the repair brief carries what round one built, why the finding is structural, and what must be left alone.

A third round means the chunk was mis-cut, not that the workers are weak — so re-cut it yourself: split it at the seam the reviewer keeps hitting and run the smaller pieces from round one, on the ordinary model. A stronger agent has already been tried by then; the cut is what is left. If a re-cut piece reaches a third round again, `git stash` it under a name that says what it was, and carry on with the chunks that do not depend on it; it goes in your close-out report as stuck.

**Sweep the comments.** With the rounds settled and before anything is committed, dispatch a fresh `Agent`, `model: "haiku"`, carrying the comment brief below. It flags; it never edits. Comments are what a reviewer waves through — they look harmless beside a real finding, and each round of workers leaves another one narrating itself into the tree.

Every flag is a **nit**, and the rewrite is yours: cut it or rewrite it by hand, in your own words. Never send a comment back to a worker — an agent asked to fix a comment writes a longer one. A flag you disagree with you overrule; you hold the rules, and haiku is reading them literally.

**Commit.** With the narrow tests green, the comments swept, and nothing structural outstanding, commit the chunk to the working branch with a message naming the behaviour it delivers. One chunk, one commit. Then start the next chunk.

## 4. Close out

Once every chunk is committed, run the **full suite** — the whole unit/integration run and the E2E tests, the ones you kept out of the chunk loop. Failures here are usually seams between chunks: fix them yourself if they are nits, dispatch a repair round if they are structural. A repair round here commits like any other — sweep its comments first.

Do a brief search in issues and grill queue for anything that may have been fixed in passing, remove fully resolved issues, do not otherwise edit or append to any issue.

Report what you ran and what it said, including anything still red, the calls you made, what you queued,  anything you queued or filed with one line each on why the fix didn't belong in this build, and anything left stashed and stuck. Fold in every worktree — cherry-picked and removed, or named in the report as stuck — so none is left stranded on disk. Then push the branch and open a draft PR describing the chunks in order.
When tracking, set the task's final state as part of this step: `done` with the PR URL, or `failed` or `needs_input` if the build ends short.

<worker-brief>

**Chunk:** what this chunk delivers, in behaviour, from the user's perspective.

**Context:** the files it lands in, the conventions and ADRs that govern them, the existing code it must reuse rather than reinvent, and the decisions already made (so the worker implements them instead of re-litigating them).

**Contract:** the names and shapes this chunk exposes — signatures, routes, request and response bodies, error cases. Build exactly these. If one of them is wrong, say so in your hand-back rather than quietly picking a better name: another agent is writing tests against this same contract right now, and cannot see what you chose instead.

**Scope:** what is explicitly out — the later chunks, the refactors that are not yours, the files not to touch.

**Chronicle** (only when tracking): task <taskId>, node chunk-N — add notes or subtasks under it.

**Definition of done:**
- The behaviour above works, and you have proven it — with `<narrow test command>` where those tests already exist, by running the code where they do not.
- **Tests:** write them as part of this chunk, *unless this brief says they are being written in parallel* — then they are not yours, and building to the contract above is what makes them pass.
- Do NOT run the full suite or E2E tests — they run once, at the end, and are not yours.
- Do NOT commit. Leave the work in the working tree.

Where this brief is silent, take the option the surrounding code already implies and keep going.

**Hand back:** the files you changed and why, every call you made that the brief didn't cover, anywhere you had to leave the contract and what you did instead, and the output of the narrow test run.

</worker-brief>

<test-brief>

**Chunk:** what this chunk delivers, in behaviour, from the user's perspective.

**Contract:** the names and shapes it exposes — signatures, routes, request and response bodies, error cases. Identical, word for word, to the one the implementer holds.

Write the tests that prove the behaviour. Another agent is building the implementation right now from that same contract, and **you will not see its work** — that is deliberate, not an oversight. Write against the contract; never against a guess at how it will be built.

**Context:** where the tests belong, the test conventions and helpers this project keeps, the fixtures and factories to reuse rather than rebuild.

**Chronicle** (only when tracking): task <taskId>, node chunk-N/tests — add notes or subtasks under it.

**Definition of done:**
- The behaviour is covered: the ordinary path, the edges, and every error case the contract names.
- Each test fails for a reason it states, and would fail if the behaviour were missing. A test that passes against an empty implementation is worse than no test.
- Write **only test files**. Do not write, stub, or scaffold the implementation — not even to get your tests to compile.
- Your tests will not pass yet, and there is nothing to run them against. That is expected. Do not go looking for the implementation, and do not soften an assertion to make something green.
- Do NOT commit.

**Hand back:** the test files you wrote and what each one covers, plus every place the contract was silent or ambiguous — those gaps are worth as much as the tests.

</test-brief>

<repair-brief>

The original worker brief still holds in full — chunk, context, contract, scope, definition of done — and is repeated here verbatim. Everything below is what changed.

**What round one built:** the files it touched and the account it gave of them, so you extend the work instead of rediscovering it.

**What the review found, and how I ruled it:** each structural finding, and why it is structural rather than a nit. The findings are your mandate; the ruling is the reasoning behind them.

**Repair or replace:** whether you fix the work already in the tree or discard it and rebuild from the brief. A wrong seam usually wants replacing; a missing case usually wants repairing.

**Leave alone:** the parts of the chunk that reviewed clean, and the nits already fixed by hand. A finding is not a licence to rewrite the chunk — work that was not faulted stays as it is.

**Chronicle** (only when tracking): task <taskId>, node chunk-N — add notes or subtasks under it.

**Tests:** where they were written in parallel, they now exist and run. `<narrow test command>` must pass, including whatever was failing at reconciliation — and a test is fixed only when it misread the contract, never to make it green.

**Before you write anything,** work out *why* round one missed this: an ambiguous brief, an unobvious convention, an edge case invisible from the code alone. Say so in your hand-back. If the answer is that the brief itself is wrong, say that plainly — a re-cut chunk is cheaper than careful work built to a bad spec.

This is the last round this chunk gets before it is re-cut. Leave nothing for a third.

**Hand back:** what you changed and why, each finding and how it is now addressed, why round one missed it, and the output of the narrow test run.

</repair-brief>

<review-brief>

Review the uncommitted work in this repo — `git status` and `git diff` are the whole change. You did not write it and you owe it nothing.

**What it was supposed to do:** the chunk's behaviour and its definition of done, verbatim from the worker brief.

**Where it lands:** the files the chunk touches, the conventions and ADRs that govern them, and the narrow test command. This is a map, not a defence — it says where to look, never why the code is right.

You have the map so the round goes into the diff rather than into rebuilding it. Go straight at the change; run the narrow tests if you want its behaviour proven.

**Chronicle** (only when tracking): task <taskId>, node chunk-N — add notes or subtasks under it.

Attack it. Find where it is wrong, not where it is stylish: broken behaviour and edge cases, contracts and invariants it violates, project conventions and ADRs it ignores, tests that assert nothing or pass for the wrong reason, and behaviour the brief demanded that is missing.

Where the brief says the tests were written in parallel, any test edited after the implementation landed is the most suspect thing in this diff — check that it still fails when the behaviour it names is taken away.

**If this is a repair round:** the findings that sent the chunk back are listed above. Confirm each one is genuinely addressed rather than papered over, then review the whole diff cold as usual — a repair that fixes what was named and quietly breaks something beside it is the common failure here.

Report findings only — do not edit any file, do not commit. For each finding: the file and line, what breaks, and the concrete input or state that makes it break. Rank them most severe first, and say plainly for each whether it is a **nit** (fixable without changing how the chunk works) or **structural** (the chunk is built wrong). If the chunk is sound, say so — a clean review is a real verdict.

</review-brief>

<comment-brief>

Read `git diff`, plus `git status` for files it does not cover. **The comments added or changed by this work are the whole target** — a comment already in the tree and untouched by this diff is out of scope however bad it is.

The rules are the comment sections of the `CLAUDE.md` files in your context: the user's global one, and the project's where it names local exceptions — those exceptions win inside the area they name. Read them before you start; they are the authority, not this brief.

Flag each comment that breaks one. Give the file and line, the comment verbatim, and the rule it breaks in a few words. What breaks a rule:

- **restates** the code, the signature, or the name — the reader nods and does nothing differently
- **narrates the past** — *used to, previously, no longer, this replaces, now driven by, this fix, refactored to* — or points at a PR, issue, ticket, commit, or changelog
- **explains instead of guides** — reasoning for why the code is as it is, where the test is whether it reads as *when you touch this, do or don't X*
- **carries two ideas**, or a sentence whose removal would change nothing an editor does

Leave alone: a comment naming a rule, spec, or standard that still governs the code; doc comments the language's own tooling requires; commented-out code; test names and the prose inside tests, which have a much larger budget by design.

You are never asked whether a comment is **missing** — the default is no comment, so silence is never a finding.

Report flags only — do not edit any file, do not commit. Say so plainly if nothing breaks the rules. Be quick and literal: this is a short list of rules checked against a diff, not a review of the code.

</comment-brief>

<prework-brief>

**Chunk:** what the next chunk delivers, in behaviour, from the user's perspective.

Map the ground it lands on. You are not building it, and you are not deciding anything about it — another agent will build it from a brief written out of what you find.

Report, every claim carrying the path and symbol it rests on:

- the files the chunk will touch, and what each one does today
- the conventions those files keep — naming, error handling, DTO mapping, test shape — each with a short real example from the code
- the `CLAUDE.md` rules and ADR sections governing the area, quoted narrowly and named
- the existing code it should reuse rather than reinvent
- the tests already covering the area, and the narrow command that runs them in seconds
- anything you find that contradicts the chunk as described — state it plainly and leave it unresolved

Read only. Do not edit, commit, stash, or switch branches: another agent is working in this tree right now and your writes would land on top of its work.

Where a design question comes up, **record the question and move on**. Answering it is not yours.

</prework-brief>

<prework-check-brief>

Below is a research note about this repo, written a little while ago against a tree that has changed since. Check it against what is actually there now.

Take each concrete claim — a path, a symbol, a convention, a quoted rule, a test command — and mark it **holds**, **stale** (true when written, the tree has moved), or **wrong** (never true). For anything that isn't *holds*, say what the tree says instead, in one line.

Be quick and literal. You are checking facts, not reviewing the design, not judging the plan, and not improving the note. Do not edit any file.

</prework-check-brief>
