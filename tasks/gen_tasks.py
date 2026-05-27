#!/usr/bin/env python3
"""Generate / reindex t-ref → Owl 3 signal migration tasks.

Usage:
    python3 tasks/gen_tasks.py generate   # (re)build ./tasks/*.jsonl from the repo
    python3 tasks/gen_tasks.py reindex     # rebuild ./tasks/index.jsonl from event logs

Each task lives in ./tasks/<id>.jsonl as an append-only event log:
  line 1            {"kind":"task", ...static def...}
  lines 2+          {"kind":"event","event":"status"|"priority"|"depends_on"|
                     "problem"|"question"|"progress"|"done"|..., ...}

Mutable fields (status, priority, depends_on, assignee) are event-sourced:
the *current* value is the latest event that set it.
  - status/priority/assignee:    {"event":"status","value":"ready"}
  - depends_on:                  {"event":"depends_on","set":[...]}      (replace)
                                 {"event":"depends_on","add":[...],"remove":[...]}
The orchestrator appends events; `reindex` folds them into index.jsonl.

Sub-agent runs are recorded as `run` events; folding collects them into a
`runs` list (runs[-1] is the latest), so a task that fails can be re-run and
keep its full history:
  {"event":"run","run":{
     "n":1, "agent_id":"abc", "worktree":"/Volumes/.../odoo",
     "branch":"master_-xxxx-_<name>", "status":"success|failed|blocked",
     "summary":"...", "commits":["<sha> <subject>", ...], "problem":null}}

Worktree per task: each task carries a `worktree` name and a `worktree_cmd`.
The sub-agent first runs `worktree_cmd` (goa auto-prefixes a unique hash), cds
into the created worktree, does the migration there, and records the real
location with:
  {"event":"worktree","path":"/Volumes/.../odoo","branch":"master_-xxxx-_<name>"}
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASKS_DIR = os.path.join(ROOT, "tasks")
NOW = datetime.now(timezone.utc).isoformat()

# Shared ref-helpers: importing one means depending on the task that owns its
# defining file (the helper itself must become signal-based first).
REF_HELPERS = {
    "usePosition": "addons/web/static/src/core/position/position_hook.js",
    "useSortable": "addons/web/static/src/core/utils/sortable.js",
    "useNestedSortable": "addons/web/static/src/core/utils/nested_sortable.js",
    "useDraggable": "addons/web/static/src/core/utils/draggable.js",
    "useChildRef": "addons/web/static/src/core/utils/hooks.js",
    "useForwardRefToParent": "addons/web/static/src/core/utils/hooks.js",
    "useRefListener": "addons/web/static/src/core/utils/hooks.js",
    "useSpellCheck": "addons/web/static/src/core/utils/hooks.js",
}


# Waves are first-class parent tasks (tasks/wave-N.jsonl); every file task is
# assigned to exactly one wave via its `wave`/`wave_id` fields. Assignment is by
# precedence (see assign_wave): owl2-shim → 5, foundation → 0, pattern D → 4,
# (has deps or E/F) → 3, pilot → 1, else → 2.
WAVES = {
    0: {"title": "Foundation helpers",
        "goal": "Make the shared ref-helpers signal-capable, backward-compatibly.",
        "strategy": "Hand-write these. Each helper must accept a signal AND keep "
        "accepting the old string/ref for one transition period, so dependents "
        "can migrate independently before the legacy path is removed in wave 5.",
        "depends_on": [], "parallel_with": ["wave-1", "wave-2"]},
    1: {"title": "Pilot — validate the recipe",
        "goal": "Run the full migration loop on a few exemplar web/core "
        "components before fanning out.",
        "strategy": "worktree → useRef→signal, t-custom-ref→t-ref, .el→() → "
        "tests → review the diff. Calibrate the agent recipe and prompt.",
        "depends_on": [], "parallel_with": ["wave-0", "wave-2"]},
    2: {"title": "Simple bulk (parallel)",
        "goal": "Migrate the independent basic files. Massively parallel.",
        "strategy": "Cluster by addon/module; ascending complexity within a "
        "cluster. No cross-file coupling, safe to run many agents at once.",
        "depends_on": [], "parallel_with": ["wave-0", "wave-1"]},
    3: {"title": "Helper dependents",
        "goal": "Migrate files that pass a ref into a now-signal-capable helper.",
        "strategy": "Pass this.xRef (signal) into the helper and bind "
        "t-ref=\"this.xRef\". Unblocked once wave 0 lands.",
        "depends_on": ["wave-0"], "parallel_with": []},
    4: {"title": "Forwarded refs (parent/child pairs)",
        "goal": "Replace useChildRef/useForwardRefToParent and t-ref-on-component "
        "with a parent-owned signal passed as a prop.",
        "strategy": "t-ref on a Component is forbidden in Owl 3 — migrate each "
        "parent↔child pair together; do not parallelize blindly.",
        "depends_on": ["wave-0"], "parallel_with": []},
    5: {"title": "Cleanup — remove the compat ref shim",
        "goal": "Delete the ref shim and tighten helpers once zero t-custom-ref / "
        "shimmed useRef remain.",
        "strategy": "grep must show zero usages first. Then drop the legacy path "
        "in the helpers and remove the ref shim from owl3_compatibility_layer.js.",
        "depends_on": ["wave-0", "wave-1", "wave-2", "wave-3", "wave-4"],
        "parallel_with": []},
}

# Files every other migration leans on (must exist as tasks).
FOUNDATION = {
    "web__core__utils__hooks_js",
    "web__core__position__position_hook_js",
}


def assign_wave(task, depends):
    pats = set(task["patterns"])
    if "/owl2/" in task["path"]:           # the compat layer / its utils
        return 5
    if task["id"] in FOUNDATION:
        return 0
    if "D" in pats:
        return 4
    if depends or (pats & {"E", "F"}):
        return 3
    return 2  # pilot (1) is carved out of these afterwards


def sh(cmd):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True).stdout


def slug(rel):
    s = rel[len("addons/"):] if rel.startswith("addons/") else rel
    s = s.replace("static/src/", "")
    s = s.replace("/", "__")
    s = s.replace(".", "_")
    return s


def find_ref_files():
    """JS files using useRef OR inline t-custom-ref, and XML files w/ t-custom-ref."""
    js = set(sh(["grep", "-rl", "useRef", "addons", "--include=*.js"]).split())
    js |= set(sh(["grep", "-rl", "t-custom-ref", "addons", "--include=*.js"]).split())
    xml = set(sh(["grep", "-rl", "t-custom-ref", "addons", "--include=*.xml"]).split())
    return sorted(js), sorted(xml)


def read(path):
    try:
        with open(os.path.join(ROOT, path), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def detect(js_text, xml_text):
    """Return (patterns, metrics, helpers_used)."""
    tmpl = xml_text + "\n" + js_text  # templates may be inline in JS
    m = {
        "useRef": len(re.findall(r"\buseRef\s*\(", js_text)),
        "el_access": len(re.findall(r"\.el\b", js_text)),
        "t_custom_ref": len(re.findall(r"t-custom-ref", tmpl)),
        "loop_ref": 1 if ("t-foreach" in tmpl and "t-custom-ref" in tmpl) else 0,
        "useChildRef": len(re.findall(r"\buseChildRef\b", js_text)),
        "useForwardRefToParent": len(re.findall(r"\buseForwardRefToParent\b", js_text)),
        "useEffect_dep": len(re.findall(r"=>\s*\[[^\]]*\.el", js_text)),
    }
    helpers = [h for h in REF_HELPERS if re.search(r"\b" + h + r"\b", js_text)]
    p = set()
    if m["useRef"] or m["t_custom_ref"]:
        p.add("A")
    if m["useEffect_dep"] or "useRefListener" in helpers:
        p.add("B")
    if m["loop_ref"]:
        p.add("C")
    if m["useChildRef"] or m["useForwardRefToParent"] \
            or re.search(r"<[A-Z][A-Za-z0-9]*[^>]*t-custom-ref", tmpl):
        p.add("D")
    if re.search(r"\buseRef\s*\(\s*[^\"'\s)]", js_text):  # useRef(variable)
        p.add("E")
    if any(h in helpers for h in ("usePosition", "useSortable",
                                  "useNestedSortable", "useDraggable")):
        p.add("F")
    if re.search(r"if\s*\([^)]*\.el\b", js_text) \
            or ("t-if" in tmpl and "t-custom-ref" in tmpl):
        p.add("G")
    return sorted(p), m, helpers


def generate():
    os.makedirs(TASKS_DIR, exist_ok=True)
    # wipe old task files (keep this script + any index)
    for fn in os.listdir(TASKS_DIR):
        if fn.endswith(".jsonl"):
            os.remove(os.path.join(TASKS_DIR, fn))

    js_files, xml_files = find_ref_files()

    # JS owns same-dir, same-basename .xml (the dominant odoo convention).
    claimed_xml = set()
    pairing = {}
    for js in js_files:
        cand = js[:-3] + ".xml"
        if cand in xml_files:
            pairing[js] = [cand]
            claimed_xml.add(cand)
        else:
            pairing[js] = []
    standalone_xml = [x for x in xml_files if x not in claimed_xml]

    id_for = {f: slug(f) for f in js_files + standalone_xml}
    tasks = []

    def make(path, lang, related):
        js_text = read(path) if lang == "js" else ""
        xml_text = "\n".join(read(r) for r in related) \
            if lang == "js" else read(path)
        patterns, metrics, helpers = detect(js_text if lang == "js" else "",
                                            xml_text)
        depends = sorted({slug(REF_HELPERS[h]) for h in helpers
                          if REF_HELPERS[h] != path
                          and REF_HELPERS[h] in id_for})
        comp = os.path.splitext(os.path.basename(path))[0]
        # The agent runs `worktree_cmd` to get its own isolated worktree. The
        # readable name is addon-qualified (the path segment right after
        # addons/) so it is unique across tasks even when basenames collide
        # (e.g. web/.../hooks.js vs point_of_sale/.../hooks.js).
        # The actual created path/branch is recorded later via a "worktree" event.
        rel = path[len("addons/"):] if path.startswith("addons/") else path
        addon = rel.split("/", 1)[0].replace("_", "-")
        base = os.path.basename(path).replace("_", "-").replace(".", "-")
        wt = "master-" + addon + "-" + base + "-tref-nby"
        return {
            "kind": "task", "schema": 1, "id": id_for[path],
            "path": path, "lang": lang, "component": comp,
            "related_files": related, "patterns": patterns,
            "metrics": metrics, "uses_ref_helpers": helpers,
            "worktree": wt,
            "worktree_cmd": "goa project:worktree:add odoo " + wt + " -b master-tref-integration",
            "created_at": NOW,
        }, depends

    for js in js_files:
        tasks.append(make(js, "js", pairing[js]))
    for xml in standalone_xml:
        tasks.append(make(xml, "xml", []))

    # Assign each task to a wave, then carve the pilot (wave 1) out of wave 2:
    # the 5 lowest-complexity web/core JS+XML components (a stable, exercising set).
    waves = {t["id"]: assign_wave(t, d) for t, d in tasks}
    pilot_pool = sorted(
        (t for t, _ in tasks if waves[t["id"]] == 2 and t["lang"] == "js"
         and t["related_files"] and "web/static/src/core" in t["path"]
         and t["metrics"]["useRef"] >= 1 and t["metrics"]["t_custom_ref"] >= 1),
        key=lambda t: (t["metrics"]["useRef"] + t["metrics"]["el_access"], t["id"]))
    for t in pilot_pool[:5]:
        waves[t["id"]] = 1

    for task, depends in tasks:
        w = waves[task["id"]]
        task["wave"] = w
        task["wave_id"] = "wave-%d" % w

    for task, depends in tasks:
        out = [task,
               {"kind": "event", "ts": NOW, "actor": "generator",
                "event": "status", "value": "pending"}]
        if depends:
            out.append({"kind": "event", "ts": NOW, "actor": "generator",
                        "event": "depends_on", "set": depends,
                        "reason": "seeded: imports ref-helper(s) "
                        + ", ".join(task["uses_ref_helpers"])})
        with open(os.path.join(TASKS_DIR, task["id"] + ".jsonl"), "w",
                  encoding="utf-8") as f:
            for rec in out:
                f.write(json.dumps(rec) + "\n")

    # Wave parent tasks
    counts = {w: sum(1 for v in waves.values() if v == w) for w in WAVES}
    for w, meta in WAVES.items():
        wid = "wave-%d" % w
        wave = {"kind": "wave", "schema": 1, "id": wid, "wave": w,
                "title": meta["title"], "goal": meta["goal"],
                "strategy": meta["strategy"], "depends_on": meta["depends_on"],
                "parallel_with": meta["parallel_with"],
                "subtask_count": counts.get(w, 0), "created_at": NOW}
        recs = [wave,
                {"kind": "event", "ts": NOW, "actor": "generator",
                 "event": "status", "value": "pending"},
                {"kind": "event", "ts": NOW, "actor": "generator",
                 "event": "priority", "value": 100 - w * 10}]  # lower wave = higher
        with open(os.path.join(TASKS_DIR, wid + ".jsonl"), "w",
                  encoding="utf-8") as f:
            for rec in recs:
                f.write(json.dumps(rec) + "\n")

    reindex()
    print(f"generated {len(tasks)} tasks + {len(WAVES)} waves "
          f"({len(js_files)} js owners, {len(standalone_xml)} standalone xml)")
    print("wave sizes: " + ", ".join("w%d=%d" % (w, counts[w]) for w in WAVES))


def fold(path):
    """Fold one task/wave event log into (kind, definition, current state)."""
    state = {"status": "pending", "priority": None, "depends_on": [],
             "assignee": None, "runs": []}
    defn, kind = None, None
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if rec.get("kind") in ("task", "wave"):
                defn, kind = rec, rec["kind"]
            elif rec.get("kind") == "event":
                ev = rec.get("event")
                if ev in ("status", "priority", "assignee"):
                    state[ev] = rec.get("value")
                elif ev == "depends_on":
                    if "set" in rec:
                        state["depends_on"] = list(rec["set"])
                    else:
                        dep = set(state["depends_on"])
                        dep |= set(rec.get("add", []))
                        dep -= set(rec.get("remove", []))
                        state["depends_on"] = sorted(dep)
                elif ev == "run":
                    # one sub-agent attempt: see the run-event schema in the
                    # module docstring. Appended in order so runs[-1] is latest.
                    state["runs"].append(rec.get("run", {}))
    return kind, defn, state


def reindex():
    task_rows, wave_defs = [], {}
    for fn in sorted(os.listdir(TASKS_DIR)):
        if not fn.endswith(".jsonl") or fn == "index.jsonl":
            continue
        kind, defn, state = fold(os.path.join(TASKS_DIR, fn))
        if kind == "task":
            task_rows.append({
                "kind": "task", "id": defn["id"], "path": defn["path"],
                "lang": defn["lang"], "patterns": defn["patterns"],
                "metrics": defn["metrics"], "related_files": defn["related_files"],
                "worktree": defn.get("worktree"),
                "wave": defn.get("wave"), "wave_id": defn.get("wave_id"),
                "status": state["status"], "priority": state["priority"],
                "depends_on": state["depends_on"],
                "runs": len(state["runs"]),
                "last_run": state["runs"][-1].get("status") if state["runs"] else None,
            })
        elif kind == "wave":
            wave_defs[defn["id"]] = (defn, state)

    # Roll child statuses up into their wave.
    roll = {}
    for r in task_rows:
        roll.setdefault(r["wave_id"], {}).setdefault(r["status"], 0)
        roll[r["wave_id"]][r["status"]] += 1

    wave_rows = []
    for wid, (defn, state) in sorted(wave_defs.items()):
        counts = roll.get(wid, {})
        wave_rows.append({
            "kind": "wave", "id": wid, "wave": defn["wave"],
            "title": defn["title"], "goal": defn["goal"],
            "depends_on": defn["depends_on"],
            "parallel_with": defn["parallel_with"],
            "status": state["status"], "priority": state["priority"],
            "subtasks_total": sum(counts.values()), "status_counts": counts,
        })

    with open(os.path.join(TASKS_DIR, "index.jsonl"), "w", encoding="utf-8") as f:
        for r in wave_rows + task_rows:
            f.write(json.dumps(r) + "\n")
    print(f"reindexed {len(task_rows)} tasks + {len(wave_rows)} waves "
          f"-> tasks/index.jsonl")


def append_event(task_id, payload):
    """Append one event to a task/wave log and reindex. `payload` is a dict
    with at least {"event": <type>, ...}; `actor` defaults to "orchestrator"."""
    path = os.path.join(TASKS_DIR, task_id + ".jsonl")
    if not os.path.exists(path):
        sys.exit("no such task: " + task_id)
    rec = {"kind": "event", "ts": datetime.now(timezone.utc).isoformat(),
           "actor": payload.pop("actor", "orchestrator"), **payload}
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")
    reindex()


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "generate"
    if mode == "generate":
        generate()
    elif mode == "reindex":
        reindex()
    elif mode == "event":
        # gen_tasks.py event <task-id> '<json payload with "event" key>'
        append_event(sys.argv[2], json.loads(sys.argv[3]))
    else:
        sys.exit("usage: gen_tasks.py [generate|reindex|event <id> <json>]")
