# `stock` tests — structure and guidelines

This file explains how `addons/stock/tests/` is organized and how to add a new test
here. It's written for humans and for AI coding assistants alike — if you (or an AI
assistant) are about to add a stock test, read this first.

This is a **living document**. It's being written during an ongoing refactor of this
test suite (see `archive/` below) and will be filled in and corrected as that work
progresses. If something here looks stale or wrong, fix it in the same change.

## Current structure

- `common.py` — the shared base class, `TestStockCommon(BaseCommon)`. Every test
  class here runs under `base.test_company`, set as the *only* company visible to
  it (`_test_independent_company_xmlid`), so tests don't need to think about
  multi-company unless they opt into it on purpose. Minimal on purpose: one
  warehouse (`warehouse` — the pre-made `stock.test_warehouse` test data for
  `base.test_company`, not a freshly created one, with `stock_location` and the
  picking types `picking_type_in`/`picking_type_int`/`picking_type_out` derived
  from it), its `supplier_location`/`customer_location` (referenced from stock's
  regular demo data, not created - they're foundational enough that a test
  editing or deleting one would break stock behavior broadly, not just our own
  tests), `scrap_location` (`self.env.company.scrap_location_id` — computed per
  company, no fixed xmlid to reference either), `uom_unit`/`uom_pack_6`
  (`uom_pack_6` created fresh, unlike `uom_unit` and the locations above -
  narrow/isolated regular data a test could plausibly touch without wider
  fallout), three products (`product` storable/untracked, `product_lot`
  lot-tracked, `product_serial` serial-tracked — all via `_create_product`,
  built directly on `BaseCommon`, not through `product`'s own test common), and
  a growing set of helper methods (see below). Add more shared fixtures here
  only once an actual test needs them.
- `archive/` — the pre-refactor test suite. **Reference only, never run** (not
  imported from `tests/__init__.py`). Each file there is being triaged one by one:
  dropped, folded into an existing new test, or ported cleanly into the new
  structure. Don't copy code from here — read it to understand what scenario it
  covers, then write that scenario fresh, following the conventions below.
- Feature-area test files — the new structure being built. Started as 9
  empty scaffolds, one per bucket below; a bucket can end up split across more
  than one file once it's actually being filled in (e.g. bucket 2 "Moves &
  reservation" split scrap out into its own `test_scrap.py` once that cluster
  turned out large enough on its own — the *bucket* grouping stayed the same,
  only the file split within it changed). Check the actual files for what's
  ported so far and which class(es) each one holds, this doc may lag behind.
  - `test_transfer_flow.py` — `stock.picking`-level behavior: confirm/assign/
    validate (including the immediate-validate wizard/backorder/error matrix),
    chaining pickings together, returns & exchanges. `TestTransferFlow`.
  - `test_move.py` — `stock.move`/`stock.move.line` mechanics:
    reservation, removal strategy, UoM conversion, editing a reserved or a done
    move, without going through a full picking flow. `TestStockMove`
    (plain move-level) + `TestStockMoveMultiStep` (reservation across a
    real chained pick → ship delivery).
  - `test_scrap.py` — `stock.move.is_scrap`/`action_scrap()` behavior: impact
    on quants, reserved-line interaction, the insufficient-quantity wizard,
    serial-number availability checks. `TestScrap`.
  - `test_warehouse_routing.py` — warehouse configuration, push/pull routing
    rules, replenishment, and putaway rule matching (product/category
    precedence, storage-category capacity, sublocation strategies).
    `TestWarehouseRouting` (routing/replenishment, not yet filled in) +
    `TestPutaway`.
  - `test_packaging.py` — put in pack, package propagation, negative-quant
    reconciliation.
  - `test_batch_wave.py` — batch and wave picking.
  - `test_inventory_adjustment.py` — inventory counts (apply/revert), direct
    quant CRUD, relocating stock.
  - `test_lot_serial.py` — lot/serial tracking, serial number generation.
  - `test_reporting.py` — stock reports and the inventory overview dashboard.
  - `test_multicompany.py` — multi-company access, routing, quant visibility,
    resupply.

## Before writing a new test

1. **Look for an existing file covering the same feature area first.** Add your test
   there rather than starting a new file, unless it genuinely doesn't fit anywhere
   yet (if so, consider whether a new file is warranted and name it after the
   feature, not after a method/class being tested).
