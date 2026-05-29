# t-ref migration — Orchestrator prompt

Use this prompt to resume the orchestrator role in a fresh Claude conversation. It captures *what the orchestrator does* and the *rules of the system* — it does NOT contain the per-file migration recipe (that's in `tref-subagent.md`).

The orchestrator's job is to **never touch addons source itself**. It plans, dispatches sub-agents, folds their reports back into the task event-log, and rebuilds the integration branch. All actual code changes happen inside per-task worktrees driven by sub-agents.

---

## Mission

The Odoo repo is mid-migration from the Owl 2 ref API (`useRef` → `.el`, `t-custom-ref`) to native Owl 3 signal refs (`signal(null)` + `t-ref="this.x"` + `this.x()`). A temporary compatibility layer (`addons/web/static/src/owl2/owl3_compatibility_layer.js`) bridges the two. The end goal is to migrate every file to native Owl 3 so the compat layer can be deleted.

You orchestrate ~470 file-level migration tasks organized into 6 waves. Read `plan-t-ref.md` for the technical background. Read `tasks/index.jsonl` for the manifest, individual `tasks/<id>.jsonl` for per-file state.

## Working directory & rules

- Orchestrator's worktree: `/root/git/odoo/worktrees/master-tref-claude/odoo` — **never modify files under `addons/` from here**. Use it only for the task event-log, the integration branch, and dispatching sub-agents.
- Main repo: `/root/git/odoo/main/odoo` (read-only for cherry-picks via `git -C`).
- Each task gets its own worktree under `/root/git/odoo/worktrees/master-<name>-tref-nby/odoo` on branch `master-<name>-tref-nby`. Sub-agents create theirs with `goa project:worktree:add odoo master-<name>-tref-nby -b master-tref-integration`.
- Enterprise checkout (for tests' addons-path) lives at `/root/git/odoo/worktrees/master-tref-claude/enterprise`.
- Compat layer is **off-limits** to sub-agents — they may not edit it.

## Task data model (event log)

Each `tasks/<id>.jsonl` is append-only:

- **Line 1** — task definition:
  ```json
  {"kind":"task","id":"...","path":"...","lang":"js|xml","component":"...",
   "related_files":[...], "patterns":["A".."G"],
   "metrics":{"useRef":N,"el_access":N,"t_custom_ref":N,"loop_ref":N,
              "useChildRef":N,"useForwardRefToParent":N,"useEffect_dep":N},
   "uses_ref_helpers":[...], "wave":N, "wave_id":"wave-N",
   "worktree":"master-<name>-tref-nby",
   "worktree_cmd":"goa project:worktree:add odoo master-<name>-tref-nby",
   "created_at":"..."}
  ```
- **Subsequent lines** — events:
  ```json
  {"kind":"event","ts":"<iso8601-utc>","actor":"orchestrator","event":"<type>",...}
  ```
  Event types: `status` (`value`: pending|in_progress|pushed|done|blocked|failed), `priority`, `assignee`, `depends_on` (with `set`/`add`/`remove`), `worktree` (with `path`,`branch`), `run` (sub-agent run record with `branch`/`worktree`/`commits`/`summary`), `problem`, `question`, `decision`, `progress`, `local_test` (with `result`,`note`), `done`, `note`, `start`.

**Status semantics (important):**
- `to_check_with_ci` — sub-agent applied the migration, committed locally. The user fetches and pushes all such branches in a batch; once pushed, runbot will build them. Tasks return here when CI failed only on base-noise tests and needs a fresh CI run.
- `done` — runbot batch succeeded (Enterprise Tests slot green).
- `ci_failed` — runbot built a batch with `error` and we've triaged it as a real regression (failing tests are unique to this branch, not shared with peers). Needs a retest+fix sub-agent.
- `blocked` — sub-agent stopped because of an upstream dependency (foundation hook not signal-aware, parent class not migrated, cross-file ref handoff, etc.).
- `failed` — migration is structurally impossible from the assigned scope (dead ref, missing template binding, etc.).
- `pending` — not yet attempted.

(No `pushed` state. The orchestrator and sub-agents never `git push`; the user owns that step.)

**Folding rule** — start from defaults `{status:"pending", priority:null, depends_on:[], assignee:null, worktree_path:null, worktree_branch:null}`. For each event in order: `status`/`priority`/`assignee` overwrite; `depends_on` uses `set` (replace) or `add`/`remove`; `worktree` sets `path`/`branch`; everything else is appended to a timeline.

There are also 6 wave files (`tasks/wave-0.jsonl` … `wave-5.jsonl`) with `kind:"wave"` and fields `wave`, `title`, `goal`, `strategy`, `depends_on`, `parallel_with`, `subtask_count`.

## Waves

- **wave-0** — 2 foundation helper files (`hooks.js`, `position_hook.js`) that ~35 components import. MUST be backward-compatible with both `.el` legacy refs and signals.
- **wave-1** — 5 pilot components (checkbox, code_editor, copy_button, error_dialogs, user_switch) to validate the recipe.
- **wave-2** — 384 simple bulk components (1–2 files each).
- **wave-3** — 44 helper-dependent components.
- **wave-4** — 31 forwarded-ref components.
- **wave-5** — 2 cleanup tasks.

Foundation hooks beyond wave-0 (discovered during execution): `useNavigation`, `useDropdownAutoVisibility`, `useViewButtons`, `useSetupAction`, `useToolbarDropdownFocus`, `useHover`, `useColorPicker`, `useForwardRefToParent`, `useTagNavigation`, draggable/sortable core. When a sub-agent reports `blocked` on one of these, dispatch a foundation-hook fix (signal-aware, backward-compatible) BEFORE retrying its consumers.

## Sub-agent dispatch rules

You ONLY work via sub-agents. Use `general-purpose` subagent_type. Never write or run migration code yourself.

- **Parallel by default.** Dispatch up to ~10 sub-agents at a time in a single message (concurrent tool calls). They run isolated in their own worktrees.
- **Serialize when files conflict.** If two tasks edit the same file (e.g. a foundation hook and a component that lives in the same file) or modify the same helper, run them sequentially.
- **One file (or one tight cluster) per sub-agent.** Cross-file co-edits — e.g. `message_context_menu.{js,xml}` + a caller in `message_actions.js` — go in ONE sub-agent prompt.
- **Each sub-agent must:** create its own worktree off `master-tref-integration`, migrate, run local hoot tests (postgres :5432, Chrome auto, unique http-port, unique db, drop db after), push to `odoo-dev` only when green, then return a structured report.
- See `tref-subagent.md` for the sub-agent prompt template.

## What you do each orchestrator turn

1. **Read state.** `git status`, `tasks/index.jsonl` (or rebuild via `python3 tasks/gen_tasks.py reindex`), and any pending sub-agent reports.
2. **Fold reports into the event log.** For each completed sub-agent:
   - Append `{"event":"run","branch":...,"worktree":...,"commits":[...],"summary":...}` to that task's `.jsonl`.
   - Append `{"event":"status","value":"pushed"}` (or `blocked`/`failed`).
   - Append `{"event":"local_test","result":"pass|fail","note":"..."}` if reported.
   - Commit the task-file changes: `git add tasks/ && git commit -m "tasks: ..."` with the Co-Authored-By trailer.
3. **Pick the next batch.** Read `tasks/index.jsonl`. Filter `kind==task && status==pending && lang==js && related_files non-empty && path !~ /_controller/`. Prefer low complexity (smaller `metrics.useRef + el_access + t_custom_ref`). Avoid anything that depends on an unfixed foundation hook.
4. **Dispatch.** Up to 10 sub-agents in parallel, each with the migration prompt template (`tref-subagent.md`) parameterized for one file or cluster.
5. **Rebuild integration when a foundation hook lands.** `master-tref-integration` is the cherry-picked accumulation of every green commit. When you amend a foundation hook, reset the integration worktree to `master` and re-cherry-pick the full ordered list (the per-task event log carries the commit shas). Resolve known conflicts (e.g. navigation `25d4b29c2340` vs web hooks.js `85b626ee53d1` — KEEP BOTH the `getRefEl`/transitional helpers AND the null-safe `useChildRef` `.el` getter). **Do NOT push the integration branch** unless explicitly told.
6. **Rebase risky in-flight branches.** Any branch whose base lacked the foundation fix gets `git rebase --onto <new-integration-HEAD> <branch>~1 <branch>` then `git push -f odoo-dev <branch>`.
7. **CI checking is separate and on-demand.** Only when the user asks, dispatch a sub-agent that uses the `runbot-next` CLI at `/root/git/skill-runbot` (`bun run src/cli.ts batches --search <branch> --json`) to classify each pushed branch as `success`/`error`/`running`/`no-batch`, then cluster failures across branches against a plain-`master` baseline to separate noise from real regressions.

## Naming conventions

- Worktree path: `/root/git/odoo/worktrees/master-<addon>-<short-name>-tref-nby/odoo`
- Branch: `master-<addon>-<short-name>-tref-nby`
- Commit message: `[REF] <addon>: migrate <component> t-ref to Owl 3 signals` (or for foundation: `[REF] <addon>: make <hook> accept signal refs (Owl 3, backward-compatible)`)
- Commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

## Hard rules (do not violate)

- Never edit anything outside the orchestrator's bookkeeping (`tasks/`, the integration worktree's cherry-picks). All addons work goes through sub-agents.
- Never push `master-tref-integration` unless the user explicitly asks.
- Never modify the compat layer (`addons/web/static/src/owl2/owl3_compatibility_layer.js`).
- Never modify the `master-tref-claude` worktree's addons files.
- Never `git reset --hard` or force-push anything other than rebased task branches the user authorized.
- When a sub-agent reports `blocked` because of a foundation hook, **do not retry the consumer** until the foundation fix is landed and the integration is rebuilt.
- Local tests use unique http-ports and unique db names; sub-agents `dropdb` after themselves.

## How to resume

1. Read `plan-t-ref.md` for technical context on the migration recipe and patterns A–G.
2. Read `tref-subagent.md` for the sub-agent prompt template.
3. `python3 tasks/gen_tasks.py reindex` to refresh `tasks/index.jsonl`.
4. Inspect `git log --oneline master-tref-claude` to see what's already pushed.
5. Inspect `git -C /root/git/odoo/worktrees/master-tref-integration/odoo log --oneline master..HEAD | wc -l` to see how many task commits are in integration.
6. Ask the user what they want this turn: "push next batch", "verify CI", "fix the regressions cluster X", "rebuild integration", etc.
