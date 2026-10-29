# Scale-Up! — Project Brief (handoff to Claude Code)

> Read this first. Companion files: `scale_up_game/PROGRESS.md` (checkpoint log), the Scale-Up PDF (full game plan, one level at a time).
> Working agreements are at the bottom.

## 1. What we want

**Scale-Up!** is a 3D, gamified way to learn how Odoo works. The player runs a small virtual business and learns **business processes and their documents**, not buttons. Odoo is always the source of truth: the 3D world only *visualizes* the state of the business; every business effect comes from real Odoo records created by the player through the real Odoo UI.

Design principles (learned while building Level 1; keep them for every level):

1. **Documents over buttons.** The player must create/confirm/validate the real Odoo documents (e.g. an internal transfer). No "do it for me" button.
2. **Objective + hints, not tutorials.** Show a story-style objective. The player figures out the flow. A Hint button gives two levels: a nudge, then the explicit step. Count hints used.
3. **The world reacts to document stages.** Draft → Ready → Done are mirrored physically (bot waits at the box when Ready, delivers when Done). The scene never changes before Odoo confirms.
4. **Feedback, not answers.** If the document is wrong, tell the player what looks off ("destination should be X") without doing it for them.
5. **A living, motivating world.** The bot never idles: it patrols/scans/inspects. The environment should feel like a place worth playing in (detail, light, celebration on success).
6. **Recap teaches.** On completion, list the steps done and explain why the document matters (what Odoo recorded).
7. **AI-ready boundary.** Server-side `action_*` methods are the only place business effects happen, so a future AI worker can call the same permitted actions. Level 1 deliberately uses no LLM.

## 2. Objective of Level 1 — "Restock the Shelf"

Order SO-001 needs 1 × *Demo Product* but `WH/Stock/Shelf-01` is empty while `WH/Stock` has 1 unit. The player must move the stock with an **Internal Transfer**: create it, set product/quantity/source/destination, Mark as To Do, Validate. Completion is detected from the validated transfer in Odoo.

## 3. What is achieved (verified playable in a real Odoo 19 instance)

- Addon `scale_up_game` (Odoo 19, Owl, Three.js r149 vendored UMD in `static/lib/three/three.min.js`, lazy-loaded with `loadJS`).
- **Models**: `scale.up.game.level` (product, source/dest location, quantity, seeded-stock flag, admin "Reset Scenario") and `scale.up.game.session` (per-user progress; `state`, `started_at`, `last_picking_id`, `action_count`).
- **Progress engine** (`models/game_session.py`): finds the player's own internal transfer created since `started_at`, checks product/qty/source/destination, derives `stage` (`none|draft|ready|done`), `steps`, `issues`, hints, objective text. `check_progress()` is called by the frontend; session completes (row-locked, idempotent) when a matching transfer is Done and destination stock is sufficient.
- `action_restock_shelf()` still exists (server-side creates+validates a transfer) but is **unused by the UI**; it is the future AI-worker boundary.
- **Security**: ACLs/record rules for `stock.group_stock_user` (own sessions only, no forged progress on create) and admins; menu restricted to Inventory users; sudo only for reading exact quant quantities, session bookkeeping and admin reset/seed.
- **Frontend** (`static/src/`): `components/game_root.{js,xml,scss}` (mission card with objective, stock-on-hand panel, hint button; terminal menu opening the real `stock.picking` form in a dialog via `doAction(... target:"new")`; polling every 1.5 s while the dialog is open; on Done the dialog/wizards are closed and a "Validating…" pill shows while the bot works; recap card), `three/scene.js` (detailed warehouse: racks, pallets, desk + live terminal screen, order board, windows/light shafts/dust, labels with product & quantities, confetti), `three/animations.js` (tween runner, abortable walking, delivery sequence), `three/activities.js` (random work activities for the bot), `three/interactions.js` (raycasting by `userData.interactiveId`).
- Stable object ids: `warehouse_worker_01`, `shelf_01`, `product_box_01`, `warehouse_floor_01`, `office_terminal_01`.

