# t-ref migration — Sub-agent prompt templates

Use these templates verbatim when the orchestrator dispatches a sub-agent (`general-purpose` subagent_type). Each sub-agent works on **one file (or one tight cluster)**, creates its own worktree, runs local tests, and pushes only when green.

Pick the template that matches the task:

- **A. Migrate a leaf component (1–2 files)** — wave-2/3/4 bulk work.
- **B. Migrate a foundation hook (backward-compatible)** — wave-0 + foundation hooks discovered mid-run (e.g. `useNavigation`, `useToolbarDropdownFocus`, `useHover`, `useColorPicker`, draggable/sortable core).
- **C. Migrate a multi-file cluster** — component + caller co-edit (e.g. `message_context_menu.{js,xml}` + `message_actions.js`).

A sub-agent must **never** modify the compat layer, the `master-tref-claude` worktree, the orchestrator's `tasks/` directory, or any file outside its own worktree.

---

## Shared background (always include in the sub-agent prompt)

```
## You are one of many parallel sub-agents
An orchestrator is migrating ~470 files in waves. Other sub-agents are working
in sibling worktrees RIGHT NOW on different files. Foundation hooks
(useNavigation, useToolbarDropdownFocus, useHover, useColorPicker, useTagNavigation,
useForwardRefToParent, draggable/sortable core, etc.) have ALREADY been made
signal-aware on `master-tref-integration` — that is your base branch. If your
pre-check finds the file depends on a hook that is NOT signal-aware on this base,
report `blocked` naming the callee (don't try to fix the hook yourself; the
orchestrator dispatches foundation fixes separately).

The orchestrator's bookkeeping lives at
`/root/git/odoo/worktrees/master-tref-claude/odoo/tasks/` — READ-ONLY for you:
  - `tasks/index.jsonl` — list of all tasks with current status (pending,
    in_progress, pushed, done, blocked, failed). Use this to check whether a
    related component you'd touch is already migrated, blocked, or pending.
  - `tasks/<id>.jsonl` — per-task event log; line 1 is the task def
    (path, related_files, worktree, branch); subsequent lines are events.
You can `grep` or read these files freely; you MUST NOT modify them. If you
need to know whether a sibling file is migrated, look it up here.

## Sibling worktrees: read commits, do NOT edit
The bare repo is shared, so EVERY task branch is visible from your worktree
via `git branch -a` / `git log <branch>` / `git show <branch>:<path>`. Use this
when you need to:
  - confirm a foundation fix has actually landed (read the branch's commit),
  - check what an in-flight peer migration changed,
  - cherry-pick a commit your base needs but doesn't yet have (rare; only
    when the orchestrator told you to combine two branches — e.g. a foundation
    fix not yet folded into master-tref-integration):
      `git -C <your-worktree> cherry-pick <sha-from-sibling-branch>`
Never `cd` into another worktree to edit files there. Never `git -C` another
worktree to commit. You ONLY have write access to your own worktree.

## Background: the Owl 2→3 bridge
Odoo runs Owl 3 with a temporary compatibility layer at
`addons/web/static/src/owl2/owl3_compatibility_layer.js` that shims
`useRef` (returns an object with a `.el` getter backed by a signal)
and rewrites templates `t-ref`→`t-custom-ref`. The end goal is native
Owl 3: `signal(null)` + `t-ref="this.xRef"` + `this.xRef()`.

In this repo `useRef` is imported from `@web/owl2/utils` (not @odoo/owl).
Native Owl 3 has no `useRef`.

DO NOT modify the compat layer. DO NOT modify the master-tref-claude worktree.
DO NOT modify the orchestrator's `tasks/` directory. DO NOT modify other
sub-agents' worktrees. DO NOT `git push` — the orchestrator/user handles
pushing; you commit locally only.

## Native Owl 3 ref API (what you migrate toward)
- `import { signal } from "@odoo/owl"`.
- A ref is a class field: `xRef = signal(null)`.
- Read the element by CALLING the signal: `this.xRef()` (null when unmounted).
- The template binds an expression: `<input t-ref="this.xRef"/>` (NOT a string).

## Recipe (for leaf components)
1. Remove `useRef`; `import { signal } from "@odoo/owl"`.
2. `this.x = useRef("name")` → class field `nameRef = signal(null)`.
3. `t-custom-ref="name"` → `t-ref="this.nameRef"` (expression, never a string).
4. `this.x.el` → `this.nameRef()`; `if (this.x.el)` → `if (this.nameRef())`;
   `?.` → `this.nameRef()?.…`.
Hard rules: signals are functions; NO getter wrappers; NO `typeof` checks
in leaf components; do not change any file other than the assigned ones.

## CRITICAL pre-check (for leaf components)
If the ref is passed as an argument into ANY function/hook (e.g.
`useXxx(this.ref)` or `useXxx(useRef(...))`, or exported via a `getRef`
-style prop) where the callee reads `.el`, the file cannot be migrated
in isolation. STOP → STATUS: blocked, naming the callee.

## Signal-detection pattern (for foundation hooks ONLY)
The codebase has a shared resolver pattern — search for `resolveRefEl`.
A genuine Owl 3 signal is distinguishable from a legacy ref object by:
  - being a bare zero-arg function, no `.el`,
  - typically exposing `.set` (signals do; useChildRef callables do not).
Resolve in ONE localized place; null-safe; never call useChildRef callables.
Keep all existing `.el` callers working unchanged.
```

