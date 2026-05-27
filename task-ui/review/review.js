"use strict";
// Review Workstation overlay controller.
// Loaded with `defer` from index.html; dynamically imports render/comments/ai
// + libs on first open. Keeps the initial dashboard load unchanged.

// ---- vendored-first lib loader ----
// CAP flags drive graceful degradation when a lib fails to load.
window.REVIEW_CAP = window.REVIEW_CAP || {
  diff2html: false,
  hljs: false,
  marked: false,
  purify: false,
  fuse: false,
};

const VENDOR = "/vendor/";
const CDN = {
  diff2html_js: "https://cdn.jsdelivr.net/npm/diff2html@3.4.48/bundles/js/diff2html.min.js",
  diff2html_css: "https://cdn.jsdelivr.net/npm/diff2html@3.4.48/bundles/css/diff2html.min.css",
  hljs_js: "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/highlight.min.js",
  hljs_css: "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/styles/github.min.css",
  marked_js: "https://cdn.jsdelivr.net/npm/marked@14.1.3/marked.min.js",
  purify_js: "https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.min.js",
  fuse_js: "https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js",
};

// Try vendored path first; on error fall back to the CDN url.
function loadScript(vendorFile, cdnUrl) {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = VENDOR + vendorFile;
    s.onload = () => resolve(true);
    s.onerror = () => {
      const s2 = document.createElement("script");
      s2.src = cdnUrl;
      s2.onload = () => resolve(true);
      s2.onerror = () => resolve(false);
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  });
}
function loadCss(vendorFile, cdnUrl) {
  return new Promise((resolve) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = VENDOR + vendorFile;
    l.onload = () => resolve(true);
    l.onerror = () => {
      const l2 = document.createElement("link");
      l2.rel = "stylesheet";
      l2.href = cdnUrl;
      l2.onload = () => resolve(true);
      l2.onerror = () => resolve(false);
      document.head.appendChild(l2);
    };
    document.head.appendChild(l);
  });
}

let LIBS_LOADED = false;
async function ensureLibs() {
  if (LIBS_LOADED) return;
  await Promise.all([
    loadCss("diff2html.min.css", CDN.diff2html_css),
    loadCss("highlight.min.css", CDN.hljs_css),
  ]);
  await Promise.all([
    loadScript("diff2html.min.js", CDN.diff2html_js),
    loadScript("highlight.min.js", CDN.hljs_js),
    loadScript("marked.min.js", CDN.marked_js),
    loadScript("purify.min.js", CDN.purify_js),
    loadScript("fuse.min.js", CDN.fuse_js),
  ]);
  const CAP = window.REVIEW_CAP;
  CAP.diff2html = typeof window.Diff2Html !== "undefined" && !!window.Diff2Html.html;
  CAP.hljs = typeof window.hljs !== "undefined";
  CAP.marked = typeof window.marked !== "undefined";
  CAP.purify = typeof window.DOMPurify !== "undefined";
  CAP.fuse = typeof window.Fuse !== "undefined";
  LIBS_LOADED = true;
}

// ---- module loader (render/comments/ai) ----
let MODS = null;
async function ensureModules() {
  if (MODS) return MODS;
  const [render, comments, ai] = await Promise.all([
    import("/review/review-render.js"),
    import("/review/review-comments.js"),
    import("/review/review-ai.js"),
  ]);
  MODS = { render, comments, ai };
  return MODS;
}

// ---- A–G checklist (mirrors tasks/gen_tasks.py meanings) ----
export const CHECKLIST_BY_PATTERN = {
  A: [
    { id: "A1", text: "useRef(...) replaced by a signal (useRef→signal)" },
    { id: "A2", text: "t-custom-ref replaced by t-ref bound to the signal" },
    { id: "A3", text: ".el accesses replaced by calling the signal ()" },
  ],
  B: [
    { id: "B1", text: "useEffect deps no longer read .el directly" },
    { id: "B2", text: "useRefListener migrated to signal-based listener" },
  ],
  C: [{ id: "C1", text: "Loop refs (t-foreach + t-custom-ref) handled per-item correctly" }],
  D: [
    { id: "D1", text: "useChildRef / useForwardRefToParent removed" },
    { id: "D2", text: "t-ref on a Component removed (forbidden in Owl 3)" },
    { id: "D3", text: "Parent-owned signal passed to child as a prop" },
  ],
  E: [{ id: "E1", text: "useRef(variable) dynamic-ref case migrated" }],
  F: [{ id: "F1", text: "Helper (usePosition/useSortable/…) fed a signal, not a string ref" }],
  G: [{ id: "G1", text: "Guards reading .el (if (x.el)) updated for signal nullability" }],
};

// ---- overlay state ----
const STATE = {
  open: false,
  id: null,
  context: null,
  review: null, // folded review
  diff: null,
  files: [],
  activeFile: null,
  priorHash: "",
  pollTimer: null,
};
export { STATE };

const apiBase = "";
export async function api(path, opts) {
  const r = await fetch(apiBase + path, opts);
  let data = null;
  try {
    data = await r.json();
  } catch {}
  return { ok: r.ok, status: r.status, data };
}

let overlayEl = null;
function ov() {
  if (!overlayEl) overlayEl = document.getElementById("review-overlay");
  return overlayEl;
}