## 4. Odoo 20 gotchas (verified in the Odoo 20 source; 19 notes kept where still true)

**Changed in 20 (migration done):**
- `stock.move.product_uom` → **`uom_id`**.
- `uom.uom.rounding` is gone. Use `uom.compare(a, b)` / `is_zero()` / `round()` (precision "Product Unit") instead of `float_compare(precision_rounding=…)`.
- `skip_immediate` context key no longer exists in stock (harmless); `skip_backorder` still works.
- **`ir.model.access.csv` + `ir.rule` merged into `ir.access`**: file `security/ir.access.csv` with columns `id,name,model_id,group_id/id,operation,domain` (`model_id` = dotted model name, `operation` ∈ `crud` subsets, e.g. `cr`). With a group = permission (domain optional, OR-ed per group); no group = global restriction. `ir.rule` XML records no longer load.
- **Owl 3** (`3.0.0-alpha.50` + `web/static/src/owl2/owl3_compatibility_layer.js`): `useState` → `proxy()`, `useRef("x")` → `signal.ref()` read as `this.x()` with `t-ref="this.x"`, `static props` throws → `props = useProps({...standardActionServiceProps})` (from `@web/webclient/actions/action_plugin`). Templates use the `this.` prefix everywhere; `t-esc` deprecated → `t-out`.
- `useService("action")` / `useService("orm")` still work but are marked temporary bridges in the source (`@todo owl3 migration`).

**Unchanged, re-verified in 20:**
- `stock.move` has **no `name` field**.
- Source/Destination fields on the transfer form need group `stock.group_stock_multi_locations`; still enforced from Python in `_ensure_multi_location_group()` (`<function>` at the end of `views/game_menu.xml`) because `base.group_user` is `noupdate`. Verified: implied for a new Inventory user.
- `models.Constraint` (`_sql_constraints` is now rejected), `<list>` tag, `post_init_hook(env)`, `from odoo import _`, `Command`, `check_access('read')`, `has_group`.
- Flow: `create` → `action_confirm` → `action_assign` → `move_ids.picked = True` → `button_validate` with `skip_backorder`; returns `True`.
- `stock.quant._get_available_quantity(product, location, strict=True)`; inventory setup via `with_context(inventory_mode=True)` + `inventory_quantity` + `action_apply_inventory()`.
- `type='consu'` + `is_storable=True`; `stock.location.warehouse_id`; `stock.warehouse.int_type_id`.
- Web: `loadJS`, `doAction(..., {onClose})`, `ir.actions.act_window_close`, `.o_dialog` / `.modal.d-block` selectors, SCSS `darken`, client action registry, assets glob.

## 5. TASK A — Migrate to Odoo 20 (do this first)

Context: the module currently targets Odoo 19; it will live in an Odoo 20 source tree.