2. **Check `common.py` for a helper before writing raw `.create()` calls.** Building
   a picking, validating it, seeding a quant, creating a warehouse or an orderpoint
   almost certainly already has a helper — see the list below. If you find yourself
   repeating a pattern that isn't covered, that's a sign a new helper belongs in
   `common.py`, not that you should inline it again.
3. **Give the test a descriptive name**, not a numbered suffix
   (`test_putaway_product_over_category`, not `test_putaway_6`). If you're adding a
   variant of an existing scenario, prefer parametrizing the existing test
   (`subTest`) over adding `_7`, `_8`, ... methods.
4. **"Reservation" in a test name means a move that isn't `done` yet**
   (`draft`/`confirmed`/`assigned`/`partially_available`). Once a move is
   `done`, editing it is a different concept (correcting a completed
   transfer, not earmarking stock for one) — name it accordingly, e.g. "edit
   quantity after validation", not "reservation".

## Conventions

- One feature area per file, one class per file (or a small number of closely
  related classes) — not a single growing class covering everything.
- Simple, spelled-out code over compact/clever code, even if it takes a few more
  lines: explicit `if`/`else` over buried ternaries, named variables over chained
  unpacking, separate statements over dense dict-merges.
- Prefer referencing existing data (`env.ref`/`quick_ref`) over creating your
  own: it's test-only data (loaded via a module's `test_data` manifest key,
  like `stock.test_warehouse`) that nothing should ever edit or delete, or
  it's regular data foundational enough that a test touching it would break
  stock behavior broadly, not just the one test relying on it (e.g.
  `supplier_location`/`customer_location`). For regular (non-test) data that
  is narrow/isolated enough that a test could plausibly edit or delete it as
  part of what it's testing without wider fallout (e.g. a deletable UoM),
  create your own copy instead - `quick_ref`/`env.ref` do no existence check,
  so a test relying on shared, mutable data after another test altered or
  removed it fails later, far from the real mistake.
- Stock-model factories need `with_user(self.user_stock_manager)` — the default
  restricted test user has no stock access. `user_stock_manager` also carries
  `product.group_product_manager` and `base.group_system` (which implies
  `base.group_erp_manager`), so it also covers editing a product's UoMs,
  decimal precision settings, and creating a warehouse (writes `res.groups` via
  `_check_multiwarehouse_group`) - **prefer `with_user(self.user_stock_manager)`
  over `sudo()`** for anything a test needs elevated rights for; `sudo()`
  bypasses the acting user entirely rather than using the one fixture meant
  for this. The existing `common.py` helpers already do this correctly —
  another reason to use them instead of writing a raw `.create()`.
- When most of a file's tests don't need Administrator-level access, set
  `_test_user_groups = ('stock.group_stock_user',)` on the test class so the
  default test user is a regular Inventory/User instead of the base restricted
  one - more realistic, and exercises the actual access level the scenario
  needs. Override on just the specific tests that do need manager access with
  `@users('stock_manager')` (`from odoo.tests import users`). This only
  affects direct `self.env` calls in the test body; `common.py`'s own helpers
  still elevate internally where they need to (e.g.
  `with_user(self.user_stock_manager)`, `sudo()`).
- Don't follow `archive/`'s conventions (god classes, inconsistent `Form` vs. raw
  `.create()`, numbered test names, ad hoc fixture rebuilding instead of using the
  shared base). For a model of clean, idiomatic Odoo test code, look at
  `odoo/addons/base/tests/` instead.

## Helper API in `common.py`

*(keep this in sync with the actual file — if in doubt, read `common.py` itself)*

- `_create_product(**values)` — `product.product.with_user(self.user_stock_manager).create(...)`
  with a storable-product default, for a test that needs a product with
  specific characteristics (e.g. `tracking`, `is_storable=False`) beyond
  `self.product`/`self.product_lot`/`self.product_serial`.
- `_check_inventory(product, {location: qty, ...}, lot=None, package=None, owner=None)`
  — asserts the available quantity of `product` at each given location,
  optionally restricted to one `lot` (lot or serial number), `package`, and/or
  `owner`. Pass whichever of these the scenario actually involves (e.g. a
  packaged-quant test should pass `package=...`), rather than relying on
  there happening to be only one quant for the aggregate total to match by
  coincidence. A negative `qty` checks with `allow_negative=True` (e.g. a
  supplier location after a receipt). Prefer this over calling
  `stock.quant._gather()`/`_get_available_quantity()` directly in a test - the
  only legitimate reason to still reach for `_gather()` is to check a quant
  field that isn't the quantity itself (e.g. `in_date`).
