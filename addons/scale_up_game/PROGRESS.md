# scale_up_game — Build Progress / Checkpoint

> **To resume in a new chat:** upload this addon folder (or zip) and say
> "Continue building scale_up_game from PROGRESS.md". Start at the first
> unchecked milestone. Update the checkboxes below after each milestone.

Target: Odoo 20 (migrated from 19) · Owl · Three.js r149 (vendored UMD, lazy-loaded via `loadJS`) · no automated tests (user tests manually).

## Milestones

- [x] M0  Skeleton dirs + vendored `static/lib/three/three.min.js` + this file
- [x] M1  Backend models: `scale.up.game.level`, `scale.up.game.session` (+ `__init__`, manifest)
- [x] M2  Security (ACL csv, record rules) + data (shelf location, demo product, level) + post-init stock hook
- [x] M3  Backend action `action_restock_shelf()` (real internal transfer, locking, idempotency, payload)
- [x] M4  Views + menu + client action registration (admin level/session views, Reset Scenario button)
- [x] M5  Frontend three/: `animations.js`, `scene.js`, `interactions.js`
- [x] M6  Frontend Owl component `game_root.{js,xml,scss}` wired to backend
- [x] M7  Static syntax checks (py_compile, XML parse, node --check)
- [x] M8  Package: copy to /mnt/user-data/outputs + zip, manual-test checklist below

- [x] M9  Migrate to Odoo 20: backend (`uom_id`, `uom.compare`, `ir.access.csv`), Owl 3 frontend (`proxy`, `signal.ref`, `useProps`, `this.` templates), manifest 20.0.1.0.0. Install on fresh DB `su20` clean; backend flow smoke-tested via shell. **Browser check pending (user).**

- [x] M10 Level menu + sub-levels: `scale.up.game.level` is now a tree (group → playable sub-levels, `state` available/soon), sessions are *attempts* (no unique constraint, replay never needs a reset), `start_attempt()` seeds a fresh scenario; POC kept as Training ▸ Restock the Shelf.
- [x] M11 Level "Buy & Sell" = 9 independent sub-levels (`models/scenarios_buy_sell.py`, one `scale.up.game.scenario.<code>` abstract model each; each seeds its own prerequisites so any card plays alone). Specs: `docs/levels/level-01.md`.
- [x] M12 Reusable 3D kit: `three/kit/{base_scene,characters,people,props}.js` + scenes `three/scenes/{office,dock}_scene.js` (level field `scene` picks one). Bot, humans (CEO avatar + NPCs), crate/pallet/rack/desk/truck/dock props are reusable; the POC `scene.js` is untouched (legacy; migrate to `BaseScene` later).
- [x] M13 Admin point of view for Buy & Sell sub-levels 1–2: `three/scenes/office_pov_scene.js` (extends `OfficeScene`; camera = player seated at the desk, CEO hidden, OdooBot walks in through the door and steps aside). Only OdooBot talks there (no human NPCs). Dialogue: bot bubble above the bot, Admin replies bottom-centre with their avatar, first-time tip points at the computer. Game follows Odoo dark mode (shared gray scale). `_remove_obsolete_levels()` drops the experimental `bs_create_product_pov` level and its attempts.
- [ ] Browser checks by the user: menu → Buy & Sell → each sub-level; Training level replay; stars/✓ on the menu.

## File map

```
scale_up_game/
├── __init__.py                  post_init_hook (seeds source stock once)
├── __manifest__.py
├── PROJECT_BRIEF.md, PROGRESS.md, CLAUDE.md, scale-up.pdf (game plan)
├── docs/levels/level-01.md      Buy & Sell spec
├── models/
│   ├── game_level.py            level tree (group → sub-levels), scene, max_stars
│   ├── game_session.py          attempts, progress, hints, stars; POC evaluator
│   ├── scenario_base.py         scenario contract (_steps/_setup/_evaluate/_texts/_terminal/_scene/_bonus/_submit)
│   └── scenarios_buy_sell.py    9 Buy & Sell scenarios
├── security/ir.access.csv
├── data/
│   ├── game_level_data.xml      Shelf-01 location, Demo Product, POC level
│   ├── game_buy_sell_data.xml   fixtures (Wood Corner, Azure Interior, Large Desk…)
│   └── game_levels_data.xml     level tree + scene per sub-level (not noupdate)
├── views/game_menu.xml          client action, menus, admin views
└── static/
    ├── lib/three/three.min.js   vendored, MIT
    └── src/
        ├── components/
        │   ├── app.{js,xml}             client action: LevelMenu or GameRoot
        │   ├── level_menu.{js,xml,scss}
        │   ├── game_root.{js,xml,scss}  generic game screen (scenario or POC)
        │   └── dialogue.{js,xml,scss}   chat bubbles
        └── three/
            ├── {animations,activities,interactions}.js
            ├── scene.js                 POC warehouse (legacy)
            ├── kit/{base_scene,characters,people,props}.js
            └── scenes/{office,office_pov,dock}_scene.js
```

