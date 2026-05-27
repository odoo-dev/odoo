// Safe git exec for the Review Workstation.
// - worktree allowlist (must live under WORKTREE_ROOT, be a real dir, contain .git)
// - subcommand allowlist
// - no shell (Bun.spawn with argv array)
// - arg validation (sha / ref / repo-relative path)
// - timeout + maxBytes caps, in-memory TTL cache keyed by HEAD sha
import { resolve, isAbsolute } from "node:path";
import { statSync, existsSync } from "node:fs";
import type { DiffFile } from "./schema";

const GIT_BIN = process.env.GIT_BIN || "/opt/homebrew/bin/git";
export const WORKTREE_ROOT =
  process.env.WORKTREE_ROOT || "/Volumes/Goadrive/odoo/worktrees/";

const ALLOWED_SUBCMDS = new Set([
  "rev-parse",
  "merge-base",
  "diff",
  "show",
  "status",
  "log",
  "cat-file",
  "blame",
]);

const SHA_RE = /^[0-9a-f]{7,40}$/;
const ALLOWED_REFS = new Set(["master", "HEAD"]);

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
  truncated: boolean;
}

export class GitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---- worktree allowlist ----
export function validateWorktree(worktreeAbs: string): string {
  if (!worktreeAbs || typeof worktreeAbs !== "string")
    throw new GitError("missing worktree", 400);
  const abs = resolve(worktreeAbs);
  const root = WORKTREE_ROOT.endsWith("/") ? WORKTREE_ROOT : WORKTREE_ROOT + "/";
  if (!(abs + "/").startsWith(root))
    throw new GitError("worktree outside allowlist", 400);
  let st;
  try {
    st = statSync(abs);
  } catch {
    throw new GitError("worktree does not exist", 400);
  }
  if (!st.isDirectory()) throw new GitError("worktree not a directory", 400);
  // .git may be a dir (top repo) or a file (linked worktree)
  if (!existsSync(abs + "/.git")) throw new GitError("not a git worktree", 400);
  return abs;
}

// ---- arg validation ----
export function isSha(s: string): boolean {
  return SHA_RE.test(s);
}
export function validateRef(ref: string): string {
  if (ALLOWED_REFS.has(ref)) return ref;
  if (isSha(ref)) return ref;
  throw new GitError("invalid ref: " + ref, 400);
}
export function validateRepoPath(p: string): string {
  if (typeof p !== "string" || p.length === 0)
    throw new GitError("invalid path", 400);
  if (p.includes("..")) throw new GitError("path traversal rejected", 400);
  if (isAbsolute(p) || p.startsWith("/"))
    throw new GitError("absolute path rejected", 400);
  if (p.includes("\0")) throw new GitError("invalid path", 400);
  return p;
}

// ---- cache ----
interface CacheEntry {
  value: GitResult;
}
const CACHE = new Map<string, CacheEntry>();
const CACHE_TS = new Map<string, number>();
const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 200;

function cacheGet(key: string): GitResult | null {
  const ts = CACHE_TS.get(key);
  if (ts === undefined) return null;
  if (Date.now() - ts > CACHE_TTL_MS) {
    CACHE.delete(key);
    CACHE_TS.delete(key);
    return null;
  }
  return CACHE.get(key)?.value ?? null;
}
function cacheSet(key: string, value: GitResult) {
  if (CACHE.size >= CACHE_MAX) {
    // delete oldest (insertion order)
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) {
      CACHE.delete(oldest);
      CACHE_TS.delete(oldest);
    }
  }
  CACHE.set(key, { value });
  CACHE_TS.set(key, Date.now());
}
export function _clearCache() {
  CACHE.clear();
  CACHE_TS.clear();
}

// ---- core exec ----
async function spawnGit(
  worktreeAbs: string,
  args: string[],
  timeoutMs: number,
  maxBytes: number
): Promise<GitResult> {
  const proc = Bun.spawn([GIT_BIN, "-C", worktreeAbs, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
    } catch {}
  }, timeoutMs);

  // read stdout with a byte cap
  let truncated = false;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = proc.stdout.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (total + value.length > maxBytes) {
          chunks.push(value.subarray(0, Math.max(0, maxBytes - total)));
          total = maxBytes;
          truncated = true;
          try {
            proc.kill();
          } catch {}
          break;
        }
        chunks.push(value);
        total += value.length;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  clearTimeout(timer);

  const dec = new TextDecoder();
  let stdout = "";
  for (const c of chunks) stdout += dec.decode(c, { stream: true });
  stdout += dec.decode();

  if (timedOut) {
    return { ok: false, stdout, stderr: stderr || "git timed out", code: 124, truncated };
  }
  return { ok: code === 0, stdout, stderr, code: code ?? -1, truncated };
}

export interface RunOpts {
  timeoutMs?: number;
  maxBytes?: number;
  noCache?: boolean;
  epoch?: string; // cache epoch (HEAD sha)
}

