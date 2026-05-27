"use strict";

const PATTERNS = ["A", "B", "C", "D", "E", "F", "G"];
const METRIC_KEYS = [
  "useRef", "el_access", "t_custom_ref", "loop_ref",
  "useChildRef", "useForwardRefToParent", "useEffect_dep",
];
const KNOWN_STATUSES = ["pending", "ready", "in_progress", "blocked", "needs_input", "done"];

let TASKS = [];            // folded summaries
let TASKS_BY_ID = new Map();
let WAVES = [];            // wave rollups (ordered wave-0..wave-5)
let WAVES_BY_ID = new Map();
let SELECTED_ID = null;     // selected file-task id
let SELECTED_WAVE = null;   // selected wave id (header)
const collapsed = new Set(); // collapsed node keys (wave ids and "<waveId>::<folderPath>")
const FOLDER_SEEN = new Set(); // folder keys we've decided a default collapse state for
const LARGE_FOLDER = 25;    // folders with more tasks than this start collapsed

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function statusClass(s) {
  return KNOWN_STATUSES.includes(s) ? "st-" + s : "st-unknown";
}
function badge(status) {
  const b = el("span", "badge " + statusClass(status), status || "?");
  return b;
}

// Verdict badge for a folded task summary (null when no verdict yet).
function reviewBadge(t) {
  if (!t || !t.verdict) return null;
  const map = {
    approved: ["rv-vb-approved", "✓ approved"],
    changes_requested: ["rv-vb-changes", "✗ changes"],
    commented: ["rv-vb-commented", "💬 commented"],
  };
  const [cls, label] = map[t.verdict] || ["rv-vb-commented", t.verdict];
  return el("span", "rv-verdict-badge " + cls, label);
}

// "Review" button that opens the overlay for a task (only when it has a diff).
function reviewButton(id, label) {
  const b = el("button", "rv-open-btn", label || "Review");
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (window.ReviewWS) window.ReviewWS.open(id);
  });
  return b;
}

// ---------- data load ----------
async function loadTasks() {
  const [tRes, wRes] = await Promise.all([
    fetch("/api/tasks"),
    fetch("/api/waves"),
  ]);
  TASKS = await tRes.json();
  TASKS_BY_ID = new Map(TASKS.map((t) => [t.id, t]));
  window.TASKS_BY_ID = TASKS_BY_ID; // exposed for the review overlay (checklist)
  WAVES = await wRes.json();
  WAVES_BY_ID = new Map(WAVES.map((w) => [w.id, w]));
  renderSummary();
  populateFilterOptions();
  renderTree();
  $("#task-count").textContent = TASKS.length + " tasks · " + WAVES.length + " waves";
}

// progress bar from a status_counts map; total used for width fractions.
function progressBar(counts, total) {
  const bar = el("div", "wave-prog");
  const sum = total || Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  for (const s of KNOWN_STATUSES) {
    const n = counts[s] || 0;
    if (!n) continue;
    const seg = el("div", "wave-prog-seg st-bg-" + s);
    seg.style.width = (100 * n / sum) + "%";
    seg.title = s + ": " + n;
    bar.appendChild(seg);
  }
  // unknown statuses
  for (const s of Object.keys(counts)) {
    if (KNOWN_STATUSES.includes(s)) continue;
    const seg = el("div", "wave-prog-seg st-bg-unknown");
    seg.style.width = (100 * counts[s] / sum) + "%";
    seg.title = s + ": " + counts[s];
    bar.appendChild(seg);
  }
  return bar;
}