Scene per Buy & Sell sub-level: `office_pov` 1–2 · `dock` 3, 6 · `office` 4, 5, 7, 8, 9. Training uses `warehouse` (POC `scene.js`).

## Design decisions (keep consistent when resuming)

- Odoo is source of truth. Frontend never writes stock. `action_restock_shelf()` creates+validates a real `stock.picking` (internal type of the source warehouse).
- Idempotency: row lock (`SELECT … FOR UPDATE`) on level then session, re-read state, if already `completed` return existing result with `already_completed: true`.
- Expected failures return `{success: False, message}` (no tracebacks to player); work is wrapped in a savepoint so partial pickings roll back.
- `sudo()` only for: reading exact quant quantities (display), writing the game-session bookkeeping, admin scenario reset/seed. Never for the stock transfer itself.
- Players need Inventory User (`stock.group_stock_user`) — menu, ACLs and rules use that group.
- Scene objects use stable ids: `warehouse_worker_01`, `shelf_01`, `product_box_01`, `warehouse_floor_01`.
- Procedural primitives instead of GLB assets (no binary assets needed).

## Manual test checklist (after install/upgrade)

1. Install app "Scale-Up! Virtual Business Game" (Developer mode → Apps → Update Apps List if needed).
2. Open **Scale-Up!** menu → **Play**. Scene shows shelf (empty middle bay), box, worker.
3. Hover worker → highlight + "Click to interact". Click → menu "Restock shelf". Click elsewhere → menu closes.
4. Click "Restock shelf" → spinner → worker walks, carries box to shelf → "Level complete!".
5. Inventory → Operations → Transfers: internal transfer WH/Stock → WH/Stock/Shelf-01 is Done.
6. Refresh the game page: shelf still stocked, level still complete.
7. Retest: Scale-Up! → Configuration → Levels → open level → **Reset Scenario**.

## Known risks / things to verify on first run

- Odoo 19 API assumptions: `models.Constraint`, `is_storable`, `stock.move.picked`, `button_validate` returning `True` with `skip_backorder`, `stock.location.warehouse_id`.
- If the asset bundle errors on `@scale_up_game/three/...` imports, check module names in browser console (`odoo.loader.modules`).

## Status (phase 1)

M0–M8 done. **Level 1 verified playable in a real Odoo 19 instance** (manual test).
Fix applied after first run: removed invalid `name` field from the `stock.move` create in `_create_and_validate_transfer()`.

Next (only when requested): Level 2 / AI-worker integration. Keep using the same `action_*` backend boundary.

## Phase 2 — Learning flow, living robot, richer world (checkpoints)

- [x] P2.1 Backend: player creates the REAL internal transfer; `check_progress()` evaluates it (stages none/draft/ready/done, steps, issues, hints); session completes when a matching transfer is Done. `action_restock_shelf` kept (hidden) as the future AI-worker boundary.
- [x] P2.2 `animations.js` (abortable walking), new `activities.js` (random work activities for the robot)
- [x] P2.3 `scene.js` rewrite: detailed warehouse, inventory terminal, order board, stages (working / waiting at box / deliver + confetti)
- [x] P2.4 Owl component: mission card (objective + hint button), terminal menu -> real Odoo form dialog, robot speech/activity chips, completion recap
- [x] P2.5 Smoke test (mocked WebGL), package

### Phase 2 status
All P2.x done. Static checks + a Node smoke test (mocked WebGL: random activities, waiting at box, deliver + confetti, dispose) pass.
**Upgrade the module** (new Python + security XML + assets). Then Scale-Up! → Configuration → Levels → **Reset Scenario** (also restarts the evaluation window so old transfers are ignored).
Flow: terminal → New transfer (real stock.picking form in a dialog) → set product/qty/locations → Mark as To Do (bot walks to box) → Validate (bot carries box, confetti, order board turns green).

### Phase 2.1 (feedback round)
- Hint for details step mentions enabling Storage Locations; objective now names qty x product.
- Product name shown on box label, floating source tag (qty in WH/Stock), shelf sign (qty on shelf), order board, and a "Stock on hand" panel in the mission card.
- Fixed scene placement bugs: barrels/cart were rotated whole (add() returns the parent), banner overlapped order board, order board texture was squashed, shelf label overlapped boxes, summary card clipped at the right edge (now bottom-left).
- While the transfer dialog is open the game polls `check_progress` every 1.5s; when the transfer is Done the Odoo dialog/wizards are hidden (body.o_su_hide_modals), a "Validating…" pill shows, the bot delivers the box, then dialogs are closed.

## Phase 3 — Menu, sub-levels, kit (checkpoint)

