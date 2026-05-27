"use strict";
// Diff render + file tree + overlay layout + minimap + symbol nav.
import { STATE, api, closeReview } from "/review/review.js";
import * as Comments from "/review/review-comments.js";
import * as AI from "/review/review-ai.js";

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

let MODS = null;
let DIFF_CONTAINER = null;

export function renderOverlay(overlay, state, mods) {
  MODS = mods;
  overlay.innerHTML = "";
  const wrap = el("div", "rv-wrap");

  wrap.appendChild(renderTopbar(state));

  const body = el("div", "rv-body");
  body.appendChild(renderFileTree(state));
  body.appendChild(renderCenter(state));
  body.appendChild(renderRight(state));
  wrap.appendChild(body);

  overlay.appendChild(wrap);
}

// ---- top bar ----
function renderTopbar(state) {
  const bar = el("div", "rv-topbar");
  const left = el("div", "rv-topbar-left");
  left.appendChild(el("span", "rv-comp", state.context.id));
  left.appendChild(el("span", "rv-branch mono", state.context.branch || "—"));
  if (state.context.dirty) {
    const c = el("span", "rv-chip rv-chip-warn", "uncommitted changes");
    c.title = "uncommitted changes present; diff is mergeBase..HEAD only.";
    left.appendChild(c);
  }
  left.appendChild(el("span", "rv-chip", (state.context.ahead ?? 0) + " ahead"));
  if (state.context.run_status)
    left.appendChild(el("span", "rv-chip", "run: " + state.context.run_status));
  if (state.context.pushed)
    left.appendChild(
      el("span", "rv-chip", "pushed → " + (state.context.pushed.remote || ""))
    );
  bar.appendChild(left);

  const right = el("div", "rv-topbar-right");
  // verdict buttons
  const cur = state.review?.verdict;
  for (const [v, label] of [
    ["approved", "Approve"],
    ["changes_requested", "Request changes"],
    ["commented", "Comment"],
  ]) {
    const b = el("button", "rv-btn rv-verdict-btn" + (cur === v ? " active" : ""), label);
    b.dataset.verdict = v;
    b.addEventListener("click", () => Comments.setVerdict(v));
    right.appendChild(b);
  }
  const exp = el("button", "rv-btn", "Export");
  exp.addEventListener("click", () => {
    window.open(`/api/review/export?id=${encodeURIComponent(state.id)}&format=md`, "_blank");
  });
  right.appendChild(exp);
  const close = el("button", "rv-btn rv-close", "✕");
  close.title = "Close (Esc)";
  close.addEventListener("click", closeReview);
  right.appendChild(close);
  bar.appendChild(right);
  return bar;
}

// ---- left: file tree ----
function renderFileTree(state) {
  const panel = el("div", "rv-files");
  const head = el("div", "rv-files-head");
  const viewedCount = Object.keys(state.review?.viewed || {}).length;
  head.appendChild(el("span", null, "Files (" + state.files.length + ")"));
  const prog = el("span", "rv-progress mono", viewedCount + "/" + state.files.length + " viewed");
  prog.id = "rv-progress";
  head.appendChild(prog);
  panel.appendChild(head);

  // fuzzy filter input
  const filter = el("input", "rv-file-filter");
  filter.placeholder = "filter files…";
  panel.appendChild(filter);

  const list = el("div", "rv-file-list");
  list.id = "rv-file-list";
  panel.appendChild(list);

  function paint(files) {
    list.innerHTML = "";
    for (const f of files) {
      const row = el("div", "rv-file-row");
      row.dataset.path = f.path;
      const viewedSha = state.review?.viewed?.[f.path];
      const changed = viewedSha && viewedSha !== state.context.head;
      const chk = el("span", "rv-viewed-chk" + (viewedSha ? " on" : ""), viewedSha ? "✓" : "○");
      chk.title = viewedSha ? (changed ? "changed since viewed" : "viewed") : "mark viewed";
      chk.addEventListener("click", (e) => {
        e.stopPropagation();
        Comments.toggleViewed(f.path);
      });
      row.appendChild(chk);
      const name = el("span", "rv-file-name", shortPath(f.path));
      name.title = f.path;
      row.appendChild(name);
      const stat = el("span", "rv-file-stat");
      stat.appendChild(el("span", "rv-add", "+" + f.additions));
      stat.appendChild(el("span", "rv-del", "−" + f.deletions));
      if (changed) stat.appendChild(el("span", "rv-chip rv-chip-warn rv-chip-mini", "changed"));
      row.appendChild(stat);
      row.addEventListener("click", () => scrollToFile(f.path));
      list.appendChild(row);
    }
  }
  paint(state.files);

  filter.addEventListener("input", () => {
    const q = filter.value.trim();
    if (!q) return paint(state.files);
    if (window.REVIEW_CAP.fuse && window.Fuse) {
      const fuse = new window.Fuse(state.files, { keys: ["path"], threshold: 0.4 });
      paint(fuse.search(q).map((r) => r.item));
    } else {
      paint(state.files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase())));
    }
  });

  return panel;
}

