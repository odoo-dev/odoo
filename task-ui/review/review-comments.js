"use strict";
// Threads, drafts, verdict, viewed, persistence calls.
import { STATE, api, openReview } from "/review/review.js";

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// Post review records, then refresh folded review + re-render affected panels.
export async function postRecords(records, expectVersion) {
  const body = { records };
  if (expectVersion != null) body.expectVersion = expectVersion;
  const res = await api(`/api/review?id=${encodeURIComponent(STATE.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    STATE.review = res.data;
    refreshDerived();
  }
  return res;
}

// Re-render the bits that depend on review state without rebuilding the diff.
function refreshDerived() {
  // progress
  const prog = document.getElementById("rv-progress");
  if (prog)
    prog.textContent =
      Object.keys(STATE.review.viewed || {}).filter((k) => !k.startsWith("checklist:"))
        .length +
      "/" +
      STATE.files.length +
      " viewed";
  // viewed checks
  document.querySelectorAll(".rv-file-row").forEach((row) => {
    const p = row.dataset.path;
    const sha = STATE.review.viewed?.[p];
    const chk = row.querySelector(".rv-viewed-chk");
    if (chk) {
      chk.classList.toggle("on", !!sha);
      chk.textContent = sha ? "✓" : "○";
    }
  });
  // verdict buttons
  document.querySelectorAll(".rv-verdict-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.verdict === STATE.review.verdict);
  });
  // comments tab
  const tab = document.querySelector(".rv-tab.active");
  if (tab?.dataset.tab === "comments") {
    const contents = document.querySelector(".rv-tab-contents");
    if (contents) {
      contents.innerHTML = "";
      renderCommentsTab(contents, STATE);
    }
  }
  // inline threads
  const diff = document.getElementById("rv-diff");
  if (diff) renderInlineThreads(diff, STATE);
}

export function setVerdict(verdict) {
  postRecords([{ rkind: "verdict", verdict }]);
}

export function toggleViewed(path) {
  const cur = STATE.review.viewed?.[path];
  postRecords([
    { rkind: "viewed", path, sha: STATE.context.head, viewed: !cur },
  ]);
}

// ---- inline comment box on a diff line ----
let openBox = null;
export function openCommentBox(tr, path, line, side) {
  if (openBox) openBox.remove();
  const draftKey = `review-draft:${STATE.id}:${path}:${line}`;
  const box = el("tr", "rv-comment-box-row");
  const td = el("td");
  td.colSpan = 4;
  const wrap = el("div", "rv-comment-box");
  const ta = el("textarea", "rv-comment-input");
  ta.placeholder = "Comment on " + (path || "review") + (line ? ":" + line : "") + "…";
  ta.value = localStorage.getItem(draftKey) || "";
  ta.addEventListener("input", () => localStorage.setItem(draftKey, ta.value));
  wrap.appendChild(ta);
  const actions = el("div", "rv-comment-actions");
  const pub = el("button", "rv-btn rv-btn-sm", "Comment");
  pub.addEventListener("click", async () => {
    const body = ta.value.trim();
    if (!body) return;
    const thread_id = "th_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await postRecords([{ rkind: "comment", thread_id, path, line, side, body }]);
    localStorage.removeItem(draftKey);
    box.remove();
    openBox = null;
  });
  const cancel = el("button", "rv-btn rv-btn-sm", "Cancel");
  cancel.addEventListener("click", () => {
    box.remove();
    openBox = null;
  });
  actions.appendChild(pub);
  actions.appendChild(cancel);
  wrap.appendChild(actions);
  td.appendChild(wrap);
  box.appendChild(td);
  tr.after(box);
  openBox = box;
  ta.focus();
}

// ---- render existing threads inline beneath their lines ----
export function renderInlineThreads(container, state) {
  // remove previously rendered inline threads
  container.querySelectorAll(".rv-thread-row").forEach((r) => r.remove());
  const threads = (state.review?.threads || []).filter((t) => t.path && t.line);
  if (!threads.length) return;
  const fileWraps = container.querySelectorAll(".d2h-file-wrapper");
  for (const th of threads) {
    // find the matching file wrapper + line
    for (const fw of fileWraps) {
      const name = fw.querySelector(".d2h-file-name")?.textContent?.trim();
      if (!name || !(name === th.path || name.endsWith(th.path))) continue;
      let targetTr = null;
      fw.querySelectorAll("tr").forEach((tr) => {
        const ln = tr.querySelector(".d2h-code-side-linenumber");
        if (ln && parseInt(ln.textContent.trim(), 10) === th.line) targetTr = tr;
      });
      if (targetTr) {
        targetTr.after(threadRow(th));
      }
      break;
    }
  }
}

function threadRow(th) {
  const tr = el("tr", "rv-thread-row");
  const td = el("td");
  td.colSpan = 4;
  td.appendChild(renderThread(th));
  tr.appendChild(td);
  return tr;
}

function renderThread(th) {
  const wrap = el("div", "rv-thread" + (th.resolved ? " resolved" : ""));
  for (const c of th.comments) {
    const cm = el("div", "rv-comment");
    const head = el("div", "rv-comment-head");
    head.appendChild(el("span", "rv-comment-actor", c.actor));
    head.appendChild(el("span", "rv-comment-ts mono", (c.ts || "").slice(0, 19)));
    cm.appendChild(head);
    cm.appendChild(renderBody(c.body));
    wrap.appendChild(cm);
  }
  const actions = el("div", "rv-thread-actions");
  const reply = el("input", "rv-reply-input");
  reply.placeholder = "reply…";
  reply.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && reply.value.trim()) {
      postRecords([{ rkind: "comment", thread_id: th.thread_id, path: th.path, line: th.line, side: th.side, body: reply.value.trim(), parent_id: th.thread_id }]);
    }
  });
  actions.appendChild(reply);
  const res = el("button", "rv-btn rv-btn-sm", th.resolved ? "Unresolve" : "Resolve");
  res.addEventListener("click", () =>
    postRecords([{ rkind: "resolve", thread_id: th.thread_id, resolved: !th.resolved }])
  );
  actions.appendChild(res);
  wrap.appendChild(actions);
  return wrap;
}

// Render comment body. Use marked+DOMPurify if available; else textContent.
function renderBody(text) {
  const div = el("div", "rv-comment-body");
  if (window.REVIEW_CAP.marked && window.REVIEW_CAP.purify && window.marked && window.DOMPurify) {
    const raw = window.marked.parse(text, { breaks: true });
    div.innerHTML = window.DOMPurify.sanitize(raw);
  } else {
    // HARD REQUIRE: never inject HTML without DOMPurify
    div.textContent = text;
  }
  return div;
}

// ---- comments tab (review-level + all threads list) ----
export function renderCommentsTab(container, state) {
  // review-level comment box
  const rlBox = el("div", "rv-rl-comment");
  const ta = el("textarea", "rv-comment-input");
  ta.placeholder = "Add a review-level comment…";
  rlBox.appendChild(ta);
  const add = el("button", "rv-btn rv-btn-sm", "Comment");
  add.addEventListener("click", () => {
    const body = ta.value.trim();
    if (!body) return;
    const thread_id = "th_rl_" + Date.now().toString(36);
    postRecords([{ rkind: "comment", thread_id, body }]);
    ta.value = "";
  });
  rlBox.appendChild(add);
  container.appendChild(rlBox);

  const threads = state.review?.threads || [];
  if (!threads.length) {
    container.appendChild(el("div", "muted", "No comments yet. Click a diff line to comment."));
    return;
  }
  for (const th of threads) {
    const item = el("div", "rv-thread-list-item");
    const loc = th.path
      ? th.path + (th.line ? ":" + th.line : "")
      : "review-level";
    const locEl = el("div", "rv-thread-loc mono", loc);
    if (th.path && th.line) {
      locEl.classList.add("link");
      locEl.addEventListener("click", () => {
        import("/review/review-render.js").then((r) => r.scrollToFile(th.path));
      });
    }
    item.appendChild(locEl);
    item.appendChild(renderThread(th));
    container.appendChild(item);
  }
}