- `_create_move(product, src_location, dst_location, **values)` — also sets a
  realistic `picking_type_id` by default (every move has one in reality):
  `picking_type_in` when `src_location` is the supplier location,
  `picking_type_out` when `dst_location` is the customer location, otherwise
  `picking_type_int`. This matters beyond realism - e.g. a receipt bypasses
  reservation entirely and a picking type's `reservation_method` defaults to
  `'at_confirm'`, so **confirming a move already reserves it** in the common
  case; don't call `_action_assign()` right after `_action_confirm()` out of
  habit, check first whether it's actually needed (e.g. re-reserving after
  more stock arrives later, when nothing re-triggers it automatically).
- `_validate_move(move, quantity=None, backorder=True)` — confirm → assign →
  validate a standalone `stock.move` directly (no picking involved) - for
  `stock.move`/`stock.move.line`-level tests. Mirrors what
  `stock.picking._pre_action_done_hook()` does before a picking validates (mark
  picked only if there's a quantity and nothing picked yet), since a bare move
  has no picking to do that for it; `backorder=False` cancels any undone
  remainder instead of leaving a backorder move. For a full picking flow, use
  `_validate_picking` instead.
- `_in_move(product, lot_names=None, validate=True, **values)` /
  `_out_move(product, validate=True, **values)` — aliases for
  `_create_move(product, self.supplier_location/self.stock_location, ...)`,
  validated via `_validate_move()` by default. `_in_move`'s `lot_names` assigns
  one lot/serial name per move line (after reservation, before validating) for
  a lot/serial-tracked product. `validate=False` returns the move freshly
  created instead (e.g. to inspect `availability`/a draft/reserved state) - for
  anything needing other steps in between creation and validation, use
  `_create_move` + `_validate_move` directly.
- `_create_picking(picking_type, moves=[(product, qty)|(product, qty, uom)|dict], **values)`
  — builds a `stock.picking` with one move line per entry in `moves`.
- `_validate_picking(picking, quantities=None, confirm=True, assign=True)` —
  confirm → assign → optionally override some moves' quantity → `button_validate()`,
  processing the backorder wizard (keeping the backorder) if one comes up. Same as
  a user validating a transfer by hand - doesn't touch `picked` directly.
- `_receipt(moves=(), validate=True, **values)` / `_deliver(moves=(), validate=True, **values)`
  — aliases for `_create_picking(self.picking_type_in/_out, moves, **values)`,
  followed by `_validate_picking()` by default, for the common case of "just
  get me a done receipt/delivery". `validate=False` returns the picking
  freshly created (`draft`) instead, for a test that needs manual control
  between confirm and validate.
- `_create_scrap(product, quantity, src_location=None, dst_location=None, **values)`
  — a `stock.move(is_scrap=True)` from `self.stock_location` to
  `self.scrap_location` by default, not yet scrapped.
- `_scrap(product, quantity, src_location=None, dst_location=None, **values)` —
  alias for `_create_scrap()` followed by `_action_scrap()`, for the common
  case of "just get me a done scrap".
- `_process_backorder_wizard(action, cancel_backorder=False)` — processes the
  `stock.backorder.confirmation` wizard action returned by `button_validate()` /
  `stock.picking.batch.action_done()`.
- Seeding available stock before a test: call `stock.quant._update_available_quantity(product, location, qty, ...)`
  directly - no dedicated wrapper, that ORM method is already a one-liner. For a
  test that cares about quant-level mechanics themselves (e.g. an explicit
  negative quant, a specific `reserved_quantity`, several quants that must stay
  distinct rows), create the `stock.quant` directly instead.
- `_create_warehouse(name, code, **values)`
- `_create_location(name, parent_location=None, **values)` — a `stock.location`
  under `parent_location` (defaults to `self.stock_location`), e.g. a shelf,
  for tests about reservation ordering across several sub-locations.
- `_create_orderpoint(product, product_min_qty, product_max_qty, **values)`
