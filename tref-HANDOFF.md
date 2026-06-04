# t-ref Migration — Orchestrator Handoff

**Last updated:** 2026-06-04 ~07:30 by the previous orchestrator (session `545798da`).
**Why this exists:** the org hit its **monthly spend limit** mid-flight and the user paused the agent-heavy approach. This document hands the migration to the next orchestrator with everything needed to resume **cheaply and correctly**.

> Read this top-to-bottom once. Then read the two memory files referenced in §11. Do **not** start fresh sub-agent sweeps before doing the cheap regression triage in §6 — that is the single most important next action.

---

## 1. Mission

Migrate Odoo from Owl 2 → Owl 3 ref semantics across all addons:

- **Old:** `useRef("x")` (from `@web/owl2/utils`) + `t-custom-ref="x"` / `t-ref="x"` (string) + `this.xRef.el`.
- **New:** class field `xRef = signal(null)` (`signal` from `@odoo/owl`) + template `t-ref="this.xRef"` (an **expression**) + read via `this.xRef()`.

The migration is delivered as **batches tested on runbot**, then folded into a single PR branch. CI is **confirmation, not discovery** — every batch must pass a **local pre-flight gate** (§5) before it is pushed.

### Scope reality
- **490 task event-logs** in `tasks/*.jsonl`. Of these: **~277 still `pending`** (not migrated yet — future work, out of current scope), **158 are `to_check_with_ci`** (migrated, need CI), 24 `done`, 18 `blocked`.
- The **CI-ready backlog = 158**: **119 have recorded commit SHAs**, **39 do not** (must be recovered from per-component branches — see §9).
- The 119 are grouped into 5 leaf batches: `/tmp/leaf-batch-1-shas.txt` … `/tmp/leaf-batch-5-shas.txt` (25/25/25/25/17 commits).

---

## 2. HARD CONSTRAINTS (never violate)