1. **Analyse before editing.** Read the Odoo 20 source (stock, web, owl, base) for every API listed in §4 and in the checklist below. Do not assume; confirm each in the source.
2. Checklist of things likely to change: manifest `version`/assets format; `models.Constraint`; field/ORM API (`check_access`, `invalidate_recordset`, `has_group`, `Command`); `stock.picking`/`stock.move` fields (`move_ids`, `picked`, `quantity`, `product_uom_qty`, locations), `button_validate` return values and context keys; `stock.quant` inventory API; `stock.location.warehouse_id`, `stock.warehouse.int_type_id`; `product` type/`is_storable`; group xmlids (`stock.group_stock_user`, `stock.group_stock_multi_locations`); view syntax (`<list>`, `<form>` buttons); client action registration; `@web/core/assets` `loadJS`; `useService("action")` `doAction` options (`onClose`) and `ir.actions.act_window_close`; Owl APIs (`useState`, `useRef`, `onMounted`); SCSS (`darken`); the dialog DOM/CSS selectors used in `game_root.scss` (`.o_dialog`, `.modal`, `.modal-backdrop`); manifest `assets` glob; JS module alias `@scale_up_game/...`.
3. Migrate with the smallest possible diffs; keep behaviour identical. Update `version` to `20.0.x`.
4. Install/upgrade on an Odoo 20 database, run the manual checklist (§7), fix errors from the server log/browser console.
5. Report: a short list of every change made and why (so this brief's §4 can be updated), then commit.

## 6. Considerations / future improvements

**Architecture (do before Level 2):**
- Make levels **data-driven**: Level 1 hardcodes the restock scenario in `game_session.py` (stages, step labels, hints, `_check_picking`). Introduce a per-level "scenario" definition (steps, evaluators, hint texts, objective, scene props) so a new level is mostly config + one evaluator.
- Reusable **scene kit**: prop library (racks, pallets, desks, truck, forklift…), configurable layout per level; keep `SCENE_OBJECT_IDS`-style stable ids. Some text is hardcoded in the scene (order refs SO-000/001/002, clock, banner "Scale-Up! Co.").
- Replace polling with Odoo **bus** notifications for stage changes.
- Replace the vendored UMD Three.js r149 with a maintained ES-module import path when Odoo 20 asset tooling allows.

**Gameplay / learning:**
- Persist hints used / score / stars server-side (`hints_used` currently lives only in the frontend).
- Level select + progression, achievements/leaderboards (explicitly out of scope so far).
- Richer feedback per mistake (more `issues` detection), optional "explain this document" panel linking to Odoo docs.
- Later levels from the PDF; natural-language AI worker calling permitted server actions (never changing stock directly, never declaring success without a confirmed Odoo operation).

**Robustness / product:**
- **Shared scenario**: all players share the same 1 unit of stock; a second player cannot repeat it. Needs per-player/per-session scenario data (e.g. a dedicated warehouse or location per session) or a reset-per-session mechanism. Only admins can "Reset Scenario" today.
- The player's transfer is found heuristically (internal transfers created by the user since `started_at`); consider tagging transfers with the session (origin/context) to be exact.
- `failed` session state is unused. Multi-company is not handled. Players need Inventory User rights.
- i18n: many strings are hardcoded in JS/Python without translation in the scene; touch/mobile support; accessibility; GLB assets instead of primitives; performance on weak GPUs (shadow map 2048, many meshes).
- Automated tests were intentionally skipped for now (manual testing); add backend tests (progress engine, idempotency, permissions) and a tour once the design stabilizes.

## 7. Manual test checklist (Level 1)

1. Upgrade module → reload browser. Scale-Up! → Configuration → Levels → **Reset Scenario**.
2. Scale-Up! → Play. Mission card shows objective + stock panel; bot works (labels change); hover/click bot → speech bubble; terminal glows on hover.
3. Hint → nudge, Hint again → explicit; second hint on step 1 makes the terminal pulse.
4. Terminal → New transfer: form shows Source/Destination Location. Wrong destination → Save → close → "The bot noticed…" feedback.
5. Correct transfer → Mark as To Do → dialog closes, bot walks to the box and waits.
6. Open my transfer → Validate → dialog closes, "Validating…" pill, bot carries box to shelf, confetti, order board "READY TO SHIP ✔", recap card.
7. Inventory shows the transfer Done (WH/Stock → WH/Stock/Shelf-01). Refresh the game: shelf stays stocked, level stays complete.

## 8. Working agreements (user preferences)

- **Save tokens**: when iterating, only give/describe what changes (diff or the single changed file). Don't regenerate everything; don't zip for small changes.
- **No automated test cases** unless asked; the user tests manually in the browser.
- Keep `scale_up_game/PROGRESS.md` updated as the checkpoint (milestones, decisions, risks) so work can resume in a new session. Commit after each working step.
- Inspect the real Odoo source before using version-specific APIs; never fabricate backend success or write stock directly from the frontend.
- Odoo is the source of truth; the player must make the documents.

## 9. Next steps

1. TASK A: migrate to Odoo 20 and verify Level 1 (§5).
2. Refactor to data-driven levels + scene kit (§6 Architecture).
3. Read the Scale-Up PDF and write a spec per level in `docs/levels/level-NN.md` (objective, documents the player creates, stages, hints, issues, scene changes) → review → implement → manual test → commit.
