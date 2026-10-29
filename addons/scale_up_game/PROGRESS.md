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

## File map

```
scale_up_game/
├── __init__.py                  post_init_hook (seeds source stock once)
├── __manifest__.py
├── models/{game_level,game_session}.py
├── security/ir.access.csv
├── data/game_level_data.xml     Shelf-01 location, Demo Product, level
├── views/game_menu.xml          client action, menus, admin views
└── static/
    ├── lib/three/three.min.js   vendored, MIT
    └── src/
        ├── three/{animations,scene,interactions}.js
        └── components/game_root.{js,xml,scss}
```

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