// ---- open / close ----
export async function openReview(id, scrollFile) {
  const overlay = ov();
  if (!overlay) return;
  STATE.id = id;
  STATE.open = true;
  if (!location.hash.startsWith("#/review/")) STATE.priorHash = location.hash;
  overlay.hidden = false;
  overlay.innerHTML = '<div class="rv-loading">Loading review…</div>';
  document.body.classList.add("rv-open");

  const ctxRes = await api(`/api/review/context?id=${encodeURIComponent(id)}`);
  if (!ctxRes.ok) {
    if (ctxRes.status === 409) {
      renderEmpty(
        "This task hasn't been run yet — no diff to review."
      );
    } else {
      renderEmpty("Failed to load review: " + (ctxRes.data?.error || ctxRes.status));
    }
    return;
  }
  STATE.context = ctxRes.data;

  await ensureLibs();
  const mods = await ensureModules();

  const [diffRes, revRes] = await Promise.all([
    api(`/api/review/diff?id=${encodeURIComponent(id)}&context=3`),
    api(`/api/review?id=${encodeURIComponent(id)}`),
  ]);
  STATE.diff = diffRes.data;
  STATE.files = diffRes.data?.files || [];
  STATE.review = revRes.data;

  mods.render.renderOverlay(overlay, STATE, mods);
  if (scrollFile) mods.render.scrollToFile(scrollFile);

  // record a visit (M4 "what changed since last visit")
  api(`/api/review?id=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      records: [{ rkind: "visit", head: STATE.context.head }],
    }),
  }).catch(() => {});

  startPolling();
  trapFocus(overlay);
}

export function closeReview() {
  const overlay = ov();
  if (!overlay) return;
  STATE.open = false;
  overlay.hidden = true;
  overlay.innerHTML = "";
  document.body.classList.remove("rv-open");
  stopPolling();
  // restore prior hash
  if (location.hash.startsWith("#/review/")) {
    location.hash = STATE.priorHash || "";
  }
}

function renderEmpty(msg) {
  const overlay = ov();
  overlay.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "rv-empty";
  const card = document.createElement("div");
  card.className = "rv-empty-card";
  card.textContent = msg;
  const btn = document.createElement("button");
  btn.textContent = "Close";
  btn.className = "rv-btn";
  btn.addEventListener("click", closeReview);
  card.appendChild(document.createElement("br"));
  card.appendChild(btn);
  wrap.appendChild(card);
  overlay.appendChild(wrap);
  trapFocus(overlay);
}

// ---- live polling (only when visible) ----
function startPolling() {
  stopPolling();
  STATE.pollTimer = setInterval(async () => {
    if (document.visibilityState !== "visible" || !STATE.open) return;
    const res = await api(`/api/review/context?id=${encodeURIComponent(STATE.id)}`);
    if (res.ok && res.data?.head && STATE.context && res.data.head !== STATE.context.head) {
      showRefreshBanner();
    }
  }, 15000);
}
function stopPolling() {
  if (STATE.pollTimer) clearInterval(STATE.pollTimer);
  STATE.pollTimer = null;
}
function showRefreshBanner() {
  const overlay = ov();
  if (overlay.querySelector(".rv-refresh-banner")) return;
  const b = document.createElement("div");
  b.className = "rv-refresh-banner";
  b.textContent = "diff updated — ";
  const a = document.createElement("button");
  a.className = "rv-btn rv-btn-sm";
  a.textContent = "refresh";
  a.addEventListener("click", () => openReview(STATE.id));
  b.appendChild(a);
  overlay.prepend(b);
}

// ---- focus trap + keyboard ----
function trapFocus(overlay) {
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.tabIndex = -1;
  overlay.focus();
}

function onKeydown(e) {
  if (!STATE.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeReview();
    return;
  }
  // don't hijack typing in inputs/textareas
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return;
  if (e.key === "Tab") {
    const overlay = ov();
    const focusable = overlay.querySelectorAll(
      'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
    return;
  }
  if (!MODS) return;
  const r = MODS.render;
  if (e.key === "j") r.nextFile(1);
  else if (e.key === "k") r.nextFile(-1);
  else if (e.key === "v") r.toggleViewedActive();
  else if (e.key === "a") MODS.comments.setVerdict("approved");
  else if (e.key === "r") MODS.comments.setVerdict("changes_requested");
  else if (e.key === "n") r.nextComment(1);
  else if (e.key === "p") r.nextComment(-1);
}

// ---- hash routing ----
function syncFromHash() {
  const h = location.hash;
  const m = h.match(/^#\/review\/([^/]+)(?:\/(.+))?$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const file = m[2] ? decodeURIComponent(m[2]) : null;
    if (!STATE.open || STATE.id !== id) {
      openReview(id, file);
    } else if (file && MODS) {
      MODS.render.scrollToFile(file);
    }
  } else if (STATE.open) {
    closeReview();
  }
}

export function navigateToReview(id) {
  location.hash = "#/review/" + encodeURIComponent(id);
}

window.addEventListener("hashchange", syncFromHash);
window.addEventListener("keydown", onKeydown);
window.addEventListener("DOMContentLoaded", () => {
  if (location.hash.startsWith("#/review/")) syncFromHash();
});
// if DOMContentLoaded already fired
if (document.readyState !== "loading" && location.hash.startsWith("#/review/")) {
  syncFromHash();
}

// expose for app.js (non-module) to call
window.ReviewWS = {
  open: navigateToReview,
  openDirect: openReview,
  close: closeReview,
  CHECKLIST_BY_PATTERN,
};