---

## Template A — Migrate a leaf component (1–2 files)

```
Migrate ONE Odoo component to native Owl 3 signal refs, LOCAL-TEST, COMMIT
LOCALLY. DO NOT PUSH — the user/orchestrator handles pushing. Keep the
master-tref-claude worktree untouched.

## Worktree (base = fixed integration)
From `/root/git/odoo/worktrees/master-tref-claude/odoo` run:
  `goa project:worktree:add odoo master-<NAME>-tref-nby -b master-tref-integration`
(retry 3× w/ 3s sleep if locked). Find path (`git worktree list | grep <NAME>`);
work ONLY there.

## Files (only these)
- <JS_PATH>
- <XML_PATH>          # if present
Open both; confirm `useRef` + `t-custom-ref`. If not, STOP → STATUS: failed.

## CRITICAL pre-check
If the ref is passed to ANY hook/function that reads `.el` and that
hook isn't already signal-aware on this base, STOP → STATUS: blocked,
naming the callee.

<SHARED BACKGROUND BLOCK>
<RECIPE BLOCK>

## Commit FIRST, then test only the runbot-failing tests (one at a time)

The Bash tool times out at 10 min; the full `@<addon>` hoot suite often takes
longer. Skip the full suite. Instead:

### Step 1 — commit the migration immediately
After applying the recipe and reading the diff, `git add` the assigned files
and commit:
  `[REF] <addon>: migrate <component> t-ref to Owl 3 signals`
ending with: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
**No `git push`** — orchestrator/user handles pushing.

### Step 2 — query runbot for THIS branch's failing tests
The branch name is `master-<NAME>-tref-nby`. Use:
```
bun --cwd /root/git/skill-runbot run src/cli.ts batches /runbot/rd-1 \
    --search master-<NAME>-tref-nby --json
```
If the result is `[]`, the branch has no CI history yet — there is nothing to
retest. **Skip Step 3, finish with LOCAL_TEST: deferred (no runbot batch).**

If batches exist, take the newest. Pull failing tests:
```
bun --cwd /root/git/skill-runbot run src/cli.ts build-names <batch-id> --json
bun --cwd /root/git/skill-runbot run src/cli.ts tests --batch <batch-id> \
    --slot "<failing-slot>" --json
```
Build a list of failing test identifiers (suite + test name).

### Step 3 — re-run each failing test locally, ONE AT A TIME
For each failing test, run a narrow hoot invocation (port <PORT>, unique db):
```
./odoo-bin --stop-after-init \
  --addons-path "/root/git/odoo/worktrees/master-tref-claude/enterprise" \
  -d <uniqdb_per_test> -i web,<addon> --test-enable --http-port <PORT> \
  --test-tags '/web:WebSuite.test_unit_desktop[<test-identifier>]'