// ---------- summary ----------
function renderSummary() {
  const byStatus = {};
  const byPattern = {};
  const byAddon = {};
  let unresolvedDeps = 0;
  let blockedOrNeeds = 0;

  for (const t of TASKS) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    for (const p of t.patterns || []) byPattern[p] = (byPattern[p] || 0) + 1;
    const seg = t.path.split("/");
    const addon = seg[0] === "addons" && seg[1] ? seg[1] : seg[0];
    byAddon[addon] = (byAddon[addon] || 0) + 1;
    if (t.status === "blocked" || t.status === "needs_input") blockedOrNeeds++;
    const unresolved = (t.depends_on || []).some((d) => {
      const dep = TASKS_BY_ID.get(d);
      return !dep || dep.status !== "done";
    });
    if (unresolved) unresolvedDeps++;
  }

  const c = $("#summary");
  c.innerHTML = "";

  const statusGroup = el("div", "group");
  statusGroup.appendChild(el("span", "label", "status"));
  for (const s of KNOWN_STATUSES) {
    if (!byStatus[s]) continue;
    const chip = el("span", "chip");
    chip.appendChild(badge(s));
    chip.appendChild(el("b", null, String(byStatus[s])));
    statusGroup.appendChild(chip);
  }
  // any unknown statuses
  for (const s of Object.keys(byStatus)) {
    if (KNOWN_STATUSES.includes(s)) continue;
    const chip = el("span", "chip");
    chip.appendChild(badge(s));
    chip.appendChild(el("b", null, String(byStatus[s])));
    statusGroup.appendChild(chip);
  }
  c.appendChild(statusGroup);

  const patGroup = el("div", "group");
  patGroup.appendChild(el("span", "label", "pattern"));
  for (const p of PATTERNS) {
    if (!byPattern[p]) continue;
    const chip = el("span", "chip");
    chip.appendChild(el("span", null, p));
    chip.appendChild(el("b", null, String(byPattern[p])));
    patGroup.appendChild(chip);
  }
  c.appendChild(patGroup);

  const addonGroup = el("div", "group");
  addonGroup.appendChild(el("span", "label", "addon"));
  const topAddons = Object.entries(byAddon).sort((a, b) => b[1] - a[1]).slice(0, 6);
  for (const [a, n] of topAddons) {
    const chip = el("span", "chip");
    chip.appendChild(el("span", "mono", a));
    chip.appendChild(el("b", null, String(n)));
    addonGroup.appendChild(chip);
  }
  if (Object.keys(byAddon).length > 6) {
    addonGroup.appendChild(el("span", "chip", "+" + (Object.keys(byAddon).length - 6) + " more"));
  }
  c.appendChild(addonGroup);

  const alertGroup = el("div", "group");
  const dchip = el("span", "chip" + (unresolvedDeps ? " warn" : ""));
  dchip.appendChild(el("span", null, "unresolved deps"));
  dchip.appendChild(el("b", null, String(unresolvedDeps)));
  alertGroup.appendChild(dchip);
  const bchip = el("span", "chip" + (blockedOrNeeds ? " warn" : ""));
  bchip.appendChild(el("span", null, "blocked/needs_input"));
  bchip.appendChild(el("b", null, String(blockedOrNeeds)));
  alertGroup.appendChild(bchip);
  c.appendChild(alertGroup);

  // per-wave progress overview row
  if (WAVES.length) {
    const waveGroup = el("div", "group wave-overview");
    waveGroup.appendChild(el("span", "label", "waves"));
    for (const w of WAVES) {
      const done = w.status_counts.done || 0;
      const cell = el("div", "wave-mini");
      cell.title = "wave " + w.wave + " — " + w.title + " (" + done + "/" + w.subtasks_total + " done)";
      const top = el("div", "wave-mini-top");
      top.appendChild(el("span", "wave-mini-num", "w" + w.wave));
      top.appendChild(el("span", "wave-mini-count", done + "/" + w.subtasks_total));
      cell.appendChild(top);
      cell.appendChild(progressBar(w.status_counts, w.subtasks_total));
      cell.addEventListener("click", () => selectWave(w.id));
      waveGroup.appendChild(cell);
    }
    c.appendChild(waveGroup);
  }
}

function populateFilterOptions() {
  const seenStatus = new Set(TASKS.map((t) => t.status));
  const ss = $("#filter-status");
  const cur = ss.value;
  ss.innerHTML = '<option value="">all</option>';
  for (const s of [...KNOWN_STATUSES, ...[...seenStatus].filter((x) => !KNOWN_STATUSES.includes(x))]) {
    if (!seenStatus.has(s)) continue;
    const o = el("option", null, s);
    o.value = s;
    ss.appendChild(o);
  }
  ss.value = cur;

  const ps = $("#filter-pattern");
  if (ps.options.length <= 1) {
    for (const p of PATTERNS) {
      const o = el("option", null, p);
      o.value = p;
      ps.appendChild(o);
    }
  }
}

// ---------- filtering ----------
function currentFilters() {
  return {
    status: $("#filter-status").value,
    pattern: $("#filter-pattern").value,
    text: $("#filter-text").value.trim().toLowerCase(),
  };
}
function matchesFilter(t, f) {
  if (f.status && t.status !== f.status) return false;
  if (f.pattern && !(t.patterns || []).includes(f.pattern)) return false;
  if (f.text) {
    const hay = (t.path + " " + t.component + " " + t.id).toLowerCase();
    if (!hay.includes(f.text)) return false;
  }
  return true;
}