function shortPath(p) {
  const seg = p.split("/");
  return seg.length > 3 ? ".../" + seg.slice(-2).join("/") : p;
}

// ---- center: diff ----
function renderCenter(state) {
  const center = el("div", "rv-center");
  const minimap = el("canvas", "rv-minimap");
  minimap.id = "rv-minimap";
  center.appendChild(minimap);

  const diffWrap = el("div", "rv-diff");
  diffWrap.id = "rv-diff";
  DIFF_CONTAINER = diffWrap;
  center.appendChild(diffWrap);

  renderDiff(state, diffWrap);
  // minimap after diff is laid out
  requestAnimationFrame(() => drawMinimap(minimap, diffWrap));
  diffWrap.addEventListener("scroll", () =>
    requestAnimationFrame(() => drawMinimap(minimap, diffWrap))
  );
  return center;
}

// Migration diffs are tiny (usually one file). Guard against pathological
// huge diffs so the page never freezes: above this many files, render
// per-file on demand instead of the full unified diff at once.
const LARGE_FILE_COUNT = 60;

function renderDiff(state, container) {
  container.innerHTML = "";
  if ((state.files?.length || 0) > LARGE_FILE_COUNT && !state.scopedFile) {
    const note = el("div", "rv-empty-diff");
    note.appendChild(
      el(
        "div",
        "rv-chip rv-chip-warn",
        "Large diff (" + state.files.length + " files) — select a file to view its diff."
      )
    );
    container.appendChild(note);
    return;
  }
  const unified = state.diff?.unified || "";
  if (!unified.trim()) {
    container.appendChild(el("div", "rv-empty-diff muted", "No changes in this range."));
    return;
  }
  if (window.REVIEW_CAP.diff2html && window.Diff2Html) {
    const html = window.Diff2Html.html(unified, {
      drawFileList: false,
      matching: "lines",
      outputFormat: "side-by-side",
    });
    // diff2html output is library-generated HTML (no user input) — safe to assign.
    container.innerHTML = html;
    // syntax highlight code cells if hljs available
    if (window.REVIEW_CAP.hljs && window.hljs) {
      container.querySelectorAll(".d2h-code-line-ctn").forEach((node) => {
        try {
          window.hljs.highlightElement(node);
        } catch {}
      });
    }
    wireLineComments(container, state);
    if (state.diff?.truncated) {
      container.prepend(
        el("div", "rv-chip rv-chip-warn", "diff truncated (large) — showing first 5MB")
      );
    }
  } else {
    // degrade: raw <pre>
    const pre = el("pre", "rv-raw-diff");
    pre.textContent = unified;
    container.appendChild(pre);
  }
  Comments.renderInlineThreads(container, state);
}

// click a diff gutter line → open comment box
function wireLineComments(container, state) {
  container.querySelectorAll("tr").forEach((tr) => {
    const lineNo = tr.querySelector(".d2h-code-side-linenumber");
    if (!lineNo) return;
    tr.classList.add("rv-commentable");
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".rv-comment-box") || e.target.closest(".rv-thread")) return;
      // find file path: nearest preceding file header
      const fileWrap = tr.closest(".d2h-file-wrapper");
      const fileName = fileWrap?.querySelector(".d2h-file-name")?.textContent?.trim();
      const ln = parseInt(lineNo.textContent.trim(), 10);
      const side = tr.querySelector(".d2h-code-side-line") ? "new" : "new";
      Comments.openCommentBox(tr, fileName, isNaN(ln) ? null : ln, side);
    });
  });
}