```
Confirm SELECTED count > 0, watch for pass/fail. `dropdb` after EACH test.
Track which ones pass after your migration vs which still fail.

Each narrow test should finish well under the 10-min Bash cap. If even one
narrow test exceeds 10 min, that's a signal it's not actually narrow — refine
the tag (`--test-tags '/web:WebSuite.test_unit_desktop[<addon>/<file>:<TestName>.test_<func>]'`).

## Report EXACTLY
STATUS (committed/blocked/failed) /
BRANCH /
COMMIT (sha) /
WORKTREE (absolute path) /
RUNBOT_BATCH (id or "none") /
RUNBOT_FAILING_TESTS (count) /
LOCAL_TEST (per-test list: name + before-fix-runbot-status + after-fix-local-result; or "deferred (no runbot batch)") /
STILL_FAILING (list of tests still failing after migration; expect empty if migration is correct) /
PROBLEM (if any) /
NEEDS_RERUN (yes/no, why)
```

---

## Template B — Migrate a foundation hook (backward-compatible)

```
FOUNDATION task: make a shared ref-consuming hook accept Owl 3 signal refs,
BACKWARD-COMPATIBLY. Many consumers still pass legacy `.el` refs — they MUST
keep working. If a correct backward-compatible fix isn't feasible, STOP →
STATUS: blocked with analysis.

## Worktree
From `/root/git/odoo/worktrees/master-tref-claude/odoo` run:
  `goa project:worktree:add odoo master-<NAME>-tref-nby -b master-tref-integration`
(retry 3× w/ 3s sleep). Find path (`git worktree list | grep <NAME>`); work
ONLY there; never edit the master-tref-claude worktree.

## File(s)
- <PATH(S)>
READ first. If the bridge patterns are absent, STOP → STATUS: failed.

<SHARED BACKGROUND BLOCK>

## Task
For EACH exported hook that receives a ref and reads `.el`, resolve the
element in ONE localized place with a transitional resolver (search this
codebase for `resolveRefEl` to match the existing style). Route all `.el`
reads through the resolver. Keep public signatures/behavior identical.
Legacy `.el` callers MUST keep working. If the hook ALSO creates its
own internal `useRef`, migrate that to `signal(null)` and read it via
the resolver/call as appropriate.

Hard rule: don't break legacy callers; if unsure, STATUS: blocked, no change.

## Local test BEFORE pushing (postgres :5432, Chrome auto; http-port <PORT>)
Find the hoot suite(s) that exercise this hook (its current consumers
still pass legacy `.el` refs, so the suite proves backward compatibility):
```
./odoo-bin --stop-after-init \
  --addons-path "/root/git/odoo/worktrees/master-tref-claude/enterprise" \
  -d <uniqdb> -i web --test-enable --http-port <PORT> \
  --test-tags '/web:WebSuite.test_unit_desktop[@<addon>/<hook-area>]'
```
Confirm count>0, must PASS. Drop DB.

## Commit when green — DO NOT PUSH
`git add` the changed files, commit
  `[REF] <addon>: make <hook> accept signal refs (Owl 3, backward-compatible)`
ending with: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
**No `git push`.** The orchestrator/user handles pushing.

## Report EXACTLY
STATUS (committed/blocked/failed) /
BRANCH /
COMMIT (sha) /
WORKTREE (absolute path) /
FILES changed /
NORMALIZATION (what + where) /
LOCAL_TEST (suites + counts + pass/fail) /
RESIDUAL concern /
UNBLOCKS (list the downstream consumers this enables)
```

---

## Template C — Multi-file cluster (component + caller co-edit)

```
Complete a multi-file migration unit, LOCAL-TEST, push when green. The
component migration may already be drafted (uncommitted) in the worktree;
add the cross-file co-edit, then commit + test + push. Keep the
master-tref-claude worktree untouched.

## Worktree (existing)
`<WORKTREE_PATH>` (branch `<BRANCH>`, based on master-tref-integration).
Work ONLY there.

## Files (this unit)
- <FILE 1>         # already migrated (uncommitted) — verify
- <FILE 2>         # already migrated (uncommitted) — verify
- <CALLER_FILE>    # needs ONE edit: <SPECIFIC CHANGE>, e.g.
                   #   `owner.anchor.el` → `owner.anchorRef()`
                   #   matching the new signal field name.

## Steps
1. `git status` — confirm the migrated files are modified, caller is clean.
2. Read the migrated files to confirm naming (e.g. `anchorRef = signal(null)`),
   the template uses `t-ref="this.anchorRef"`, and any forwarding hook
   (e.g. `useForwardRefToParent`) is invoked with the signal — verify
   the hook's signature on this base supports that.
3. Apply the caller co-edit. Add null-guards consistent with surrounding code.
4. If the migration needs adjustment to match a hook's signature, fix it.

## Local test BEFORE pushing (http-port <PORT>)
Run the suite that previously failed for this cluster:
```
./odoo-bin --stop-after-init \
  --addons-path "/root/git/odoo/worktrees/master-tref-claude/enterprise" \
  -d <uniqdb> -u web -i <addon> --test-enable --http-port <PORT> \
  --test-tags '/web:WebSuite.test_unit_desktop[@<addon>/<suite>]'