1. **NEVER edit the compat layer** `addons/web/static/src/owl2/owl3_compatibility_layer.js`. Read it for contract only.
2. **NEVER edit addons in the orchestrator worktree** `/home/goman/.goapower/worktrees/odoo/master-tref-claude/odoo`. Orchestrator only does branch construction (cherry-pick/rebase/push) and reads. All edits happen in dedicated per-batch worktrees (sub-agents) or, for tiny fixes, a per-batch worktree.
3. **NEVER touch `tasks/`** from sub-agents (it is the orchestrator's event log).
4. **Commit convention:** subject prefixed `[FIX]` or `[REF]`, author **`nby@odoo.com`**, and **NO `Co-Authored-By: Claude` trailer**. (Note: the *original* migration commits were made in an old env as `root@ai-test-nby…` **with** a `Co-Authored-By: Claude Opus 4.7` trailer — these must be re-authored / de-trailered before the final PR; see §10. The CLA runbot check fails because of them — cosmetic for canaries, blocking for the real PR.)
5. **The user owns pushing to the real PR**; this session was authorized to push **dev/runbot test branches** only.
6. **Never force-push** except the rebased batch branches we own (`master-tref-batch-*`), and always `--force-with-lease` with a backup branch first.

---

## 3. Environment & tooling

| Thing | Value |
|---|---|
| Orchestrator worktree (odoo-bin, this file) | `/home/goman/.goapower/worktrees/odoo/master-tref-claude/odoo` |
| Git common-dir (bare) | `/home/goman/repos/odoo/odoo/.git` |
| Enterprise checkout | `/home/goman/repos/odoo/enterprise` (branch `master`; runbot-paired master commit `a82998b58ff3` is reachable). **This exists** despite older notes saying it didn't. |
| Python (3.12) | `/home/goman/.venvs/odoo-master/bin/python` — system python is 3.8, do NOT use it |
| Postgres | **PG16 at `127.0.0.1:5440`, user/pass `odoo`/`odoo`**. The default `:5432` is **PG12** and fails registry load — never use it. |
| Chrome (for hoot/tours) | `/usr/bin/google-chrome` (v148) |
| Node | v23 via nvm (`/home/goman/.nvm/...`) — present for eslint |
| skill-runbot CLI | `/home/goman/git/skill-runbot`, run `bun run src/cli.ts …` |
| Lint harness (built this session) | `/tmp/leaf1_lint` (eslint@8.27 + prettier@2.7.1 + eslint-plugin-prettier@4.2.1 + eslint-config-prettier@8.5.0 + eslint-plugin-diff@2.0.1; config = copy of `addons/web/tooling/_eslintrc.json` → `.eslintrc.json`, plus `.eslintrc_combined.json` = that + `"plugin:diff/diff"` appended to `extends`). Reusable. |
| SHA files | `/tmp/leaf-batch-{1..5}-shas.txt`, `/tmp/foundation-shas.txt`, `/tmp/backlog_with_shas.tsv` |

### skill-runbot commands (CI is read via this)
```
bun --cwd /home/goman/git/skill-runbot run src/cli.ts batches --search master-tref --json
bun --cwd /home/goman/git/skill-runbot run src/cli.ts build-names <batchId> --json     # build list + statuses
bun --cwd /home/goman/git/skill-runbot run src/cli.ts tests <buildId> --summary         # failing tests (ANSI; strip with sed 's/\x1b\[[0-9;]*m//g')
bun --cwd /home/goman/git/skill-runbot run src/cli.ts batch <batchId> --json
```
Parse failing hoot tests: `grep -o 'HOOT] Test.*failed' | sed 's/\\n.*//' | sort -u`. Parse python: `grep -oE 'FAIL: [A-Za-z0-9_.]+'`.

---

## 4. Branch & SHA inventory (state at handoff)

### Remotes
- odoo dev (push target for runbot): remote `dev` = `git@github.com:odoo-dev/odoo.git`.
- enterprise dev: remote `odoo-dev` = `git@github.com:odoo-dev/enterprise.git`.
- Rebase base is ALWAYS `upstream/master` (the `dev/master` remote ref is ~205k commits stale — push target only, never rebase onto it).

### pr-1 (the "CI-validated = done" PR branch) — ✅ FULLY GREEN
- odoo `master-tref-pr-1-nby` = `ee237d9577b5` (foundation commit `f2d299dd74f5` + already-validated migrations).
- enterprise `master-tref-pr-1-nby` = `dc64e6c712a` (rebased onto enterprise master).
- Last green batch: **2563371** (all 14 builds incl. Enterprise Tests + Security).

### Foundation
| Tip | What | Status |
|---|---|---|
| `db7217162ee5` | f2d299 + 9 signal-ref hook overloads + `37c048031114` (shared `resolveRefEl`) + `3e00a84ffa1a` (untrack in resolveRefEl) + `db7217162ee5` (useNavigation via resolveRefEl) | ✅ **CONFIRMED FULLY GREEN — batch 2563705**. This is the trustworthy base. |
| `658ad3a274fd` | db7217 + `5353dd244148` (useAutofocus signal-aware) + `658ad3a274fd` (useHover signal-aware) | ⚠️ **SUSPECT / REGRESSED** — see §6 |
| `master-tref-batch-foundation-enterprise-nby` = `a3d295c3245` | proactive web_gantt/web_studio hook hardening on enterprise master `01aa11e2c50` | **PARKED** — not needed by leaf-1/2 (their enterprise callers still use `useRef`); fold into a future enterprise batch when those components migrate. |

### Leaf batches
| Batch | odoo tip | enterprise tip | base | state |
|---|---|---|---|---|
| leaf-1 | `4b98129c49b5` (= `backup/leaf-1-pre-hookfdn-20260604`) | `701a3045711` (TableMenu menuRef; pushed) | db7217 | canary **2563776**: green **except** voip-keypad-mobile + 2 flaky dropdown. Solid. |
| leaf-1 (rebased) | `22b782b7b76e` | `701a3045711` | 658ad3a | ⚠️ canary **2563811**: REGRESSED (see §6) |
| leaf-2 | `3c525693e80b` (= `backup/leaf-2-pre-hookfdn-20260604`) | `16198d861c1` | db7217 | locally gated green |
| leaf-2 (rebased) | `fb77337e7a9d` | `16198d861c1` | 658ad3a | ⚠️ canary **2563813**: REGRESSED (see §6) |
| leaf-3 | `780de7b0cd59` | `58bd49bda64` | 658ad3a | locally gated GREEN, **NOT pushed**. On suspect base → re-base after foundation fix. |
| leaf-4 | `68f7454b4117` | (maybe; check) | 658ad3a | built before spend cutoff; agent report lost → **re-verify**. NOT pushed. On suspect base. |
| leaf-5 | NOT BUILT | — | — | shas at `/tmp/leaf-batch-5-shas.txt` (17) |

### Backup branches (do not delete)
`backup/leaf-1-pre-hookfdn-20260604` (4b98129), `backup/leaf-2-pre-hookfdn-20260604` (3c52569), plus earlier `backup/leaf-1-pre-untrack-*`, `backup/foundation-pre-untrack-*`, `backup/pr-1-pre-rebase-*`, `backup/ent-pr-1-pre-rebase-*`.

### Worktrees (git worktree list)
`master-tref-claude` (orchestrator), `batch-foundation`, `fix-foundation-hooks` (both on foundation branch), `batch-leaf-1`, `batch-leaf-2/odoo` + `batch-leaf-2/enterprise`, `batch-leaf-3/odoo` + `/enterprise`, `pr1-rebase`. Clean up stale ones when convenient.

---

## 5. THE LOCAL PRE-FLIGHT GATE (the durable asset — run before pushing ANY batch)

`t-ref`/`t-custom-ref` are effectively a **public template-inheritance API**; migrating a shared component breaks external consumers in **7 reproducible classes**. The gate catches all of them locally so you don't burn ~2h CI canaries discovering them serially.

Set `BASE`=foundation tip, `TIP`=batch tip, `ENT=/home/goman/repos/odoo/enterprise`.

**Step 0 — surface:**
```
git diff --name-only $BASE $TIP
git diff $BASE $TIP -- '*.xml' | grep -oE 't-name="[^"]+"'        # migrated template names
git diff $BASE $TIP -- '*.xml' | grep -E '^-.*t-custom-(ref|click)'  # removed ref attributes
```

**Class 1 — xpath/`t-inherit` selectors on a removed `t-custom-ref`.** Removing `t-custom-ref="X"` breaks any template that does `<xpath expr="//…[@t-custom-ref='X']">`. For each migrated `t-name` N: `grep -rl "t-inherit=[\"']$N[\"']" addons $ENT`; rewrite offending xpaths to attribute-independent (`//canvas`, stable class) or to the new `t-ref`. Also `grep -rn "@t-custom-ref" addons $ENT` and confirm any collisions hit **non-migrated** templates. *(Seen: stock forecasted_graph canvas; l10n_ke_edi_oscu_pos `scrollable`; planning `root`; website AutoComplete `input`.)*

**Class 2 — template reuse without the signal field.** A separate class doing `static template = "<N>"` (or `t-call="<N>"`) that is **not** a JS subclass/patch of the migrated class lacks the `X = signal(null)` field → `createRef: Ref is undefined or null`. For each N: `grep -rn "template\s*=\s*[\"']$N[\"']" addons $ENT --include=*.js` and `grep -rn "t-call=\"$N\"" addons $ENT --include=*.xml`; add `import {signal}` + `X = signal(null)` to non-subclass reusers (often in **enterprise** → needs a paired enterprise commit). *(Seen: enterprise web_studio TableMenu reusing `html_editor.TableMenu`.)*

**Class 3 — lint (diff-scoped, matches CI's `test_lint`).** Reuse `/tmp/leaf1_lint`, **inside each repo**:
```
ESLINT_PLUGIN_DIFF_COMMIT=$BASE /tmp/leaf1_lint/node_modules/.bin/eslint \
  --no-ignore --no-eslintrc -c /tmp/leaf1_lint/.eslintrc_combined.json \
  --resolve-plugins-relative-to /tmp/leaf1_lint $(git diff --name-only $BASE $TIP -- '*.js')
```
`--fix` autofixes prettier; **manually** fix `no-irregular-whitespace`. Must end EXIT=0 in both repos.

**Class 4 — functional (hoot DESKTOP + MOBILE + module Python TOURS).** Hoot-only is insufficient (mass_mailing tours + voip-mobile were missed). For each migrated component:
```
# desktop hoot:
odoo-bin -c <rc :5440 +ENT in addons_path> -d <db> -i <module> --test-enable \
  --test-tags '/<module>:WebSuite.test_unit_desktop[@<module>/<suite path>]' --stop-after-init --max-cron-threads=0 --http-port=<p>
# mobile hoot:
... --test-tags '/<module>:MobileWebSuite.test_unit_mobile[@<module>/<suite path>]' ...
# module tours (for any module whose editor/views embed a migrated component):
odoo-bin -c <rc> -d <db> -i <module> --test-enable --test-tags '/<module>' --stop-after-init ...
```
**VERIFY each suite printed `"@module/suite" ended (passed: N)` with N>0** (a typo'd `[@suite]` filter silently runs 0 tests yet still reports "0 failed" — this trap caused a false "green" once). For tours look for `TOUR <name> SUCCEEDED` + `0 failed of N`.

**Class 5 — mangled unicode escapes.** The migration tooling sometimes turned `\uXXXX` escapes into literal bytes (e.g. ` ` → a raw non-breaking space → `no-irregular-whitespace`). Caught by Class 3; fix by restoring the escape.

**Class 6 — `new this.xRef()` precedence bug.** The mechanical `.el`→`()` rewrite produced `new this.xRef().a.B()` which JS parses as `(new this.xRef())…`. Grep: `git diff $BASE $TIP -- '*.js' | grep -nE 'new this\.\w+\(\)'`; fix to `new (this.xRef()....B)()`. *(Seen: mass_mailing theme_selector_iframe.)*

**Class 7 — `patch()`/subclass reusers using old `.el`/`.current`.** Not caught by the template greps. For each migrated class N:
```
grep -rn "patch(\s*$N\.prototype" addons $ENT
grep -rn "extends $N" addons $ENT
```
In each hit, rewrite `.el`/`.current` reads on the parent's migrated signal-ref fields to the call form `this.xRef()`. Run a tour that exercises each. *(Seen: website SnippetViewer patch, enterprise ai composer_patch, enterprise sign NameAndSignature — one caused a hard tour failure.)*

> **Class 1 (shared-hook signal-awareness)** — i.e. a shared ref-consuming hook not handling a `signal` — was the dominant early problem and is now **fixed globally in the foundation** (every migration-fed hook routes through `resolveRefEl`, which `untrack`s). Do NOT re-patch shared hooks per-leaf. BUT the foundation change that completed this is exactly what regressed (§6) — so verify the foundation is correct first.

**Known-flaky (do not chase):** the 2 tests `@web/core/dropdown/dropdown_accordion_item/…accordion keyboard navigation` and `@web/core/dropdown/dropdown/…CheckboxItem: toggle value` fail intermittently on CI but pass locally 3× with non-zero counts; zero leaf changes to dropdown/navigation; foundation green on them. Note and ignore.

---

## 6. ⚠️ THE REGRESSION TO FIX FIRST (cheap triage, do before anything else)

**Symptom:** the canaries built on foundation `658ad3a` regressed:
- **Foundation `658ad3a`** (batch 2563812) — fails Python tour `TestUi.test_32_website_background_colorpicker`. Foundation has **no leaf migrations**, so this is caused by the foundation delta itself.
- **leaf-1 `22b782b`** (2563811) — re-fails **previously-fixed** tests: `emojis_char_field`/`emoji_text_field` "reading value", `social_post_message_field`, plus voip-keypad-mobile and dropdown.
- **leaf-2 `fb77337`** (2563813) — re-fails `google_address_autocomplete` (3, previously fixed!), `spreadsheet_edition` global_filter (7), POS `MobileTestUi` tours, web_studio report editor.

**Why this is conclusive:** on the **db7217** base, leaf-1 (`4b98129`, canary 2563776) showed **none** of these — emoji/google_address passed. The ONLY change between the two is the foundation base `db7217 → 658ad3a`. So **`658ad3a` regressed the resolver/untrack path.**

**The delta is tiny — two commits:**
```
git -C /home/goman/.goapower/worktrees/odoo/batch-foundation/odoo log --oneline db7217162ee5..658ad3a274fd
#   658ad3a274fd [FIX] mail: useHover resolve Owl 3 signal refs…
#   5353dd244148 [FIX] web: useAutofocus accept a signal/ref…
git diff db7217162ee5 658ad3a274fd -- addons/web/static/src/core/utils/hooks.js addons/mail/static/src/utils/common/hooks.js addons/web/static/src/core/utils/ref_utils.js
```
**Hypothesis:** the useAutofocus/useHover cherry-picks (made originally on leaf-2's branch) altered shared code in `core/utils/hooks.js` (or `ref_utils.js`) in a way that broke `resolveRefEl`/`untrack` for `useInputField` and the emoji/google_address/colorpicker consumers. Inspect that diff specifically for any change to `resolveRefEl`, the `untrack` import/usage, or a shared resolver helper.

**Fix options (cheapest first):**
1. If the diff shows an obvious break in a shared resolver/untrack line → fix those 2 commits minimally on the foundation branch, re-verify locally with the emoji + google_address + colorpicker suites (which the foundation agent did NOT re-run — that's why it missed this), then re-rebase leaf-1/leaf-2.
2. If unclear → **rebuild foundation = db7217 + minimal, surgical `useAutofocus`/`useHover` changes** that touch ONLY those two functions and import `resolveRefEl` from `@web/core/utils/ref_utils` without modifying it. Then re-rebase leaves.

**Local repro for the regressed tests** (so you confirm before/after without a canary):
```
# emoji (leaf-1): @mail/web/fields/emojis_char_field, @mail/web/fields/emoji_text_field
# google_address (leaf-2): @google_address_autocomplete/google_address_autocomplete  (enterprise)
# colorpicker (foundation): website TestUi.test_32_website_background_colorpicker  (-i website, tour)
```

> After foundation is correct and re-confirmed green, **everything else cascades**: re-rebase leaf-1/2/3/4 onto the fixed foundation, and the staged leaf-3/leaf-4 (built on the suspect base) become valid.

---

## 7. CI / runbot workflow

- runbot tests the **branch TIP vs master**; attribution = the branch diff. >50-commit branches get force-squashed (destroys attribution) → keep batches ≤ ~25 migration commits.
- **Pairing:** runbot pairs the odoo branch with the **same-named enterprise branch** if it exists, else uses enterprise master. It requires **BOTH merge-bases to match current masters** ("Minimal check" fails otherwise — this is the "Only 1 of 2 merge base matched" error; fix by rebasing the lagging side onto fresh master). Any batch with enterprise fixes needs a paired enterprise branch of the same name.
- **In-flight cap: 20** (raised from 4 by the user — anti-flood relaxed for speed). Full batch wall-clock ~1–3h (Enterprise Tests slot); the overnight queue was much slower (~2h+ just to start Enterprise Tests).
- **Enterprise Tests** is the long pole and runs the full hoot matrix (desktop+mobile) + Python tours — this is where the 7 classes surface. "Minimal check / Community Run / Enterprise Run" passing is necessary but not sufficient.
- **CLA check shows error** on leaf branches because migration commits aren't authored by a CLA-signed identity (root@… + Claude trailer). Cosmetic for canaries; must be fixed for the real PR (§10).

---

## 8. RESUME PLAN (ordered, cheap-first)

1. **§6 triage** — diff `db7217..658ad3a` (2 commits), find the resolver/untrack regression, fix minimally. Re-verify locally: emoji + google_address + colorpicker. (No new sub-agent needed — this is a small, targeted fix.)
2. **Re-confirm foundation green** — push fixed foundation, canary it (or trust local + the fact db7217 was green and the delta is 2 functions).
3. **Re-rebase leaf-1 and leaf-2** onto the fixed foundation; push; canary. Expect green except the 2 flaky dropdowns.
4. **Re-base leaf-3 (`780de7b0`/`58bd49bd`) and re-verify leaf-4 (`68f7454b`)** onto the fixed foundation (their gates were run on the suspect base; re-run the cheap static classes + lint, and the specific suites that 658ad3a regressed). Push when green.
5. **Build leaf-5** (`/tmp/leaf-batch-5-shas.txt`, 17 commits) on the fixed foundation, run the full §5 gate, push.
6. **Recover the 39 no-SHA tasks** (§9) into a leaf-6+ batch.
7. **Pre-PR cleanup** (§10).

**Strategy that worked:** *build-ahead with the local gate.* Pre-build each leaf on the foundation and run the §5 gate **locally** (no push) — each batch surfaces its breakage classes locally at ~zero cost instead of via 2h canaries. Only push once locally green. Then canary confirms. Keep ≤20 in flight.


---

## 9. The 39 no-SHA tasks

158 needs-CI − 119 with-SHAs = **39 tasks** that are `to_check_with_ci` but have no `commits` recorded in their `tasks/*.jsonl`. Their migration commits live on per-component branches `master-<component>-tref-nby` (created via `goa project:worktree:add`). To batch them: find each branch, identify its migration commit, add to a new leaf batch. Build a recovery list with a script over `tasks/*.jsonl` (status in needs-CI, empty commits) cross-referenced with `git branch --list 'master-*-tref-nby'`.

Task event-log schema: line 1 = `{"kind":"task", id, path, component, related_files, worktree, wave, ...}`; subsequent lines = `{"kind":"event", event:"status"|"run", value/commits/...}`. Latest `status` event = current state; `run` events carry `commits[]`.

---

## 10. Pre-PR cleanup (before folding into pr-1)

1. **Re-author all migration commits**: they are `root@ai-test-nby…` with `Co-Authored-By: Claude Opus 4.7` trailers (made in the old env). Re-author to `nby@odoo.com`, strip Claude trailers (this fixes the CLA check). Our `[FIX]` commits are already clean.
2. **Squash strategy**: foundation hook overloads can stay as logical commits; the many `[FIX]` follow-ups (lint, xpath, precedence, etc.) should be folded into their corresponding migration commits for a clean history.
3. **Fold the parked enterprise-foundation hardening** (`a3d295c3245`: web_gantt/web_studio hooks) into whichever enterprise batch first migrates those components.
4. Confirm `dev/master` is never used as a rebase base — always `upstream/master`.

---

## 11. Reference (memory files — read these too)

- `~/.claude/projects/-home-goman-repos-odoo-odoo/memory/tref-leaf1-canary-red.md` — the full blow-by-blow of the leaf-1 debugging, all 7 classes as discovered, every SHA, and the regression note. **Most detailed source.**
- `~/.claude/projects/-home-goman-repos-odoo-odoo/memory/tref-ci-workflow.md` — the agreed CI batching workflow + dependency layering.
- `~/.claude/projects/-home-goman-repos-odoo-odoo/memory/test-infra-post-migration.md` — PG16/venv/skill-runbot path gotchas (note: enterprise checkout DOES now exist, contrary to that file).
- `tref-orchestrator.md` / `tref-subagent.md` (this worktree) — the original spec. **STALE** in places (old `/root/git/...` paths, `:5432`, Claude 4.7 trailers). Trust THIS handoff + the memory files over them.

---

## 12. One-paragraph summary

Foundation `db7217162ee5` is green and trustworthy; pr-1 is green. The migration's failure modes are fully characterized into **7 breakage classes** with a **local pre-flight gate** (lint + desktop/mobile hoot + tours) that catches them before CI — that gate is the durable asset. leaf-1 and leaf-2 were driven to green on `db7217`. The final step — folding `useAutofocus`/`useHover` into the foundation to make the shared-hook layer complete — **over-reached and regressed the resolver** (`658ad3a`), re-breaking emoji/google_address/colorpicker. **Fix that two-commit regression first (§6), re-rebase the leaves, then resume the build-ahead-with-local-gate pipeline for leaf-3/4/5 and the 39 no-SHA tasks.**
