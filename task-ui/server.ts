// Migration Task Dashboard server — Bun.serve, no framework.
// Reads task data live from disk on each API request.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const TASKS_DIR =
  process.env.TASKS_DIR ||
  "/Volumes/Goadrive/odoo/worktrees/master-tref-claude/odoo/tasks";
const PORT = Number(process.env.PORT || 4321);
const PUBLIC_DIR = import.meta.dir; // serve frontend files from alongside server.ts

const DEFAULT_STATE = () => ({
  status: "pending",
  priority: null as string | null,
  depends_on: [] as string[],
  assignee: null as string | null,
  worktree_path: null as string | null,
  worktree_branch: null as string | null,
});

const MUTABLE = new Set(["status", "priority", "assignee", "depends_on", "worktree"]);

// Parse one .jsonl file: returns { kind, task, state, timeline } or null on failure.
// `kind` is "task" or "wave"; `task` holds the line-1 definition record for either.
function parseTaskFile(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  let task: any = null;
  let kind: "task" | "wave" | null = null;
  const state = DEFAULT_STATE();
  const timeline: any[] = [];

  for (const line of lines) {
    let rec: any;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // skip malformed line, keep folding the rest
    }

    if (rec.kind === "task" || rec.kind === "wave") {
      task = rec;
      kind = rec.kind;
      continue;
    }
    if (rec.kind !== "event") continue;

    const ev = rec.event;
    if (ev === "status" || ev === "priority" || ev === "assignee") {
      state[ev] = rec.value ?? null;
    } else if (ev === "depends_on") {
      if (Array.isArray(rec.set)) {
        state.depends_on = [...rec.set];
      } else {
        const set = new Set(state.depends_on);
        for (const d of rec.add || []) set.add(d);
        for (const d of rec.remove || []) set.delete(d);
        state.depends_on = [...set];
      }
    } else if (ev === "worktree") {
      state.worktree_path = rec.path ?? state.worktree_path;
      state.worktree_branch = rec.branch ?? state.worktree_branch;
    }

    // Keep every event (including the mutating ones) in the chronological timeline.
    if (!MUTABLE.has(ev) || ev === "worktree" || ev === "depends_on") {
      // log-style events + worktree/depends_on are interesting in the timeline;
      // status/priority/assignee are also kept so the history is complete.
    }
    timeline.push(rec);
  }

  if (!task) return null;
  return { kind: kind || "task", task, state, timeline };
}

function foldedSummary(parsed: { task: any; state: any }) {
  const t = parsed.task;
  return {
    id: t.id,
    path: t.path,
    lang: t.lang,
    component: t.component,
    related_files: t.related_files || [],
    patterns: t.patterns || [],
    metrics: t.metrics || {},
    uses_ref_helpers: t.uses_ref_helpers || [],
    worktree: t.worktree ?? null,
    worktree_cmd: t.worktree_cmd ?? null,
    created_at: t.created_at ?? null,
    wave: t.wave ?? null,
    wave_id: t.wave_id ?? null,
    // folded current state
    status: parsed.state.status,
    priority: parsed.state.priority,
    depends_on: parsed.state.depends_on,
    assignee: parsed.state.assignee,
    worktree_path: parsed.state.worktree_path,
    worktree_branch: parsed.state.worktree_branch,
  };
}

async function listTaskFiles(): Promise<string[]> {
  const entries = await readdir(TASKS_DIR);
  return entries.filter(
    (f) =>
      f.endsWith(".jsonl") &&
      f !== "index.jsonl" &&
      !/^wave-\d+\.jsonl$/.test(f)
  );
}

async function listWaveFiles(): Promise<string[]> {
  const entries = await readdir(TASKS_DIR);
  return entries.filter((f) => /^wave-\d+\.jsonl$/.test(f));
}

// Read every file task's folded summary (used by /api/tasks and for wave rollups).
async function readAllTasks() {
  const files = await listTaskFiles();
  const out: any[] = [];
  for (const f of files) {
    const text = await readFile(join(TASKS_DIR, f), "utf8");
    const parsed = parseTaskFile(text);
    if (parsed && parsed.kind === "task") out.push(foldedSummary(parsed));
  }
  return out;
}

