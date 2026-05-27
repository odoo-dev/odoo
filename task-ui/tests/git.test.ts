import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the allowlist at our fixture root BEFORE importing git.ts.
const ROOT = mkdtempSync(join(tmpdir(), "rev-wt-"));
process.env.WORKTREE_ROOT = ROOT;

let git: typeof import("../review-server/git");
let WT: string;
const GIT = process.env.GIT_BIN || "/opt/homebrew/bin/git";

async function sh(cwd: string, args: string[]) {
  const p = Bun.spawn([GIT, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  await p.exited;
}

beforeAll(async () => {
  WT = join(ROOT, "repo");
  await Bun.spawn([GIT, "init", WT]).exited;
  await sh(WT, ["config", "user.email", "t@t.com"]);
  await sh(WT, ["config", "user.name", "t"]);
  await sh(WT, ["checkout", "-b", "master"]);
  await Bun.write(join(WT, "a.txt"), "line1\nline2\nline3\n");
  await sh(WT, ["add", "."]);
  await sh(WT, ["commit", "-m", "base"]);
  await sh(WT, ["checkout", "-b", "feature"]);
  await Bun.write(join(WT, "a.txt"), "line1\nCHANGED\nline3\nline4\n");
  await Bun.write(join(WT, "b.txt"), "new file\n");
  await sh(WT, ["add", "."]);
  await sh(WT, ["commit", "-m", "feature change"]);
  git = await import("../review-server/git");
  git._clearCache();
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

test("mergeBase resolves base of feature..master", async () => {
  const head = await git.headSha(WT);
  const base = await git.mergeBase(WT, head);
  expect(base).toMatch(/^[0-9a-f]{7,40}$/);
  expect(base).not.toBe(head);
});

test("diffRange returns a unified diff with the changed line", async () => {
  const head = await git.headSha(WT);
  const base = await git.mergeBase(WT, head);
  const d = await git.diffRange(WT, base, 3, undefined, head);
  expect(d.ok).toBe(true);
  expect(d.stdout).toContain("+CHANGED");
  expect(d.stdout).toContain("b.txt");
});

test("diffFiles parses additions/deletions and status", async () => {
  const head = await git.headSha(WT);
  const base = await git.mergeBase(WT, head);
  const files = await git.diffFiles(WT, base, head);
  const paths = files.map((f) => f.path).sort();
  expect(paths).toEqual(["a.txt", "b.txt"]);
  const b = files.find((f) => f.path === "b.txt")!;
  expect(b.status).toBe("A");
  expect(b.additions).toBeGreaterThan(0);
});

test("commitList returns the feature commit", async () => {
  const head = await git.headSha(WT);
  const base = await git.mergeBase(WT, head);
  const commits = await git.commitList(WT, base, head);
  expect(commits.length).toBe(1);
  expect(commits[0].subject).toBe("feature change");
});

test("allowlist rejects push/rm subcommands", async () => {
  await expect(git.runGit(WT, ["push"])).rejects.toThrow(/not allowed/);
  await expect(git.runGit(WT, ["rm", "a.txt"])).rejects.toThrow(/not allowed/);
});

test("path traversal is rejected", () => {
  expect(() => git.validateRepoPath("../etc/passwd")).toThrow(/traversal/);
  expect(() => git.validateRepoPath("/etc/passwd")).toThrow();
});

test("repo outside allowlist is rejected", () => {
  expect(() => git.validateWorktree("/tmp/not-allowed")).toThrow(/allowlist|exist/);
});

test("invalid ref rejected, valid sha accepted", () => {
  expect(() => git.validateRef("origin/main")).toThrow();
  expect(git.validateRef("master")).toBe("master");
  expect(git.isSha("abc1234")).toBe(true);
});

test("cache returns same object on hit", async () => {
  const head = await git.headSha(WT);
  const base = await git.mergeBase(WT, head);
  const r1 = await git.runGit(WT, ["log", "--format=%H", `${base}..HEAD`], {
    epoch: head,
  });
  const r2 = await git.runGit(WT, ["log", "--format=%H", `${base}..HEAD`], {
    epoch: head,
  });
  expect(r1).toBe(r2);
});

test("byte cap truncates", async () => {
  const head = await git.headSha(WT);
  const base = await git.mergeBase(WT, head);
  const d = await git.diffRange(WT, base, 3, undefined, head);
  // re-run with tiny cap, no cache
  const small = await git.runGit(WT, ["diff", `${base}..HEAD`], {
    maxBytes: 10,
    noCache: true,
    epoch: head,
  });
  expect(small.truncated).toBe(true);
  expect(small.stdout.length).toBeLessThanOrEqual(10);
});
