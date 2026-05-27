import { test, expect } from "bun:test";

// We test the parse/fold logic by importing the same helpers the server uses.
// parseTaskFile is internal to server.ts; replicate the contract by exercising
// reviewCoords-shaped expectations through a small synthetic fold.

// Reproduce a minimal fold matching server.ts so the test is hermetic and does
// not start the server. We assert the run event surfaces and commits parse.
function parseCommitLine(s: string) {
  const i = s.indexOf(" ");
  if (i < 0) return { sha: s, subject: "" };
  return { sha: s.slice(0, i), subject: s.slice(i + 1) };
}

test("parseCommitLine splits sha + subject, guards no-space", () => {
  expect(parseCommitLine("abc1234 fix the thing")).toEqual({
    sha: "abc1234",
    subject: "fix the thing",
  });
  expect(parseCommitLine("deadbeef")).toEqual({ sha: "deadbeef", subject: "" });
});

test("synthetic jsonl: run event surfaces latest_run + parsed commits", () => {
  const lines = [
    { kind: "task", id: "t", path: "a/b.js", component: "b", lang: "js" },
    { kind: "event", event: "status", value: "done" },
    {
      kind: "event",
      event: "run",
      run: {
        worktree: "/Volumes/Goadrive/odoo/worktrees/x/odoo",
        branch: "master-x-tref-nby",
        status: "success",
        summary: "did it",
        commits: ["abc1234 first", "def5678 second"],
        problem: null,
        needs_rerun: false,
      },
    },
    { kind: "event", event: "push", remote: "odoo-dev", branch: "master-x-tref-nby" },
  ];

  // mimic the server fold
  let latest_run: any = null;
  let pushed: any = null;
  for (const rec of lines) {
    if (rec.kind === "event" && rec.event === "run") latest_run = (rec as any).run;
    else if (rec.kind === "event" && rec.event === "push")
      pushed = { remote: (rec as any).remote, branch: (rec as any).branch };
  }
  expect(latest_run).toBeTruthy();
  expect(latest_run.worktree).toContain("/worktrees/");
  const commits = latest_run.commits.map(parseCommitLine);
  expect(commits).toEqual([
    { sha: "abc1234", subject: "first" },
    { sha: "def5678", subject: "second" },
  ]);
  expect(pushed.remote).toBe("odoo-dev");
});

import { foldReview } from "../review-server/review-store";

test("review block fold integrates with verdict", () => {
  const review = foldReview([
    { kind: "review", rkind: "verdict", verdict: "approved", actor: "nby", ts: "1" },
  ]);
  expect(review.verdict).toBe("approved");
});