export async function runGit(
  worktreeAbs: string,
  args: string[],
  opts: RunOpts = {}
): Promise<GitResult> {
  const wt = validateWorktree(worktreeAbs);
  if (!Array.isArray(args) || args.length === 0)
    throw new GitError("no git args", 400);
  if (!ALLOWED_SUBCMDS.has(args[0]))
    throw new GitError("git subcommand not allowed: " + args[0], 400);

  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;

  const epoch = opts.epoch ?? "_";
  const key = wt + ":" + epoch + ":" + args.join("");
  if (!opts.noCache) {
    const hit = cacheGet(key);
    if (hit) return hit;
  }
  const res = await spawnGit(wt, args, timeoutMs, maxBytes);
  if (!opts.noCache && res.ok) cacheSet(key, res);
  return res;
}

// ---- high level helpers ----
export async function headSha(wt: string): Promise<string> {
  const r = await runGit(wt, ["rev-parse", "HEAD"], { noCache: true });
  return r.stdout.trim();
}

export async function mergeBase(wt: string, epoch?: string): Promise<string> {
  const r = await runGit(wt, ["merge-base", "HEAD", "master"], { epoch });
  return r.stdout.trim();
}

export async function isDirty(wt: string, epoch?: string): Promise<boolean> {
  const r = await runGit(wt, ["status", "--porcelain"], { epoch, noCache: true });
  return r.stdout.trim().length > 0;
}

export async function diffRange(
  wt: string,
  base: string,
  context = 3,
  file?: string,
  epoch?: string
): Promise<GitResult> {
  const ctx = Math.max(0, Math.min(50, Math.floor(context)));
  validateRef(base);
  const args = ["diff", "-M", "--no-color", `-U${ctx}`, `${base}..HEAD`];
  if (file) {
    validateRepoPath(file);
    args.push("--", file);
  }
  return runGit(wt, args, { epoch });
}

// numstat + name-status -> DiffFile[]
export async function diffFiles(
  wt: string,
  base: string,
  epoch?: string
): Promise<DiffFile[]> {
  validateRef(base);
  const numstat = await runGit(
    wt,
    ["diff", "-M", "--no-color", "--numstat", `${base}..HEAD`],
    { epoch }
  );
  const namestatus = await runGit(
    wt,
    ["diff", "-M", "--no-color", "--name-status", `${base}..HEAD`],
    { epoch }
  );

  // name-status: status\tpath  (or  Rxxx\told\tnew)
  const statusByPath = new Map<string, { status: string; old: string | null }>();
  for (const line of namestatus.stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0];
    if (code.startsWith("R") || code.startsWith("C")) {
      const oldP = parts[1];
      const newP = parts[2];
      if (newP) statusByPath.set(newP, { status: code[0], old: oldP });
    } else {
      const p = parts[1];
      if (p) statusByPath.set(p, { status: code[0], old: null });
    }
  }

  const files: DiffFile[] = [];
  for (const line of numstat.stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const addStr = parts[0];
    const delStr = parts[1];
    let path = parts[2];
    let oldPath: string | null = null;
    // rename numstat:  add  del  old => new  (or  add del {old => new}/rest)
    if (path && path.includes(" => ")) {
      const m = path.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
      if (m) {
        oldPath = m[1] + m[2] + m[4];
        path = m[1] + m[3] + m[4];
      } else {
        const seg = path.split(" => ");
        oldPath = seg[0];
        path = seg[1];
      }
    }
    const binary = addStr === "-" && delStr === "-";
    const meta = statusByPath.get(path);
    files.push({
      path,
      old_path: oldPath ?? meta?.old ?? null,
      status: meta?.status ?? "M",
      additions: binary ? 0 : parseInt(addStr, 10) || 0,
      deletions: binary ? 0 : parseInt(delStr, 10) || 0,
      binary,
    });
  }
  return files;
}

// NUL-split commit list mergeBase..HEAD
export async function commitList(
  wt: string,
  base: string,
  epoch?: string
): Promise<{ sha: string; author: string; date: string; subject: string }[]> {
  validateRef(base);
  const r = await runGit(
    wt,
    ["log", "--no-color", "--format=%H%x00%an%x00%aI%x00%s", `${base}..HEAD`],
    { epoch }
  );
  const out: { sha: string; author: string; date: string; subject: string }[] = [];
  for (const line of r.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [sha, author, date, subject] = line.split(" ");
    out.push({ sha, author, date, subject: subject ?? "" });
  }
  return out;
}

export async function blob(
  wt: string,
  ref: string,
  path: string,
  epoch?: string
): Promise<GitResult> {
  const r = validateRef(ref);
  validateRepoPath(path);
  return runGit(wt, ["show", `${r}:${path}`], { epoch });
}

export async function blame(
  wt: string,
  path: string,
  epoch?: string
): Promise<GitResult> {
  validateRepoPath(path);
  return runGit(wt, ["blame", "--line-porcelain", "HEAD", "--", path], { epoch });
}

// ahead count: commits in mergeBase..HEAD (via log --oneline, allowlisted)
export async function aheadCount(
  wt: string,
  base: string,
  epoch?: string
): Promise<number> {
  validateRef(base);
  const r = await runGit(wt, ["log", "--no-color", "--format=%H", `${base}..HEAD`], {
    epoch,
  });
  if (!r.ok) return 0;
  return r.stdout.split("\n").filter((l) => l.trim()).length;
}
