// Review feature — shared TS types + record-kind constants.
// Review records are appended to the SAME tasks/<id>.jsonl as kind:"review".

export const REVIEW_KIND = "review" as const;

export type ReviewRecordKind =
  | "verdict"
  | "viewed"
  | "comment"
  | "resolve"
  | "draft"
  | "visit";

export const REVIEW_RKINDS: ReviewRecordKind[] = [
  "verdict",
  "viewed",
  "comment",
  "resolve",
  "draft",
  "visit",
];

export type Verdict = "approved" | "changes_requested" | "commented";

// Base shape: every review record is {kind:"review", rkind, ts, actor, ...}
export interface ReviewRecordBase {
  kind: "review";
  rkind: ReviewRecordKind;
  ts: string;
  actor: string;
}

export interface VerdictRecord extends ReviewRecordBase {
  rkind: "verdict";
  verdict: Verdict;
  note?: string;
}

export interface ViewedRecord extends ReviewRecordBase {
  rkind: "viewed";
  path: string;
  sha: string;
  viewed: boolean;
}

export interface CommentRecord extends ReviewRecordBase {
  rkind: "comment";
  thread_id: string;
  comment_id?: string;
  path?: string;
  line?: number;
  side?: "old" | "new";
  body: string;
  parent_id?: string;
}

export interface ResolveRecord extends ReviewRecordBase {
  rkind: "resolve";
  thread_id: string;
  resolved: boolean;
}

export interface DraftRecord extends ReviewRecordBase {
  rkind: "draft";
  thread_id: string;
  body: string;
}

export interface VisitRecord extends ReviewRecordBase {
  rkind: "visit";
  head: string;
}

export type ReviewRecord =
  | VerdictRecord
  | ViewedRecord
  | CommentRecord
  | ResolveRecord
  | DraftRecord
  | VisitRecord;

// Folded review state shape (returned by GET /api/review).
export interface ReviewThread {
  thread_id: string;
  path: string | null;
  line: number | null;
  side: "old" | "new" | null;
  resolved: boolean;
  comments: { actor: string; ts: string; body: string; comment_id: string }[];
}

export interface FoldedReview {
  verdict: Verdict | null;
  verdict_by: string | null;
  verdict_at: string | null;
  verdict_note: string | null;
  viewed: Record<string, string>; // path -> sha
  threads: ReviewThread[];
  visit: string | null; // last visited head sha
  version: number; // total review-record count
}

// Parsed commit line "<shortsha> <subject>" => {sha, subject}
export interface ParsedCommit {
  sha: string;
  subject: string;
}

// git diff file entry
export interface DiffFile {
  path: string;
  old_path: string | null;
  status: string; // A|M|D|R|C|T...
  additions: number;
  deletions: number;
  binary: boolean;
}
