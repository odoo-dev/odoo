# Migration Task Dashboard

A local web dashboard for browsing migration "tasks". Server is a single
`Bun.serve` file; the frontend is vanilla HTML/CSS/JS (no build step, no npm
install, no framework).

## Run

```sh
bun run /Volumes/Goadrive/odoo/worktrees/master-tref-claude/odoo/task-ui/server.ts
```

Then open <http://localhost:4321>.

- Default port: **4321** (override with `PORT=...`).
- Task data is read **live from disk** on every API request from
  `/Volumes/Goadrive/odoo/worktrees/master-tref-claude/odoo/tasks`
  (override with `TASKS_DIR=...`). The dashboard always reflects current state.

```sh
PORT=5000 TASKS_DIR=/some/other/tasks bun run .../task-ui/server.ts
```

## API

- `GET /` and static assets — serves the frontend.
- `GET /api/tasks` — array of every file task's folded summary (definition
  fields + current folded state; no timeline). Each task now also carries
  `wave` (int) and `wave_id` (e.g. `"wave-2"`). Wave files are excluded here.
- `GET /api/tasks/:id` — one task's `{ definition, state, timeline }` with the
  complete chronological event log.
- `GET /api/waves` — the 6 waves (ordered `wave-0`…`wave-5`), each with its
  definition fields (`title`, `goal`, `strategy`, `depends_on`,
  `parallel_with`, `subtask_count`, `created_at`), its folded `status` /
  `priority`, and a **rollup** of its children: `status_counts` (a
  `{status: count}` map computed by grouping file tasks by `wave_id`) plus
  `subtasks_total`.
- `GET /api/waves/:id` — a single wave (same shape as one element of
  `/api/waves`), 404 if unknown.
- `GET /api/meta` — `{ tasks_dir }`.

## Waves

The `tasks/` directory contains 6 wave files (`wave-0.jsonl`…`wave-5.jsonl`)
whose line 1 is a `{"kind":"wave",...}` record (not `"task"`). A wave is a
parent; every file task belongs to exactly one wave via its `wave_id`. Wave
files fold the same way as task files (status/priority/depends_on events), and
their children's statuses are rolled up into `status_counts`. Wave files are
recognized by the server and never mistaken for tasks.

## How state is folded

Each `<id>.jsonl` is an append-only event log. Line 1 is the `task` (or
`wave`) definition. Subsequent `event` lines are folded into current state:

- `status` / `priority` / `assignee` — latest `value` wins.
- `depends_on` — `set:[...]` replaces; otherwise `add` (union) then `remove`
  (difference).
- `worktree` — sets `worktree_path` / `worktree_branch`.
- All events (including the above) are also kept in the chronological timeline
  for display.

`index.jsonl` is a derived manifest and is intentionally ignored; the per-task
files are the source of truth.

## UI

- **Tree (left):** two-level. The 6 waves are the top-level nodes
  (`wave-0`→`wave-5`), each showing its title, a `done/total` rollup with a
  status-colored progress bar, and `depends_on` / `parallel_with` badges.
  Under each wave, its file tasks are nested in the usual collapsible
  directory sub-tree (scoped to that wave); leaves show component, lang and a
  status badge. Waves are expanded by default; large folders (>25 tasks)
  start collapsed.
- **Detail (main):**
  - *Wave* (click a wave header): all wave fields (`title`, `goal`,
    `strategy`, clickable `depends_on` / `parallel_with`), the child status
    breakdown + progress bar, and a drill-in list of the wave's tasks.
  - *Task* (click a leaf or a wave-child): every definition field including a
    clickable `wave` link back to the parent wave, the folded state, clickable
    `depends_on` links, a copyable `worktree_cmd`, and the full event timeline.
- **Top bar:** aggregate counts by status / pattern / addon, unresolved-deps
  and blocked/needs_input counts, a per-wave progress overview (6 compact bars,
  click to open the wave), plus status / pattern / text filters (which apply
  within the wave grouping) and a Reload button.