- Menu client action = `components/app.js` (`ScaleUpApp`, registered as `scale_up_game.game_root`) → `LevelMenu` or `GameRoot(levelCode)`. `GameRoot` is generic: a payload with `scenario` is a Buy&Sell-type sub-level (scene `BuySellScene`, chat, info panel, terminal items and answer box from the payload); without it, the POC path.
- Scenario contract (Python): `_steps`, `_setup` (seeds as OdooBot, returns data stored in `session.data`), `_evaluate` → `{stage, flags, issues}`, `_texts` (objective, briefing, chat, hints per step, recap), `_terminal` (menu entries = Odoo form actions), `_scene` (confirmed state for the 3D scene), `_bonus`, `_submit`.
- Scoring: 2 ★, 1 ★ if a level-2 hint was used, +1 ★ bonus (card "Control the bill": message or credit note on the bill). Max stars per level in `max_stars`. Hints persisted server-side (`register_hint`).
- Players need Purchase, Sales and Accounting rights besides Inventory (admin has them).
- Debts: POC `scene.js` and POC evaluator not yet migrated to the kit/scenario contract; stock of the Training level is shared between players; the stock shown in Buy&Sell scenes is the total of the fixture product (accumulates across attempts, pallets cap at 24 crates).
- Fix: the Training level crashed on load (`game.chat` undefined in `game_root.xml`). The POC payload now also sends `chat` (empty), `group_name` and `scene_key`, the keys the generic `GameRoot` reads.
- Fix: on completion the office board kept the last step unticked (`OfficeScene.celebrate()` never applied the final state; `DockScene` did). It now applies it before the confetti.
- Fix: duplicates on demo databases and on replays. The product is now **Standing Desk** (`product_standing_desk`; "Large Desk" exists in demo data). `_ensure_partner_fixtures()` gives the game's xmlids to existing Wood Corner / Azure Interior / Brandon partners instead of creating look-alikes (install only). `_prepare_catalog()` runs at every attempt start: deletes players' Standing Desk copies (archives them if a document uses them), archives the game's desk in sub-level 1 (`hide_desk`) and restores it in 2–9. Evaluators check the exact fixture product, not any name containing "desk".
- Known limits: two players playing at once can see each other's catalog changes (one in sub-level 1 hides the desk another just restored). Leaving sub-level 1 unfinished and starting another sub-level deletes the copy made so far.
- Monitor hover: the flat teal box is replaced by a bright neon tube around the monitor (Odoo-purple tints: halo #9b4f8e, white line on the monitor edge, then a 1.2 cm #e0a3d6 band) with a soft halo; the monitor itself is not tinted. Canvas texture on a plane just in front of the bezel, with a hole the size of the monitor (`makeDesk()` in `kit/props.js`). Fades in/out, breathes on hover, pulses as a hint (`updateDeskGlow()`, office and dock scenes); excluded from raycasting. The Training POC `scene.js` still has the old box.
- Overlays on the monitor: the "Click the computer" tip and "Open Odoo" hint now sit right on top of the bezel (anchors computed from the monitor geometry by `BaseScene._anchorDesk()` from `desk.anchors`, instead of a hard-coded point 20 cm higher). The terminal menu has its own anchor (`terminalSide`) right of the monitor, vertically centred, so it never covers the screen. POC `scene.js` maps the same two anchors.
- Office window (`makeWindow()` in `kit/props.js`): city view instead of a flat pane. Layers: sky gradient, two cloud layers drifting at different speeds and floating up/down (texture offset, `group.userData.tick(dt, t)` called from `OfficeScene._frame`), a seeded skyline (hazy far towers, near towers with lit windows), then lightly tinted glass with two reflections. Every layer is a lit material that receives shadows (plus emissive for daylight), so wall shadows run across the window instead of stopping at it.
- Completion card: "Back to levels" / "Play again" buttons spaced (`.o_su_summary .o_su_menu_btn` margin).
- POV office (`office_pov_scene.js`) is an indoor room: ceiling with 4 recessed light panels (`CEILING_PANELS`), both side walls, its own `_buildLights()` (no sun: hemisphere, one overhead shadow light, warm panel point lights, window daylight, a weak frontal "bounce" light). Room finish: cream plaster walls, deeper cream panelled wainscot with chair rail, skirting and crown moulding, 1.1 m stone floor tiles; warm cream palette desaturated 5% and lights 5% stronger than the first tuning (10% was too much) (a fully neutral palette was rejected as too bright), woven rug, a wall clock showing the real time, books and a vase on the cabinet (`_buildDecor()`).
- Graphics kit: `kit/textures.js` (seeded procedural canvas textures: wood, tiles, plaster, rug, keyboard). Shared props upgraded (also visible in the overview office/dock): oak desk on a steel frame with a walnut drawer pedestal, keyboard/mouse pad/mug/notebook/succulent; wood-framed board whose surface is lit like paper (office board drawn on warm paper); oak cabinet with brass pulls; arching-leaf plant; warm fabric chair. Tuned with headless renders of the real scenes (import map onto `static/src/three`, `python3 -m http.server`). The overview office room itself (walls/floor) is unchanged.
- POV office round 2: 1.1 m floor tiles; one dark-bronze `FRAME_COLOR` (kit/props.js) for window, door and board frames; mug handle fixed; the office chair is hidden in POV and two `makeVisitorChair()` chairs (scale 1.15) stand pulled up to the far edge of the desk, spread within its width; plants sway very lightly (`makePlant().userData.tick`); Newton's cradle desk toy front right of the monitor, left of the succulent (`makeNewtonsCradle()`, animated through `desk.tick(t)` from the office and dock `_frame`).