// Read every wave's definition + folded state, with a rollup of child statuses.
async function readAllWaves() {
  const files = await listWaveFiles();
  const tasks = await readAllTasks();

  // group child statuses by wave_id
  const childCounts: Record<string, Record<string, number>> = {};
  for (const t of tasks) {
    if (!t.wave_id) continue;
    const m = (childCounts[t.wave_id] ||= {});
    m[t.status] = (m[t.status] || 0) + 1;
  }

  const waves: any[] = [];
  for (const f of files) {
    const text = await readFile(join(TASKS_DIR, f), "utf8");
    const parsed = parseTaskFile(text);
    if (!parsed || parsed.kind !== "wave") continue;
    const w = parsed.task;
    const status_counts = childCounts[w.id] || {};
    const subtasks_total = Object.values(status_counts).reduce(
      (a, b) => a + b,
      0
    );
    waves.push({
      id: w.id,
      wave: w.wave,
      title: w.title,
      goal: w.goal ?? null,
      strategy: w.strategy ?? null,
      depends_on: parsed.state.depends_on?.length
        ? parsed.state.depends_on
        : w.depends_on || [],
      parallel_with: w.parallel_with || [],
      subtask_count: w.subtask_count ?? null,
      created_at: w.created_at ?? null,
      // folded current state
      status: parsed.state.status,
      priority: parsed.state.priority,
      // rollup of children
      status_counts,
      subtasks_total,
    });
  }
  waves.sort((a, b) => (a.wave ?? 0) - (b.wave ?? 0));
  return waves;
}

async function readWaveById(id: string) {
  if (id.includes("/") || id.includes("..")) return null;
  const waves = await readAllWaves();
  return waves.find((w) => w.id === id) || null;
}

async function readTaskById(id: string) {
  // id maps to <id>.jsonl; guard against path traversal.
  if (id.includes("/") || id.includes("..")) return null;
  const file = join(TASKS_DIR, id + ".jsonl");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return null;
  }
  return parseTaskFile(text);
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function serveStatic(pathname: string): Promise<Response> {
  let rel = pathname === "/" ? "/index.html" : pathname;
  if (rel.includes("..")) return new Response("Bad request", { status: 400 });
  const filePath = join(PUBLIC_DIR, rel);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  const ct = CONTENT_TYPES[extname(filePath)] || "application/octet-stream";
  return new Response(file, { headers: { "content-type": ct } });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;

    try {
      if (p === "/api/tasks") {
        const out = await readAllTasks();
        out.sort((a, b) => a.path.localeCompare(b.path));
        return json(out);
      }

      if (p === "/api/waves") {
        return json(await readAllWaves());
      }

      const wm = p.match(/^\/api\/waves\/(.+)$/);
      if (wm) {
        const id = decodeURIComponent(wm[1]);
        const wave = await readWaveById(id);
        if (!wave) return json({ error: "not found", id }, 404);
        return json(wave);
      }

      const m = p.match(/^\/api\/tasks\/(.+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const parsed = await readTaskById(id);
        if (!parsed) return json({ error: "not found", id }, 404);
        return json({
          definition: parsed.task,
          state: {
            status: parsed.state.status,
            priority: parsed.state.priority,
            depends_on: parsed.state.depends_on,
            assignee: parsed.state.assignee,
            worktree_path: parsed.state.worktree_path,
            worktree_branch: parsed.state.worktree_branch,
          },
          timeline: parsed.timeline,
        });
      }

      if (p === "/api/meta") {
        return json({ tasks_dir: TASKS_DIR });
      }

      if (!p.startsWith("/api/")) {
        return await serveStatic(p);
      }
      return json({ error: "unknown endpoint" }, 404);
    } catch (err: any) {
      return json({ error: String(err?.message || err) }, 500);
    }
  },
});

console.log(`Task dashboard running at http://localhost:${server.port}`);
console.log(`Reading tasks from: ${TASKS_DIR}`);
