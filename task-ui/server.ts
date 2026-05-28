// Migration Task Dashboard server — Bun.serve, no framework.
// Reads task data live from disk on each API request.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import * as git from "./review-server/git";
import {
  readReview,
  appendReviewRecords,
  extractReviewRecords,
  foldReview,
  taskFilePath,
} from "./review-server/review-store";
import type { ParsedCommit } from "./review-server/schema";

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
  latest_run: null as any,
  pushed: null as any,
  ci: null as any,
});

// "<shortsha> <subject>" => {sha, subject} (guard: no space => whole as sha)
function parseCommitLine(s: string): ParsedCommit {
  if (typeof s !== "string") return { sha: "", subject: "" };
  const i = s.indexOf(" ");
  if (i < 0) return { sha: s, subject: "" };
  return { sha: s.slice(0, i), subject: s.slice(i + 1) };
}

// Derive git review coordinates from folded state's latest_run.
function reviewCoords(state: any) {
  const run = state.latest_run;
  const worktree_abs = run?.worktree ?? null;
  const branch = run?.branch ?? state.worktree_branch ?? null;
  const commits = (run?.commits ?? []).map(parseCommitLine);
  return {
    worktree_abs,
    branch,
    commits,
    run_status: run?.status ?? null,
    run_summary: run?.summary ?? null,
    run_problem: run?.problem ?? null,
    needs_rerun: run?.needs_rerun ?? false,
    pushed: state.pushed ?? null,
    ci: state.ci ?? null,
  };
}

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
  const reviewRecords: any[] = [];

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
    // review records share the file; keep them out of task-state folding,
    // collect them for the review fold + timeline.
    if (rec.kind === "review") {
      reviewRecords.push(rec);
      timeline.push(rec);
      continue;
    }
    if (rec.kind !== "event") continue;

    const ev = rec.event;
    if (ev === "status" || ev === "priority" || ev === "assignee") {
      state[ev] = rec.value ?? null;
    } else if (ev === "run" && rec.run) {
      state.latest_run = rec.run;
    } else if (ev === "push") {
      state.pushed = {
        remote: rec.remote ?? null,
        branch: rec.branch ?? null,
        ts: rec.ts ?? null,
      };
    } else if (ev === "ci") {
      // latest CI result wins (events fold chronologically)
      state.ci = {
        result: rec.result ?? null,
        batch: rec.batch ?? null,
        summary: rec.summary ?? null,
        ts: rec.ts ?? null,
      };
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
  return { kind: kind || "task", task, state, timeline, reviewRecords };
}