// ---------- tree ----------
function buildTree(tasks) {
  // root node: { name, dirs: Map, leaves: [] }
  const root = { name: "", path: "", dirs: new Map(), leaves: [] };
  for (const t of tasks) {
    const parts = t.path.split("/");
    const fileName = parts.pop();
    let node = root;
    let acc = "";
    for (const part of parts) {
      acc = acc ? acc + "/" + part : part;
      if (!node.dirs.has(part)) {
        node.dirs.set(part, { name: part, path: acc, dirs: new Map(), leaves: [] });
      }
      node = node.dirs.get(part);
    }
    node.leaves.push({ task: t, fileName });
  }
  return root;
}

function countTasks(node) {
  let n = node.leaves.length;
  for (const child of node.dirs.values()) n += countTasks(child);
  return n;
}

function countStatuses(tasks) {
  const counts = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
  return counts;
}

// Two-level tree: waves (top) -> directory sub-tree of that wave's (filtered) tasks.
function renderTree() {
  const f = currentFilters();
  const filtered = TASKS.filter((t) => matchesFilter(t, f));
  const container = $("#tree");
  container.innerHTML = "";
  if (filtered.length === 0) {
    container.appendChild(el("div", "muted", "No tasks match the filters."));
    return;
  }
  // group filtered tasks by wave_id
  const byWave = new Map();
  for (const t of filtered) {
    const wid = t.wave_id || "(no wave)";
    if (!byWave.has(wid)) byWave.set(wid, []);
    byWave.get(wid).push(t);
  }
  // render waves in canonical order (wave-0 .. wave-5), then any leftover groups
  const orderedIds = WAVES.map((w) => w.id).filter((id) => byWave.has(id));
  for (const id of byWave.keys()) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }
  for (const id of orderedIds) {
    container.appendChild(renderWave(id, byWave.get(id)));
  }
}