```
Confirm count>0 and the specific previously-failing test passes. Drop DB.

## Commit when green — DO NOT PUSH
`git add` all <N> files, commit
  `[REF] <addon>: migrate <component> (+ <caller> caller) to Owl 3 signals`
ending with: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
**No `git push`.** Drop DB.

## Report EXACTLY
STATUS (committed/blocked/failed) / BRANCH / COMMIT / WORKTREE / FILES changed /
LOCAL_TEST (suite + count + the specific failing test's result) /
PROBLEM / NEEDS_RERUN
```

---

## Auxiliary sub-agent templates

These are not migration agents but plumbing agents the orchestrator also dispatches.

### Rename worktrees + branches (one-shot)
See session lines 832/857/930 — used to apply the `master-<name>-tref-nby` naming convention everywhere. Steps: build JSON-aware mapping from `tasks/*.jsonl` worktree fields → rename only worktrees whose branch matches an OLD key (filters out the orchestrator worktree and main repo) → `git branch -m`, `git worktree move`, `git worktree repair` → rewrite task `.jsonl` files JSON-aware (never blind string replace) → patch `tasks/gen_tasks.py` → `python3 tasks/gen_tasks.py reindex`.

### Build / rebuild integration branch
Create worktree `/root/git/odoo/worktrees/master-tref-integration/odoo` off `master`. Cherry-pick the N done commits in order; expected conflict on `addons/web/static/src/core/utils/hooks.js` between the navigation fix and the web-hooks foundation commit — resolve by KEEPING BOTH (the `getRefEl`/transitional helpers AND the null-safe `useChildRef` `.el` getter). Verify with `node --check` on key files. **Do not push** unless explicitly told.

### Rebase a risky in-flight branch onto the fixed integration
For a branch whose base lacked a foundation fix:
```
git -C /root/git/odoo/worktrees/<branch>/odoo rebase \
    --onto <new-integration-HEAD> <branch>~1 <branch>
git -C /root/git/odoo/worktrees/<branch>/odoo push -f odoo-dev <branch>
```
If conflict: report; don't force a bad resolution.

### Check CI status (read-only)
Tool: `runbot-next` CLI at `/root/git/skill-runbot` (`bun run src/cli.ts ... --json`).
- `batches --search <branch> --json` → newest first; first entry is latest. Try `/runbot/rd-1` then `/runbot/rd-2`.
- For `error`: `build-names <batch-id> --json` (which slot failed) + `tests --batch <batch-id> --json` (failures).
Classify each branch as `success` / `error` / `running` / `no-batch`. For errors, 1–2 line summary. Tally at the end.

### Cluster CI failures across branches (read-only)
1. Baseline: fetch failing tests on a recent plain-`master` batch (Enterprise Tests slot) — these are pre-existing noise.
2. For each failed branch, fetch its failing test identifier set.
3. Cluster:
   - **Shared/pre-existing**: tests also failing on master baseline, or hitting most branches identically (eslint, im_livechat, payrun, etc.).
   - **Branch-specific (real regressions)**: tests failing only on one/few branches, NOT on baseline. Give name + 1-line root-cause from traceback.
4. Report: baseline noise floor, common-cluster list, per-branch real regressions, and ranked priority for fixes.

---

## Parameters to fill in when dispatching

| Placeholder | Source |
|---|---|
| `<NAME>` | The task's `worktree` minus the `master-` prefix and `-tref-nby` suffix |
| `<JS_PATH>` / `<XML_PATH>` | `tasks/<id>.jsonl` line-1 `path` + `related_files` |
| `<addon>` | First path component under `addons/` |
| `<PORT>` | Unique http-port per concurrent sub-agent (8900–8999 range) |
| `<uniqdb>` | Unique postgres db name per sub-agent |
| `<addon>/<area>` | Test tag — start narrow, broaden if SELECTED count is 0 |
