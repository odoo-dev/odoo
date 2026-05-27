// Append-only JSONL read/fold/append for review records.
// Review records live in the SAME tasks/<id>.jsonl (kind:"review").
import { readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import {
  REVIEW_KIND,
  REVIEW_RKINDS,
  type ReviewRecord,
  type FoldedReview,
  type ReviewThread,
} from "./schema";

const ACTOR = process.env.REVIEW_ACTOR || process.env.USER_EMAIL || "nby@odoo.com";

function emptyReview(): FoldedReview {
  return {
    verdict: null,
    verdict_by: null,
    verdict_at: null,
    verdict_note: null,
    viewed: {},
    threads: [],
    visit: null,
    version: 0,
  };
}

// Extract review records from raw jsonl text.
export function extractReviewRecords(text: string): any[] {
  const out: any[] = [];
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    let rec: any;
    try {
      rec = JSON.parse(l);
    } catch {
      continue;
    }
    if (rec && rec.kind === REVIEW_KIND) out.push(rec);
  }
  return out;
}

// Fold review records into current review state.
export function foldReview(records: any[]): FoldedReview {
  const r = emptyReview();
  const threadMap = new Map<string, ReviewThread>();
  let commentSeq = 0;

  for (const rec of records) {
    r.version++;
    switch (rec.rkind) {
      case "verdict":
        r.verdict = rec.verdict ?? null;
        r.verdict_by = rec.actor ?? null;
        r.verdict_at = rec.ts ?? null;
        r.verdict_note = rec.note ?? null;
        break;
      case "viewed":
        if (rec.path) {
          if (rec.viewed === false) delete r.viewed[rec.path];
          else r.viewed[rec.path] = rec.sha ?? "";
        }
        break;
      case "comment": {
        const tid = rec.thread_id;
        if (!tid) break;
        let th = threadMap.get(tid);
        if (!th) {
          th = {
            thread_id: tid,
            path: rec.path ?? null,
            line: rec.line ?? null,
            side: rec.side ?? null,
            resolved: false,
            comments: [],
          };
          threadMap.set(tid, th);
        }
        th.comments.push({
          actor: rec.actor ?? "reviewer",
          ts: rec.ts ?? "",
          body: rec.body ?? "",
          comment_id: rec.comment_id ?? tid + ":" + commentSeq++,
        });
        break;
      }
      case "resolve": {
        const tid = rec.thread_id;
        const th = threadMap.get(tid);
        if (th) th.resolved = rec.resolved !== false;
        break;
      }
      case "visit":
        r.visit = rec.head ?? null;
        break;
      case "draft":
        // drafts are not part of folded public state
        break;
      default:
        break;
    }
  }
  r.threads = [...threadMap.values()];
  return r;
}

// Read + fold review state for a task file.
export async function readReview(filePath: string): Promise<FoldedReview> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return emptyReview();
  }
  return foldReview(extractReviewRecords(text));
}

// Validate one inbound record (before stamping). Returns cleaned record or throws.
export function validateRecord(rec: any): ReviewRecord {
  if (!rec || typeof rec !== "object") throw new Error("record not an object");
  if (!REVIEW_RKINDS.includes(rec.rkind))
    throw new Error("invalid rkind: " + rec.rkind);
  switch (rec.rkind) {
    case "verdict":
      if (!["approved", "changes_requested", "commented"].includes(rec.verdict))
        throw new Error("invalid verdict");
      break;
    case "viewed":
      if (typeof rec.path !== "string") throw new Error("viewed needs path");
      break;
    case "comment":
      if (typeof rec.thread_id !== "string")
        throw new Error("comment needs thread_id");
      if (typeof rec.body !== "string" || !rec.body.length)
        throw new Error("comment needs body");
      break;
    case "resolve":
      if (typeof rec.thread_id !== "string")
        throw new Error("resolve needs thread_id");
      break;
    case "draft":
      if (typeof rec.thread_id !== "string")
        throw new Error("draft needs thread_id");
      break;
    case "visit":
      if (typeof rec.head !== "string") throw new Error("visit needs head");
      break;
  }
  return rec as ReviewRecord;
}

// Stamp ts + actor + kind on a record (server authoritative).
export function stampRecord(rec: any, actor = ACTOR): any {
  const out: any = { ...rec, kind: REVIEW_KIND, ts: new Date().toISOString(), actor };
  if (rec.rkind === "comment" && !out.comment_id) {
    out.comment_id = out.thread_id + ":" + Math.random().toString(36).slice(2, 9);
  }
  return out;
}

// Append review records (one \n-terminated JSON line each). Never rewrites.
export async function appendReviewRecords(
  filePath: string,
  records: any[],
  actor = ACTOR
): Promise<any[]> {
  const stamped = records.map((r) => stampRecord(validateRecord(r), actor));
  const text = stamped.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await appendFile(filePath, text, "utf8");
  return stamped;
}

export { ACTOR as REVIEW_ACTOR };

// Convenience: resolve a task id to its jsonl path under a tasks dir.
export function taskFilePath(tasksDir: string, id: string): string {
  return join(tasksDir, id + ".jsonl");
}