function renderWave(waveId, tasks) {
  const w = WAVES_BY_ID.get(waveId);
  const wrap = el("div", "node wave-node");
  const row = el("div", "wave-row" + (waveId === SELECTED_WAVE ? " selected" : ""));
  row.dataset.wave = waveId;

  const isCollapsed = collapsed.has(waveId); // default expanded
  const twisty = el("span", "twisty", isCollapsed ? "▸" : "▾");
  row.appendChild(twisty);

  const head = el("div", "wave-row-head");
  const titleLine = el("div", "wave-title-line");
  titleLine.appendChild(el("span", "wave-num", w ? "wave " + w.wave : waveId));
  titleLine.appendChild(el("span", "wave-title", w ? w.title : waveId));
  head.appendChild(titleLine);

  // rollup: use the wave's full child counts when unfiltered would match,
  // but show the filtered-visible count alongside the wave total.
  const counts = w ? w.status_counts : countStatuses(tasks);
  const total = w ? w.subtasks_total : tasks.length;
  const done = counts.done || 0;
  const meta = el("div", "wave-meta");
  meta.appendChild(el("span", "wave-frac", done + "/" + total + " done"));
  if (tasks.length !== total) {
    meta.appendChild(el("span", "wave-shown muted", tasks.length + " shown"));
  }
  // dependency badges
  if (w) {
    for (const d of w.depends_on || []) {
      meta.appendChild(el("span", "wave-badge dep", "needs " + d));
    }
    for (const pll of w.parallel_with || []) {
      meta.appendChild(el("span", "wave-badge par", "∥ " + pll));
    }
  }
  head.appendChild(meta);
  head.appendChild(progressBar(counts, total));
  row.appendChild(head);
  wrap.appendChild(row);

  const children = el("div", "children wave-children" + (isCollapsed ? " collapsed" : ""));
  const root = buildTree(tasks);
  for (const child of [...root.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    children.appendChild(renderFolder(child, waveId));
  }
  for (const leaf of root.leaves) children.appendChild(renderLeaf(leaf));
  wrap.appendChild(children);

  // clicking the header text selects the wave; clicking the twisty toggles.
  twisty.addEventListener("click", (e) => {
    e.stopPropagation();
    if (collapsed.has(waveId)) collapsed.delete(waveId);
    else collapsed.add(waveId);
    twisty.textContent = collapsed.has(waveId) ? "▸" : "▾";
    children.classList.toggle("collapsed", collapsed.has(waveId));
  });
  head.addEventListener("click", () => selectWave(waveId));
  return wrap;
}

function renderFolder(node, waveId) {
  // collapse chains: name "a/b/c" when there is exactly one dir child and no leaves
  let display = node.name;
  let cur = node;
  while (cur.dirs.size === 1 && cur.leaves.length === 0) {
    const only = [...cur.dirs.values()][0];
    display += "/" + only.name;
    cur = only;
  }

  // wave-scoped key so the same path under different waves toggles independently
  const key = (waveId || "") + "::" + cur.path;
  const n = countTasks(cur);
  // default-collapse large folders the first time we see them
  if (!FOLDER_SEEN.has(key)) {
    FOLDER_SEEN.add(key);
    if (n > LARGE_FOLDER) collapsed.add(key);
  }

  const wrap = el("div", "node");
  const row = el("div", "folder-row");
  const isCollapsed = collapsed.has(key);
  const twisty = el("span", "twisty", isCollapsed ? "▸" : "▾");
  row.appendChild(twisty);
  row.appendChild(el("span", "folder-name", display + "/"));
  row.appendChild(el("span", "count", "(" + n + ")"));
  wrap.appendChild(row);

  const children = el("div", "children" + (isCollapsed ? " collapsed" : ""));
  for (const child of [...cur.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    children.appendChild(renderFolder(child, waveId));
  }
  for (const leaf of cur.leaves.sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    children.appendChild(renderLeaf(leaf));
  }
  wrap.appendChild(children);

  row.addEventListener("click", () => {
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    twisty.textContent = collapsed.has(key) ? "▸" : "▾";
    children.classList.toggle("collapsed", collapsed.has(key));
  });
  return wrap;
}

function renderLeaf(leaf) {
  const t = leaf.task;
  const row = el("div", "leaf-row");
  row.dataset.id = t.id;
  if (t.id === SELECTED_ID) row.classList.add("selected");
  row.appendChild(el("span", "twisty", "·"));
  row.appendChild(el("span", "leaf-comp", t.component));
  row.appendChild(el("span", "leaf-lang", t.lang));
  row.appendChild(badge(t.status));
  const vb = reviewBadge(t);
  if (vb) row.appendChild(vb);
  if (t.has_review) row.appendChild(reviewButton(t.id, "⊳"));
  row.addEventListener("click", () => selectTask(t.id));
  return row;
}

// ---------- detail ----------
async function selectTask(id) {
  SELECTED_ID = id;
  SELECTED_WAVE = null;
  document.querySelectorAll(".leaf-row").forEach((r) => {
    r.classList.toggle("selected", r.dataset.id === id);
  });
  document.querySelectorAll(".wave-row").forEach((r) => r.classList.remove("selected"));
  const detail = $("#detail");
  detail.className = "detail";
  detail.textContent = "Loading…";
  const res = await fetch("/api/tasks/" + encodeURIComponent(id));
  if (!res.ok) {
    detail.textContent = "Failed to load task " + id;
    return;
  }
  const data = await res.json();
  renderDetail(data);
}

function selectWave(id) {
  SELECTED_WAVE = id;
  SELECTED_ID = null;
  document.querySelectorAll(".leaf-row").forEach((r) => r.classList.remove("selected"));
  document.querySelectorAll(".wave-row").forEach((r) => {
    r.classList.toggle("selected", r.dataset.wave === id);
  });
  const w = WAVES_BY_ID.get(id);
  const detail = $("#detail");
  detail.className = "detail";
  if (!w) {
    detail.textContent = "Unknown wave " + id;
    return;
  }
  renderWaveDetail(w);
}

function renderWaveDetail(w) {
  const detail = $("#detail");
  detail.innerHTML = "";

  // header
  const h = el("div");
  const title = el("h2", null, "Wave " + w.wave + " — " + w.title);
  title.appendChild(document.createTextNode(" "));
  title.appendChild(badge(w.status));
  h.appendChild(title);
  h.appendChild(el("div", "subpath", w.id));
  detail.appendChild(h);

  // progress
  const pSec = section("Progress");
  const done = w.status_counts.done || 0;
  pSec.appendChild(el("div", "wave-detail-frac", done + " / " + w.subtasks_total + " done"));
  pSec.appendChild(progressBar(w.status_counts, w.subtasks_total));
  const breakdown = el("div", "summary");
  const sg = el("div", "group");
  for (const s of [...KNOWN_STATUSES, ...Object.keys(w.status_counts).filter((x) => !KNOWN_STATUSES.includes(x))]) {
    if (!w.status_counts[s]) continue;
    const chip = el("span", "chip");
    chip.appendChild(badge(s));
    chip.appendChild(el("b", null, String(w.status_counts[s])));
    sg.appendChild(chip);
  }
  breakdown.appendChild(sg);
  pSec.appendChild(breakdown);
  detail.appendChild(pSec);

  // fields
  const fSec = section("Wave");
  const grid = el("div", "kv");
  fSec.appendChild(grid);
  kvRow(grid, "id", w.id);
  kvRow(grid, "wave", String(w.wave));
  kvRow(grid, "title", w.title, true);
  const stBadge = el("span"); stBadge.appendChild(badge(w.status));
  kvRow(grid, "status", stBadge);
  kvRow(grid, "priority", w.priority == null ? "—" : String(w.priority));
  kvRow(grid, "subtasks_total", String(w.subtasks_total));
  if (w.goal) kvRow(grid, "goal", w.goal, true);
  if (w.strategy) kvRow(grid, "strategy", w.strategy, true);
  // depends_on as clickable wave links
  const depWrap = el("span", "taglist");
  if (!(w.depends_on || []).length) depWrap.appendChild(el("span", "muted", "none"));
  for (const d of w.depends_on || []) {
    const tag = el("span", "tag link", d);
    tag.addEventListener("click", () => selectWave(d));
    depWrap.appendChild(tag);
  }
  kvRow(grid, "depends_on", depWrap);
  // parallel_with as clickable wave links
  const parWrap = el("span", "taglist");
  if (!(w.parallel_with || []).length) parWrap.appendChild(el("span", "muted", "none"));
  for (const pll of w.parallel_with || []) {
    const tag = el("span", "tag link", pll);
    tag.addEventListener("click", () => selectWave(pll));
    parWrap.appendChild(tag);
  }
  kvRow(grid, "parallel_with", parWrap);
  if (w.created_at) kvRow(grid, "created_at", w.created_at);
  detail.appendChild(fSec);

  // children (drill-in)
  const children = TASKS.filter((t) => t.wave_id === w.id).sort((a, b) => a.path.localeCompare(b.path));
  const reviewable = children.filter((t) => t.has_review);
  const cSec = section("Tasks in this wave (" + children.length + ")");
  if (reviewable.length) {
    const queue = el("div", "review-bar");
    const qbtn = el("button", "rv-open-btn", "⊳ Review queue (" + reviewable.length + ")");
    qbtn.addEventListener("click", () => {
      if (window.ReviewWS) window.ReviewWS.open(reviewable[0].id);
    });
    queue.appendChild(qbtn);
    cSec.appendChild(queue);
  }
  const list = el("div", "wave-child-list");
  for (const t of children) {
    const r = el("div", "wave-child");
    r.appendChild(badge(t.status));
    r.appendChild(el("span", "wave-child-comp", t.component));
    r.appendChild(el("span", "wave-child-path mono muted", t.path));
    const vb = reviewBadge(t);
    if (vb) r.appendChild(vb);
    if (t.has_review) r.appendChild(reviewButton(t.id, "⊳"));
    r.addEventListener("click", () => selectTask(t.id));
    list.appendChild(r);
  }
  cSec.appendChild(list);
  detail.appendChild(cSec);
}

function kvRow(grid, k, vNode, plain) {
  grid.appendChild(el("div", "k", k));
  if (typeof vNode === "string") {
    grid.appendChild(el("div", "v" + (plain ? " plain" : ""), vNode));
  } else {
    const wrap = el("div", "v" + (plain ? " plain" : ""));
    wrap.appendChild(vNode);
    grid.appendChild(wrap);
  }
}

function section(title) {
  const s = el("div", "section");
  s.appendChild(el("h3", null, title));
  return s;
}

function renderDetail(data) {
  const def = data.definition;
  const st = data.state;
  const detail = $("#detail");
  detail.innerHTML = "";

  // header
  const h = el("div");
  const title = el("h2", null, def.component);
  title.appendChild(document.createTextNode(" "));
  title.appendChild(badge(st.status));
  const summary = TASKS_BY_ID.get(def.id);
  const vb = reviewBadge(summary);
  if (vb) { title.appendChild(document.createTextNode(" ")); title.appendChild(vb); }
  h.appendChild(title);
  h.appendChild(el("div", "subpath", def.path));
  detail.appendChild(h);

  // --- Review (git diff) ---
  const rev = data.review;
  if (rev && rev.worktree_abs) {
    const rSec = section("Review");
    const bar = el("div", "review-bar");
    bar.appendChild(reviewButton(def.id, "⊳ Open Review"));
    bar.appendChild(el("span", "mono muted", rev.branch || "—"));
    if (rev.run_status) bar.appendChild(el("span", "chip", "run: " + rev.run_status));
    bar.appendChild(el("span", "chip", (rev.commits || []).length + " commits"));
    if (rev.needs_rerun) bar.appendChild(el("span", "chip warn", "needs rerun"));
    if (rev.pushed) bar.appendChild(el("span", "chip", "pushed → " + (rev.pushed.remote || "")));
    rSec.appendChild(bar);
    if (rev.run_summary) rSec.appendChild(el("div", "muted", rev.run_summary));
    if (rev.run_problem) rSec.appendChild(el("div", "review-problem", rev.run_problem));
    if ((rev.commits || []).length) {
      const cl = el("div", "review-commits");
      for (const c of rev.commits) {
        const row = el("div", "review-commit");
        row.appendChild(el("span", "mono review-sha", c.sha));
        row.appendChild(el("span", "review-subj", c.subject));
        cl.appendChild(row);
      }
      rSec.appendChild(cl);
    }
    detail.appendChild(rSec);
  }

  // --- Current state ---
  const stSec = section("Current state (folded)");
  const stGrid = el("div", "kv");
  const stBadge = el("span"); stBadge.appendChild(badge(st.status));
  kvRow(stGrid, "status", stBadge);
  kvRow(stGrid, "priority", st.priority == null ? "—" : String(st.priority));
  kvRow(stGrid, "assignee", st.assignee == null ? "—" : String(st.assignee));
  // depends_on with clickable links
  const depWrap = el("span", "taglist");
  if (!st.depends_on || st.depends_on.length === 0) {
    depWrap.appendChild(el("span", "muted", "none"));
  } else {
    for (const d of st.depends_on) {
      const dep = TASKS_BY_ID.get(d);
      const missing = !dep || dep.status !== "done";
      const tag = el("span", "tag link" + (missing ? " dep-missing" : ""), d);
      tag.title = dep ? "→ " + dep.path + " [" + dep.status + "]" : "unknown task";
      if (dep) tag.addEventListener("click", () => selectTask(d));
      depWrap.appendChild(tag);
    }
  }
  kvRow(stGrid, "depends_on", depWrap);
  kvRow(stGrid, "worktree_path", st.worktree_path == null ? "—" : String(st.worktree_path));
  kvRow(stGrid, "worktree_branch", st.worktree_branch == null ? "—" : String(st.worktree_branch));
  stSec.appendChild(stGrid);
  detail.appendChild(stSec);

  // --- Definition ---
  const defSec = section("Definition");
  const defGrid = el("div", "kv");
  kvRow(defGrid, "id", def.id);
  kvRow(defGrid, "path", def.path);
  kvRow(defGrid, "lang", def.lang);
  kvRow(defGrid, "component", def.component);
  // wave link back to parent wave
  if (def.wave_id != null) {
    const wv = WAVES_BY_ID.get(def.wave_id);
    const wWrap = el("span", "taglist");
    const tag = el("span", "tag link", "wave " + (def.wave ?? "?") + (wv ? " — " + wv.title : ""));
    tag.title = "→ " + def.wave_id;
    tag.addEventListener("click", () => selectWave(def.wave_id));
    wWrap.appendChild(tag);
    kvRow(defGrid, "wave", wWrap);
  } else {
    kvRow(defGrid, "wave", "—");
  }
  kvRow(defGrid, "created_at", def.created_at || "—");
  kvRow(defGrid, "worktree", def.worktree || "—");
  // patterns
  const patWrap = el("span", "taglist");
  (def.patterns || []).forEach((p) => patWrap.appendChild(el("span", "tag pattern", p)));
  if (!(def.patterns || []).length) patWrap.appendChild(el("span", "muted", "none"));
  kvRow(defGrid, "patterns", patWrap);
  // uses_ref_helpers
  const helpWrap = el("span", "taglist");
  (def.uses_ref_helpers || []).forEach((x) => helpWrap.appendChild(el("span", "tag", x)));
  if (!(def.uses_ref_helpers || []).length) helpWrap.appendChild(el("span", "muted", "none"));
  kvRow(defGrid, "uses_ref_helpers", helpWrap);
  // related_files
  const relWrap = el("span", "taglist");
  (def.related_files || []).forEach((x) => relWrap.appendChild(el("span", "tag", x)));
  if (!(def.related_files || []).length) relWrap.appendChild(el("span", "muted", "none"));
  kvRow(defGrid, "related_files", relWrap);
  defSec.appendChild(defGrid);
  detail.appendChild(defSec);

  // --- Metrics ---
  const mSec = section("Metrics");
  const mGrid = el("div", "metrics-grid");
  const metrics = def.metrics || {};
  for (const key of METRIC_KEYS) {
    const val = metrics[key] ?? 0;
    const card = el("div", "metric" + (val === 0 ? " zero" : ""));
    card.appendChild(el("div", "mlabel", key));
    card.appendChild(el("div", "mval", String(val)));
    mGrid.appendChild(card);
  }
  // any extra metric keys not in the known list
  for (const key of Object.keys(metrics)) {
    if (METRIC_KEYS.includes(key)) continue;
    const card = el("div", "metric");
    card.appendChild(el("div", "mlabel", key));
    card.appendChild(el("div", "mval", String(metrics[key])));
    mGrid.appendChild(card);
  }
  mSec.appendChild(mGrid);
  detail.appendChild(mSec);

  // --- Worktree command ---
  if (def.worktree_cmd) {
    const wSec = section("Worktree command");
    const box = el("div", "cmdbox");
    const code = el("code", null, def.worktree_cmd);
    const btn = el("button", null, "Copy");
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(def.worktree_cmd);
        btn.textContent = "Copied!";
      } catch {
        // fallback: select text
        const r = document.createRange();
        r.selectNodeContents(code);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        btn.textContent = "Selected";
      }
      setTimeout(() => (btn.textContent = "Copy"), 1200);
    });
    box.appendChild(code);
    box.appendChild(btn);
    wSec.appendChild(box);
    detail.appendChild(wSec);
  }

  // --- Timeline ---
  const tlSec = section("Event timeline (" + data.timeline.length + ")");
  const tl = el("div", "timeline");
  for (const ev of data.timeline) {
    tl.appendChild(renderEvent(ev));
  }
  tlSec.appendChild(tl);
  detail.appendChild(tlSec);
}

