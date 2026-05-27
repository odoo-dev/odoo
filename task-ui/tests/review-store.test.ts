import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  foldReview,
  extractReviewRecords,
  appendReviewRecords,
  readReview,
  validateRecord,
} from "../review-server/review-store";

test("verdict last-wins", () => {
  const recs = [
    { kind: "review", rkind: "verdict", verdict: "commented", actor: "a", ts: "1" },
    { kind: "review", rkind: "verdict", verdict: "approved", actor: "b", ts: "2" },
  ];
  const f = foldReview(recs);
  expect(f.verdict).toBe("approved");
  expect(f.verdict_by).toBe("b");
  expect(f.version).toBe(2);
});

test("threads group by thread_id with replies", () => {
  const recs = [
    { kind: "review", rkind: "comment", thread_id: "t1", path: "a.js", line: 5, side: "new", body: "hi", actor: "a", ts: "1" },
    { kind: "review", rkind: "comment", thread_id: "t1", parent_id: "x", body: "reply", actor: "b", ts: "2" },
    { kind: "review", rkind: "comment", thread_id: "t2", body: "review-level", actor: "a", ts: "3" },
  ];
  const f = foldReview(recs);
  expect(f.threads.length).toBe(2);
  const t1 = f.threads.find((t) => t.thread_id === "t1")!;
  expect(t1.comments.length).toBe(2);
  expect(t1.path).toBe("a.js");
  expect(t1.line).toBe(5);
});

test("resolve toggles thread resolved", () => {
  const recs = [
    { kind: "review", rkind: "comment", thread_id: "t1", body: "x", actor: "a", ts: "1" },
    { kind: "review", rkind: "resolve", thread_id: "t1", resolved: true, actor: "a", ts: "2" },
  ];
  const f = foldReview(recs);
  expect(f.threads[0].resolved).toBe(true);
});

test("viewed map adds and removes by path", () => {
  const recs = [
    { kind: "review", rkind: "viewed", path: "a.js", sha: "abc", viewed: true, actor: "a", ts: "1" },
    { kind: "review", rkind: "viewed", path: "b.js", sha: "def", viewed: true, actor: "a", ts: "2" },
    { kind: "review", rkind: "viewed", path: "a.js", sha: "abc", viewed: false, actor: "a", ts: "3" },
  ];
  const f = foldReview(recs);
  expect(f.viewed).toEqual({ "b.js": "def" });
});

test("extractReviewRecords ignores non-review lines", () => {
  const text = [
    JSON.stringify({ kind: "task", id: "x" }),
    JSON.stringify({ kind: "event", event: "status", value: "done" }),
    JSON.stringify({ kind: "review", rkind: "verdict", verdict: "approved" }),
    "garbage{",
  ].join("\n");
  const recs = extractReviewRecords(text);
  expect(recs.length).toBe(1);
});

test("validateRecord rejects bad rkind and bad verdict", () => {
  expect(() => validateRecord({ rkind: "nope" })).toThrow();
  expect(() => validateRecord({ rkind: "verdict", verdict: "maybe" })).toThrow();
  expect(() => validateRecord({ rkind: "comment", thread_id: "t" })).toThrow();
});

test("append + read round trip (temp file, version count)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rev-store-"));
  const file = join(dir, "task.jsonl");
  await Bun.write(file, JSON.stringify({ kind: "task", id: "task" }) + "\n");
  await appendReviewRecords(file, [
    { rkind: "comment", thread_id: "t1", body: "first" },
    { rkind: "verdict", verdict: "changes_requested", note: "fix it" },
  ]);
  await appendReviewRecords(file, [
    { rkind: "verdict", verdict: "approved" },
  ]);
  const f = await readReview(file);
  expect(f.version).toBe(3);
  expect(f.verdict).toBe("approved");
  expect(f.threads.length).toBe(1);
  // stamped actor + ts present
  expect(f.threads[0].comments[0].actor).toBeTruthy();
  rmSync(dir, { recursive: true, force: true });
});