// ---- right: tabs (comments / checklist / AI) ----
function renderRight(state) {
  const panel = el("div", "rv-right");
  const tabs = el("div", "rv-tabs");
  const contents = el("div", "rv-tab-contents");

  const tabDefs = [
    ["comments", "Comments", () => Comments.renderCommentsTab(contents, state)],
    ["checklist", "Checklist", () => renderChecklistTab(contents, state)],
    ["ai", "AI", () => AI.renderAiTab(contents, state)],
  ];
  for (const [key, label, render] of tabDefs) {
    const t = el("button", "rv-tab", label);
    t.dataset.tab = key;
    t.addEventListener("click", () => {
      tabs.querySelectorAll(".rv-tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      contents.innerHTML = "";
      render();
    });
    tabs.appendChild(t);
  }
  panel.appendChild(tabs);
  panel.appendChild(contents);
  // default tab
  tabs.querySelector('[data-tab="comments"]').classList.add("active");
  Comments.renderCommentsTab(contents, state);
  // hide AI tab if unavailable (probe async)
  api("/api/ai/status").then((res) => {
    if (!res.data?.available) {
      const aiTab = tabs.querySelector('[data-tab="ai"]');
      if (aiTab) {
        aiTab.disabled = true;
        aiTab.title = "AI unavailable: " + (res.data?.reason || "n/a");
        aiTab.classList.add("rv-disabled");
      }
    }
  });
  return panel;
}

// ---- checklist (M2) ----
function renderChecklistTab(container, state) {
  const patterns = (window.TASKS_BY_ID?.get?.(state.id)?.patterns) || state.context.patterns || [];
  const CL = window.ReviewWS.CHECKLIST_BY_PATTERN;
  if (!patterns.length) {
    container.appendChild(el("div", "muted", "No patterns on this task."));
    return;
  }
  for (const p of patterns) {
    const items = CL[p];
    if (!items) continue;
    const group = el("div", "rv-cl-group");
    group.appendChild(el("div", "rv-cl-head", "Pattern " + p));
    for (const it of items) {
      const row = el("label", "rv-cl-item");
      const cb = el("input");
      cb.type = "checkbox";
      const key = "checklist:" + it.id;
      cb.checked = !!state.review?.viewed?.[key];
      cb.addEventListener("change", () => {
        Comments.postRecords([
          { rkind: "viewed", path: key, sha: state.context.head, viewed: cb.checked },
        ]);
      });
      row.appendChild(cb);
      row.appendChild(el("span", null, it.text));
      group.appendChild(row);
    }
    container.appendChild(group);
  }
}

// ---- navigation helpers (keyboard) ----
// In large-diff mode, fetch + render just this file's diff.
async function loadScopedFile(path) {
  STATE.scopedFile = path;
  const res = await api(
    `/api/review/diff?id=${encodeURIComponent(STATE.id)}&context=3&file=${encodeURIComponent(path)}`
  );
  if (res.ok) {
    STATE.diff = { ...STATE.diff, unified: res.data.unified, truncated: res.data.truncated };
    renderDiff(STATE, DIFF_CONTAINER);
    STATE.activeFile = path;
  }
}

export function scrollToFile(path) {
  if (!DIFF_CONTAINER) return;
  // large-diff mode: load this single file's diff on demand
  if ((STATE.files?.length || 0) > LARGE_FILE_COUNT) {
    loadScopedFile(path);
    document.querySelectorAll(".rv-file-row").forEach((r) =>
      r.classList.toggle("active", r.dataset.path === path)
    );
    return;
  }
  const headers = DIFF_CONTAINER.querySelectorAll(".d2h-file-name");
  for (const h of headers) {
    if (h.textContent.trim() === path || h.textContent.trim().endsWith(path)) {
      h.closest(".d2h-file-wrapper")?.scrollIntoView({ behavior: "smooth", block: "start" });
      STATE.activeFile = path;
      return;
    }
  }
  // fallback: highlight file row
  const row = document.querySelector(`.rv-file-row[data-path="${CSS.escape(path)}"]`);
  if (row) {
    document.querySelectorAll(".rv-file-row").forEach((r) => r.classList.remove("active"));
    row.classList.add("active");
    STATE.activeFile = path;
  }
}

export function nextFile(dir) {
  const files = STATE.files;
  if (!files.length) return;
  let idx = files.findIndex((f) => f.path === STATE.activeFile);
  idx = (idx + dir + files.length) % files.length;
  scrollToFile(files[idx].path);
}

let commentIdx = -1;
export function nextComment(dir) {
  const threads = DIFF_CONTAINER?.querySelectorAll(".rv-thread") || [];
  if (!threads.length) return;
  commentIdx = (commentIdx + dir + threads.length) % threads.length;
  threads[commentIdx].scrollIntoView({ behavior: "smooth", block: "center" });
}

export function toggleViewedActive() {
  if (STATE.activeFile) Comments.toggleViewed(STATE.activeFile);
  else if (STATE.files[0]) Comments.toggleViewed(STATE.files[0].path);
}

// ---- minimap (M4) ----
function drawMinimap(canvas, diffWrap) {
  if (!canvas || !diffWrap) return;
  const h = diffWrap.clientHeight;
  const w = 10;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const total = diffWrap.scrollHeight || 1;
  // map insertion/deletion rows
  const adds = diffWrap.querySelectorAll(".d2h-ins");
  const dels = diffWrap.querySelectorAll(".d2h-del");
  const styles = getComputedStyle(document.documentElement);
  const addC = styles.getPropertyValue("--st-done") || "#16a34a";
  const delC = styles.getPropertyValue("--st-blocked") || "#dc2626";
  const mark = (nodes, color) => {
    ctx.fillStyle = color.trim();
    nodes.forEach((n) => {
      const y = (n.offsetTop / total) * h;
      ctx.fillRect(0, y, w, Math.max(1, (n.offsetHeight / total) * h));
    });
  };
  mark(adds, addC);
  mark(dels, delC);
  // viewport indicator
  ctx.fillStyle = "rgba(37,99,235,0.25)";
  const vy = (diffWrap.scrollTop / total) * h;
  ctx.fillRect(0, vy, w, (h / total) * h);
  canvas.onclick = (e) => {
    const frac = e.offsetY / h;
    diffWrap.scrollTop = frac * total;
  };
}

export { DIFF_CONTAINER };