function renderReviewRecord(rec) {
  const item = el("div", "tl-item tl-review");
  const dot = el("div", "tl-dot tl-sev-review");
  dot.appendChild(el("span"));
  item.appendChild(dot);
  const body = el("div", "tl-body");
  const head = el("div", "tl-head");
  head.appendChild(el("span", "tl-type tl-type-review", "review:" + rec.rkind));
  if (rec.actor) head.appendChild(el("span", "tl-actor", "@" + rec.actor));
  if (rec.ts) head.appendChild(el("span", "tl-ts", rec.ts));
  body.appendChild(head);
  const p = el("div", "tl-payload");
  if (rec.rkind === "verdict") {
    const vb = el("span", "rv-verdict-badge rv-vb-" +
      (rec.verdict === "approved" ? "approved" : rec.verdict === "changes_requested" ? "changes" : "commented"),
      rec.verdict);
    p.appendChild(vb);
    if (rec.note) p.appendChild(el("div", null, rec.note));
  } else if (rec.rkind === "comment") {
    const loc = rec.path ? rec.path + (rec.line ? ":" + rec.line : "") : "review-level";
    p.appendChild(el("div", "mono muted", loc));
    p.appendChild(el("blockquote", "tl-quote", rec.body || ""));
  } else if (rec.rkind === "resolve") {
    p.appendChild(el("div", "muted", (rec.resolved ? "resolved" : "reopened") + " thread " + rec.thread_id));
  } else if (rec.rkind === "viewed") {
    p.appendChild(el("div", "mono muted", (rec.viewed ? "viewed " : "unviewed ") + rec.path));
  } else if (rec.rkind === "visit") {
    p.appendChild(el("div", "mono muted", "visited @ " + (rec.head || "").slice(0, 10)));
  } else {
    p.appendChild(el("span", "mono", JSON.stringify(rec)));
  }
  body.appendChild(p);
  item.appendChild(body);
  return item;
}