function foldedSummary(parsed: { task: any; state: any; reviewRecords?: any[] }) {
  const t = parsed.task;
  const rc = reviewCoords(parsed.state);
  const review = foldReview(parsed.reviewRecords || []);
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
    // review coords (no absolute worktree path in list payload)
    has_review: !!rc.worktree_abs,
    review_branch: rc.branch,
    run_status: rc.run_status,
    needs_rerun: rc.needs_rerun,
    commit_count: rc.commits.length,
    pushed: rc.pushed,
    ci: rc.ci,
    verdict: review.verdict,
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

// Resolve a task id to its review target (worktree + coords) via the fold.
// Returns {error:"no_worktree"} when the task has no run worktree.
async function reviewTarget(id: string) {
  if (!id || id.includes("/") || id.includes(".."))
    return { error: "bad_id" as const };
  const parsed = await readTaskById(id);
  if (!parsed) return { error: "not_found" as const };
  const rc = reviewCoords(parsed.state);
  if (!rc.worktree_abs) return { error: "no_worktree" as const };
  return { id, ...rc };
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

// ---- AI probe (M3) ----
const CLAUDE_BIN = process.env.CLAUDE_BIN || "/Users/goaman/.local/bin/claude";
let aiStatusCache: { value: any; at: number } | null = null;
const AI_STATUS_TTL = 60_000;

async function probeAi() {
  if (aiStatusCache && Date.now() - aiStatusCache.at < AI_STATUS_TTL)
    return aiStatusCache.value;
  let value: any;
  try {
    const proc = Bun.spawn([CLAUDE_BIN, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {}
    }, 6000);
    const code = await proc.exited;
    clearTimeout(timer);
    if (code === 0) value = { available: true, reason: "ok" };
    else value = { available: false, reason: "not_logged_in" };
  } catch {
    value = { available: false, reason: "missing" };
  }
  aiStatusCache = { value, at: Date.now() };
  return value;
}

// Build the review checklist+diff prompt for the AI.
function aiPrompt(diff: string, context: any, scope?: string): string {
  const head = scope === "hunk" ? "Explain this specific hunk." : "Review this diff.";
  return (
    head +
    "\nTask: " +
    (context?.component || context?.id || "") +
    "\nBranch: " +
    (context?.branch || "") +
    "\nRun status: " +
    (context?.run_status || "") +
    "\n\nThis is a t-ref -> Owl 3 signal migration. Check for: useRef->signal " +
    "conversions, t-custom-ref->t-ref, .el accesses replaced by signal calls, " +
    "useEffect dependency correctness, and that no t-ref remains on a Component.\n\n" +
    "Diff:\n" +
    diff.slice(0, 60_000)
  );
}

// ---- Review request router. Returns Response or null (fall through). ----
async function handleReview(
  req: Request,
  url: URL,
  p: string
): Promise<Response | null> {
  const id = url.searchParams.get("id") || "";

  // AI status (no id needed)
  if (p === "/api/ai/status") {
    return json(await probeAi());
  }

  // GET /api/review/context
  if (p === "/api/review/context" && req.method === "GET") {
    const tgt = await reviewTarget(id);
    if ("error" in tgt) {
      if (tgt.error === "no_worktree")
        return json({ error: "no_worktree" }, 409);
      return json({ error: tgt.error }, tgt.error === "bad_id" ? 400 : 404);
    }
    try {
      const wt = git.validateWorktree(tgt.worktree_abs!);
      const head = await git.headSha(wt);
      const base = await git.mergeBase(wt, head);
      const dirty = await git.isDirty(wt, head);
      const ahead = await git.aheadCount(wt, base, head);
      const commits = await git.commitList(wt, base, head);
      return json({
        id: tgt.id,
        worktree: wt,
        branch: tgt.branch,
        head,
        mergeBase: base,
        dirty,
        ahead,
        commits: commits.length ? commits : tgt.commits,
        run_status: tgt.run_status,
        run_summary: tgt.run_summary,
        run_problem: tgt.run_problem,
        pushed: tgt.pushed,
      });
    } catch (e: any) {
      return json({ error: String(e?.message || e) }, e?.status || 500);
    }
  }

  // GET /api/review/diff
  if (p === "/api/review/diff" && req.method === "GET") {
    const tgt = await reviewTarget(id);
    if ("error" in tgt) {
      if (tgt.error === "no_worktree")
        return json({ error: "no_worktree" }, 409);
      return json({ error: tgt.error }, tgt.error === "bad_id" ? 400 : 404);
    }
    const context = Number(url.searchParams.get("context") || 3);
    const file = url.searchParams.get("file") || undefined;
    try {
      const wt = git.validateWorktree(tgt.worktree_abs!);
      const head = await git.headSha(wt);
      const base = await git.mergeBase(wt, head);
      const dirty = await git.isDirty(wt, head);
      const files = await git.diffFiles(wt, base, head);
      const d = await git.diffRange(wt, base, context, file, head);
      return json({
        id: tgt.id,
        head,
        base,
        dirty,
        files,
        unified: d.stdout,
        truncated: d.truncated,
      });
    } catch (e: any) {
      return json({ error: String(e?.message || e) }, e?.status || 500);
    }
  }

  // GET /api/review/blob
  if (p === "/api/review/blob" && req.method === "GET") {
    const tgt = await reviewTarget(id);
    if ("error" in tgt) {
      if (tgt.error === "no_worktree")
        return json({ error: "no_worktree" }, 409);
      return json({ error: tgt.error }, tgt.error === "bad_id" ? 400 : 404);
    }
    const refParam = url.searchParams.get("ref") || "HEAD";
    const path = url.searchParams.get("path") || "";
    try {
      const wt = git.validateWorktree(tgt.worktree_abs!);
      const head = await git.headSha(wt);
      let ref = refParam;
      if (refParam === "base") ref = await git.mergeBase(wt, head);
      else if (refParam !== "HEAD") ref = refParam;
      const r = await git.blob(wt, ref, path, head);
      return json({ path, ref: refParam, content: r.stdout, truncated: r.truncated });
    } catch (e: any) {
      return json({ error: String(e?.message || e) }, e?.status || 500);
    }
  }

  // GET /api/review/siblings (M2)
  if (p === "/api/review/siblings" && req.method === "GET") {
    if (!id || id.includes("/") || id.includes(".."))
      return json({ error: "bad_id" }, 400);
    const me = await readTaskById(id);
    if (!me) return json({ error: "not_found" }, 404);
    const waveId = me.task.wave_id;
    const all = await readAllTasks();
    const sibs = all
      .filter((t: any) => t.wave_id === waveId)
      .map((t: any) => ({
        id: t.id,
        path: t.path,
        component: t.component,
        run_status: t.run_status,
        verdict: t.verdict,
        has_review: t.has_review,
      }));
    return json({ id, wave_id: waveId, siblings: sibs });
  }

  // GET /api/review/export?format=md (M2)
  if (p === "/api/review/export" && req.method === "GET") {
    if (!id || id.includes("/") || id.includes(".."))
      return new Response("bad id", { status: 400 });
    const file = taskFilePath(TASKS_DIR, id);
    const review = await readReview(file);
    const tgt = await reviewTarget(id);
    const branch = "error" in tgt ? "" : tgt.branch;
    let md = `# Review — ${id}\n\n`;
    md += `Branch: ${branch || "—"}\n\n`;
    md += `Verdict: **${review.verdict || "none"}**`;
    if (review.verdict_note) md += ` — ${review.verdict_note}`;
    md += `\n\n## Comments (${review.threads.length})\n\n`;
    for (const th of review.threads) {
      const loc = th.path ? `${th.path}${th.line ? ":" + th.line : ""}` : "review-level";
      md += `### ${loc}${th.resolved ? " (resolved)" : ""}\n\n`;
      for (const c of th.comments) md += `- **${c.actor}**: ${c.body}\n`;
      md += `\n`;
    }
    return new Response(md, {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  }

  // GET /api/review (folded review state)
  if (p === "/api/review" && req.method === "GET") {
    if (!id || id.includes("/") || id.includes(".."))
      return json({ error: "bad_id" }, 400);
    const file = taskFilePath(TASKS_DIR, id);
    const review = await readReview(file);
    return json({
      id,
      verdict: review.verdict,
      verdict_by: review.verdict_by,
      verdict_at: review.verdict_at,
      verdict_note: review.verdict_note,
      viewed: review.viewed,
      threads: review.threads,
      visit: review.visit,
      version: review.version,
    });
  }

  // POST /api/review (append records)
  if (p === "/api/review" && req.method === "POST") {
    if (!id || id.includes("/") || id.includes(".."))
      return json({ error: "bad_id" }, 400);
    const file = taskFilePath(TASKS_DIR, id);
    // file must exist (don't create review records for unknown tasks)
    if (!(await Bun.file(file).exists()))
      return json({ error: "not_found" }, 404);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }
    const records = Array.isArray(body?.records) ? body.records : [];
    if (!records.length) return json({ error: "no_records" }, 400);
    const before = await readReview(file);
    const conflict =
      body.expectVersion != null && body.expectVersion !== before.version;
    try {
      await appendReviewRecords(file, records);
    } catch (e: any) {
      return json({ error: String(e?.message || e) }, 400);
    }
    const after = await readReview(file);
    return json({
      id,
      conflict,
      verdict: after.verdict,
      verdict_by: after.verdict_by,
      verdict_at: after.verdict_at,
      verdict_note: after.verdict_note,
      viewed: after.viewed,
      threads: after.threads,
      visit: after.visit,
      version: after.version,
    });
  }

  // POST /api/ai/review (SSE) — M3
  if (p === "/api/ai/review" && req.method === "POST") {
    const ai = await probeAi();
    if (!ai.available)
      return json({ error: "ai_unavailable", reason: ai.reason }, 409);
    const tgt = await reviewTarget(id);
    if ("error" in tgt) return json({ error: tgt.error }, 409);
    const scope = url.searchParams.get("scope") || "full";
    let diff = "";
    let ctx: any = {};
    try {
      const wt = git.validateWorktree(tgt.worktree_abs!);
      const head = await git.headSha(wt);
      const base = await git.mergeBase(wt, head);
      const file = url.searchParams.get("file") || undefined;
      diff = (await git.diffRange(wt, base, 3, file, head)).stdout;
      ctx = {
        component: tgt.id,
        branch: tgt.branch,
        run_status: tgt.run_status,
      };
    } catch (e: any) {
      return json({ error: String(e?.message || e) }, 500);
    }
    const prompt = aiPrompt(diff, ctx, scope);
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (s: string) => controller.enqueue(enc.encode(s));
        let proc: any;
        try {
          proc = Bun.spawn(
            [
              CLAUDE_BIN,
              "-p",
              "--output-format",
              "stream-json",
              "--include-partial-messages",
              "--no-session-persistence",
              "--max-budget-usd",
              "0.50",
              prompt,
            ],
            { stdout: "pipe", stderr: "pipe" }
          );
        } catch (e: any) {
          send(`event:error\ndata:${JSON.stringify({ error: String(e) })}\n\n`);
          controller.close();
          return;
        }
        const timer = setTimeout(() => {
          try {
            proc.kill();
          } catch {}
        }, 120_000);
        try {
          const reader = proc.stdout.getReader();
          const dec = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = dec.decode(value, { stream: true });
            for (const line of text.split("\n")) {
              if (line.trim()) send(`data:${line}\n\n`);
            }
          }
          const code = await proc.exited;
          if (code !== 0)
            send(`event:error\ndata:${JSON.stringify({ code })}\n\n`);
          send(`event:done\ndata:{}\n\n`);
        } catch (e: any) {
          send(`event:error\ndata:${JSON.stringify({ error: String(e) })}\n\n`);
        } finally {
          clearTimeout(timer);
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  // POST /api/review/batch?wave= (M4)
  if (p === "/api/review/batch" && req.method === "POST") {
    const wave = url.searchParams.get("wave") || "";
    if (!wave) return json({ error: "missing_wave" }, 400);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }
    if (!body?.verdict) return json({ error: "missing_verdict" }, 400);
    const all = await readAllTasks();
    const updated: string[] = [];
    for (const t of all) {
      if (t.wave_id !== wave || !t.has_review) continue;
      const file = taskFilePath(TASKS_DIR, t.id);
      try {
        await appendReviewRecords(file, [
          { rkind: "verdict", verdict: body.verdict, note: body.note },
        ]);
        updated.push(t.id);
      } catch {}
    }
    return json({ updated });
  }

  return null;
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
        const rc = reviewCoords(parsed.state);
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
          review: {
            worktree_abs: rc.worktree_abs,
            branch: rc.branch,
            commits: rc.commits,
            run_status: rc.run_status,
            run_summary: rc.run_summary,
            run_problem: rc.run_problem,
            needs_rerun: rc.needs_rerun,
            pushed: rc.pushed,
            ci: rc.ci,
          },
          timeline: parsed.timeline,
        });
      }

      // ---- Review Workstation endpoints ----
      if (p.startsWith("/api/review") || p.startsWith("/api/ai/")) {
        const resp = await handleReview(req, url, p);
        if (resp) return resp;
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