function renderEvent(ev) {
  if (ev.kind === "review") return renderReviewRecord(ev);
  const item = el("div", "tl-item");
  const sev = (ev.severity || "").toLowerCase();
  const dot = el("div", "tl-dot" + (sev ? " tl-sev-" + sev : ""));
  dot.appendChild(el("span"));
  item.appendChild(dot);

  const body = el("div", "tl-body");
  const head = el("div", "tl-head");
  head.appendChild(el("span", "tl-type tl-type-" + ev.event, ev.event));
  if (ev.actor) head.appendChild(el("span", "tl-actor", "@" + ev.actor));
  if (ev.ts) head.appendChild(el("span", "tl-ts", ev.ts));
  body.appendChild(head);

  const payload = renderPayload(ev);
  if (payload) body.appendChild(payload);
  item.appendChild(body);
  return item;
}

function renderPayload(ev) {
  const p = el("div", "tl-payload");
  const skip = new Set(["kind", "event", "ts", "actor"]);
  const keys = Object.keys(ev).filter((k) => !skip.has(k));
  if (keys.length === 0) return null;

  // friendly rendering for known shapes
  if (ev.event === "status" || ev.event === "priority" || ev.event === "assignee") {
    p.appendChild(el("span", null, "→ "));
    if (ev.event === "status") p.appendChild(badge(ev.value));
    else p.appendChild(el("span", "mono", String(ev.value)));
    return p;
  }
  if (ev.event === "depends_on") {
    if (ev.set) p.appendChild(el("span", "mono", "set: " + JSON.stringify(ev.set)));
    if (ev.add) p.appendChild(el("div", "mono", "add: " + JSON.stringify(ev.add)));
    if (ev.remove) p.appendChild(el("div", "mono", "remove: " + JSON.stringify(ev.remove)));
    if (ev.reason) p.appendChild(el("div", "muted", ev.reason));
    return p;
  }
  if (ev.event === "worktree") {
    p.appendChild(el("div", "mono", "path: " + (ev.path || "—")));
    p.appendChild(el("div", "mono", "branch: " + (ev.branch || "—")));
    return p;
  }
  if (ev.event === "problem") {
    if (ev.severity) p.appendChild(el("div", "mono", "severity: " + ev.severity));
    if (ev.detail) p.appendChild(el("div", null, ev.detail));
    return p;
  }
  if (ev.event === "question") {
    if (ev.to) p.appendChild(el("div", "muted", "to: " + ev.to));
    if (ev.text) p.appendChild(el("div", null, ev.text));
    return p;
  }
  if (ev.event === "decision" || ev.event === "note") {
    if (ev.text) p.appendChild(el("div", null, ev.text));
    return p;
  }
  if (ev.event === "progress") {
    if (ev.summary) p.appendChild(el("div", null, ev.summary));
    if (ev.files_edited != null) {
      const fe = Array.isArray(ev.files_edited) ? ev.files_edited.join(", ") : String(ev.files_edited);
      p.appendChild(el("div", "mono", "files_edited: " + fe));
    }
    return p;
  }
  if (ev.event === "done") {
    if (ev.summary) p.appendChild(el("div", null, ev.summary));
    return p;
  }
  if (ev.event === "run" && ev.run) {
    const r = ev.run;
    p.appendChild(el("div", "mono", "status: " + (r.status || "—") + (r.branch ? " · " + r.branch : "")));
    if (r.summary) p.appendChild(el("div", null, r.summary));
    if (r.problem) p.appendChild(el("div", "review-problem", r.problem));
    if ((r.commits || []).length) p.appendChild(el("div", "mono muted", r.commits.length + " commit(s)"));
    return p;
  }
  if (ev.event === "push") {
    p.appendChild(el("div", "mono", (ev.remote || "—") + " / " + (ev.branch || "—")));
    return p;
  }

  // generic fallback: dump remaining keys
  const obj = {};
  for (const k of keys) obj[k] = ev[k];
  p.appendChild(el("pre", null, JSON.stringify(obj, null, 2)));
  return p;
}

// ---------- wiring ----------
function init() {
  $("#filter-status").addEventListener("change", renderTree);
  $("#filter-pattern").addEventListener("change", renderTree);
  $("#filter-text").addEventListener("input", renderTree);
  $("#reload").addEventListener("click", () => {
    const wasWave = SELECTED_WAVE;
    const wasTask = SELECTED_ID;
    loadTasks().then(() => {
      if (wasTask) selectTask(wasTask);
      else if (wasWave) selectWave(wasWave);
    });
  });
  loadTasks();
}
init();
