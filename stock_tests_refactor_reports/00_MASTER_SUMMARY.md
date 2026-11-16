# `stock` tests refactor — progress & metrics

Branch: `master-tests-stock-ref-arm` (odoo repo, `addons/stock/tests/`).
This file is the global status doc for the refactor: what's done, what's left,
and the before/after metrics we actually have evidence for. For the
test-by-test triage decisions on `test_move.py` (the file currently being
worked through), see `test_move.md`.

## 1. Status

**New structure built**: `common.py` (minimal shared base + helpers) and
feature-area bucket files, scaffolded and registered in `tests/__init__.py`.
Seven files have real content so far: `test_move.py` (renamed from
`test_move_reservation.py` once its scope outgrew "reservation"
specifically - see the note after the "triage COMPLETE" block below),
`test_warehouse_routing.py`, `test_transfer_flow.py`, `test_scrap.py`
(a new file within bucket 2 "Moves & reservation", not a 10th bucket - see
§3's note that file names within a bucket aren't final), `test_packaging.py`,
`test_reporting.py` (one class only - `TestDeliverySlipReport`;
`TestReporting` itself is still empty), and `test_lot_serial.py`.
`test_multicompany.py` (bucket 9's own scaffold) has been **deleted** -
see the note right after the "triage COMPLETE" block below; bucket 9's
one test now lives in `test_warehouse_routing.py` instead.

| Bucket file | Status |
|---|---|
| `test_move.py` | **In progress** — 83 tests across 3 classes (`TestStockMove` 67 + `TestStockMoveMultiStep` 11 + `TestStockMoveMultiStepPull` 5), see §2 |
| `test_warehouse_routing.py` | **In progress** — 22 tests across 3 classes (`TestWarehouseRouting` 8 + `TestWarehouseRoutingMultiCompany` 1 + `TestPutaway` 13), see §2 |
| `test_transfer_flow.py` | **In progress** — 32 tests (`TestTransferFlow`), see §2 |
| `test_scrap.py` | **In progress** — 9 tests (`TestScrap`), see §2 |
| `test_packaging.py` | **In progress** — 3 tests (`TestPackaging`), see §2 |
| `test_reporting.py` | **In progress** — 6 tests (`TestDeliverySlipReport`), see §2 |
| `test_lot_serial.py` | **In progress** — 6 tests (`TestLotSerial`), see §2 |
| `test_batch_wave.py` | Empty scaffold |
| `test_inventory_adjustment.py` | Empty scaffold |
| ~~`test_multicompany.py`~~ | **Deleted** - its one test moved to `test_warehouse_routing.py` |

**Archived files fully triaged**: `archive/test_move.py` (170 test methods,
the largest file in the suite) and `archive/test_move2.py` (~90 test
methods across 6 classes, the second-largest). The other 28 archived
files haven't been looked at yet since the initial coverage pass (see §4 for
what that pass found, kept for when their turn comes).

**`test_move.py` triage: COMPLETE.** Every one of its 170 original test
methods has now been examined and decided — kept/ported, dropped, merged,
or explicitly left open/deferred (see the 6 below, deferred on purpose,
not overlooked). This is the first, and largest, archived file to finish
plan step 2 end to end.

**`test_move.py` triage progress**: 170 of 170 original test methods
examined (100%) — 24 clusters done (basic in/out lifecycle, availability/reservation,
unreserve, use-reserved/unreserved move line, edit a reserved move line,
reservation across chained moves, mixed lot/serial tracking reservation,
putaway, edit a done move line, immediate validate, scrap, initial
demand/quantity editing, in-date/removal strategy, editing a done
picking/put in pack, move-line aggregation/delivery slip, UoM
conversion, forecast availability, user-set destination location
surviving system overrides, show_* computed fields, lot/serial editing
on `stock.move.lot_ids`, picking-level misc, likely duplicates vs.
existing coverage, free_reservation tie-break (re-derived), multicompany
orderpoint). Outcome: **116 new tests kept** (115 ported from the
archive + 1 new test with no archived
origin, added directly from
User's own question about forcing an extra/zero-stock delivery), **37
dropped** (redundant or non-illustrative,
including the 1 fan-out scenario with no real-routing equivalent —
investigated a 2-step-reception/orderpoint approach for it, confirmed
empirically it doesn't actually fan out, dropped per User;
`test_mixed_tracking_reservation_7`, dropped by User as a duplicate of
`test_reservation_spans_tracked_and_untracked_quants_serial` in substance; 6
putaway tests dropped — see below; 4 edit-done-move-line tests dropped as
redundant with another kept test — see below; 1 immediate-validate test
dropped by User as "too specific and duplicate" — see below; 3 scrap
tests dropped on further review, after the cluster's initial 1-drop pass
for not using `is_scrap` at all — see below; 1 initial-demand test
dropped as redundant with an existing richer test — see below;
`test_change_product_type` dropped, its docstring's "will raise a user
error" claim backed by neither its own code nor the current model — see
below; and `test_delivery_slip_aggregated_lines_with_canceled_move_and_packaging`,
initially folded into the backorder test, then dropped outright on
review — User: "you can remove the cancel part since it's not possible
anymore" — see below; `test_serial_tracking`,
`test_internal_transfer_with_tracked_product`, and
`test_edit_serial_number_from_move`, all dropped as duplicates of
existing coverage in the lot/serial-editing cluster — see below; and
this round, `test_recompute_stock_reference` and
`test_internal_picking_uses_shipping_policy_from_picking_type` (both
too thin to be worth a dedicated test - see below),
`test_picking_deadline_excludes_cancelled_move` (deleted after User:
"we can't have cancelled move in the picking anymore" - a scenario the
current model no longer allows), `test_storage_category_restriction`
(confirmed a straight duplicate of an already-kept putaway test - see
below), and `test_out_3` (confirmed redundant with the shipping-policy
cluster's `test_increasing_demand_past_available_stock_ships_partial_asap`/
`..._waits_all_at_once`, which already show `picking.state` tracking
`move_type` correctly when a move isn't fully ready - User: "I think we
already have a test for picking that check the state is correct back on
picking type move_type, if yes drop it"), **20
merged** (2 archived tests collapsed into 1 new test in the unreserve
cluster, 1 more in the chained-move cluster producing 2 new tests — one per
merge/no-merge outcome, see below — 1 more in the mixed-tracking cluster, 4
more across 2 merge pairs in the putaway cluster, 2 more in the
edit-done-move-line cluster, 2 more in the immediate-validate cluster, 1
more in the scrap cluster on further review, 1 more in the
initial-demand cluster, and 1 more in the move-line-aggregation cluster,
plus 1 more in the UoM-conversion cluster (a UoM-follows-product-change
test folded into an existing one), 2 more in the user-set-destination-location
cluster (3 archived tests folded into 1 new one — see below), 1 more in
the show_*-computed-fields cluster (2 archived tests folded into 1 new
one), and 1 more in the lot/serial-editing cluster (2 archived tests
folded into 1 new one — see below),
**5 left open/deferred**
(`test_past_quantity`,
`test_past_availability_in_strict_mode`, `test_product_tree_views`,
`test_newly_added_move_line_is_picked_if_move_is_picked` - flagged
during the move-line-aggregation cluster as belonging in
`test_move_reservation.py`'s edit-a-move-line territory instead, and
now `test_move_line_compute_locations` - flagged during the UoM cluster
as a different topic (move-line location defaulting), not
decided yet). Full per-test breakdown with
reasoning: `test_move.md`.

**Follow-up, after the above**: two more of the open/deferred tests
resolved. `test_past_quantity` and `test_past_availability_in_strict_mode`
were a pair (held out together earlier). Compared directly:
`test_past_quantity`'s historical (`to_date`) check never actually
produces a different result (always 0, nothing in it is backdated) -
its real content (live `qty_available` after a partial pick / a
different-UoM move) is already covered by existing reservation/UoM
tests. `test_past_availability_in_strict_mode` is the genuine
historical-lookup test: two moves deliberately backdated 5-7 days,
checked at three different past dates with three different results
(10, 13, 11). User confirmed: drop `test_past_quantity` outright, keep
the other one, renamed `test_availability_at_date`. First placed in
`test_reporting.py`'s `TestReporting` class (empty, docstring already
matched) - verified 1/1, then User asked to move it again, into
`test_move.py`'s (then still `test_move_reservation.py`)
`TestMoveReservation` `# ---- Availability / reservation ----` section
instead, using the `Date` helper (added to the file's existing
`from odoo.fields import Datetime` import) rather than `fields.Date`.
`test_reporting.py` reverted to fully empty again. Final: 2 archived →
1 new test, 1 dropped, 0 merges. Verified at both locations: `TestReporting`
1/1 before the second move, `TestMoveReservation` 61/61 after it, full
`/stock` tag 135/135 both times (same total, confirming nothing broke
across either relocation). Kept/dropped tallies above now stand at
**117 kept, 38 dropped**, and only **3 left open/deferred**:
`test_product_tree_views`,
`test_newly_added_move_line_is_picked_if_move_is_picked`,
`test_move_line_compute_locations`.

**Follow-up, continuing the open list**: `test_product_tree_views`
re-read and dropped. It's a defensive ACL smoke test (a basic,
no-stock-group user opens `product.product_product_tree_view`/
`product_template_tree_view` via Form, checking no field-access error)
- not stock-move/picking behavior, and no indication it guards a
specific historical bug. Same class of test already dropped elsewhere
this refactor (the putaway smart-button test, the scrap
unlink-on-discard test). User confirmed: drop it, no port. Tallies now
stand at **117 kept, 39 dropped**, and only **2 left open/deferred**:
`test_newly_added_move_line_is_picked_if_move_is_picked`,
`test_move_line_compute_locations`.

**Side-quest (outside this file's own scope, noted here for context)**:
the `test_product_tree_views` drop above prompted User to ask whether an
equivalent test already exists post-install in the `product` module for
a basic user opening the product page. Searched `addons/product/tests/`,
`odoo/addons/base/tests/test_ir_ui_view.py`, and broadly every module —
found nothing already covering it, so the drop above still rests on the
original reasoning (defensive smoke test, no stock behavior), not on
redundancy. User then asked to add the real equivalent directly in the
product module instead (kanban, list, and form views, one test). Ended
up as `addons/product/tests/test_common.py`'s `TestProduct.test_product_user_access`
— merged with the pre-existing `test_any_user_can_print_product_labels`
check per User's request, after two renames. Verified: full `product`
module tag, 206 tests, 0 failed, 0 errors (one fewer than the pre-merge
baseline of 207, confirming a merge, not a net addition). Not part of
this file's own kept/dropped/open tallies — a different module's test
suite entirely.

**Follow-up, continuing the open list**: `test_move_line_compute_locations`
read and kept. `stock.move.line._compute_location_id()`/
`_compute_location_dest_id()` prefer `line.move_id.location_id`/
`_dest_id` first, falling back to `line.picking_id.location_id`/
`_dest_id` only when the line has no move at all — exactly the two
cases the archived test demonstrates. Genuinely distinct from the
existing "Move line destination location" section (that one is about a
destination *surviving an edit after creation*, this one is about
*defaulting at creation time* with no move yet). Ported close to 1:1 as
`test_move_line_location_defaults_from_its_move_or_its_picking`,
appended right before `test_move_line_destination_location_survives_further_edits`
in `test_move.py`'s `TestStockMove` class. No real-DB surprises — passed
first try. `TestStockMove` now 62 tests (`test_move.py` 68 total across
2 classes). Verified: `TestStockMove` 62/62, full `/stock` tag 136/136
passing, 0 errors (one more than the previous 135, confirming the one
new test and nothing else changed). Tallies now stand at **118 kept, 39
dropped**, and only **1 left open/deferred**:
`test_newly_added_move_line_is_picked_if_move_is_picked`.

**Follow-up, closing out the open list**: `test_newly_added_move_line_is_picked_if_move_is_picked`
read and kept - exercises `stock.move.line.create()`'s `vals['picked'] =
move.picked` default (a line created with `move_id` set and no explicit
`picked` key inherits the move's own `picked` state), a real behavior
worth protecting per User ("we want to protect this behavior"). Rather
than port it as a new test, User asked to fold it into an existing one
("Can you try to include it in an existing test"). Found the natural
host already in `TestStockMove`:
`test_creating_a_second_line_from_quant_id_only_fills_remaining_demand`
builds the exact same shape (a confirmed-but-not-done move, lines
created directly via `env['stock.move.line'].create({'move_id':
move.id})`) - added `move.picked = True` mid-test plus two assertions
(the pre-existing line picks up `picked` via `_inverse_picked()`'s
write-time propagation; a line created *afterwards* inherits it via the
`create()` default), and renamed it to
`test_creating_a_second_line_from_quant_id_fills_remaining_demand_and_inherits_picked`
to reflect both things it now checks. 1 archived test folded into 1
existing test, **0 new test methods** - `TestStockMove` count holds at
62, `test_move.py` holds at 68 total. Verified: `TestStockMove` 62/62,
full `/stock` tag 0 failed/0 errors (raw count drifted to 120 this run -
a pre-existing, already-flagged drift unrelated to this change, driven
by the still-empty `test_batch_wave`/`test_inventory_adjustment`
scaffolds contributing 0 tests each and incidental unrelated `test_js`
tests pulled in by `-i stock`'s dependency chain; not reconciled, same
as every prior drift note in this doc - what holds is 0 failed/0 errors
both before and after). Tallies now stand at **118 kept, 39 dropped, 0
left open**.

**`archive/test_move.py` triage is now FULLY COMPLETE - all 6
originally-open/deferred tests decided, nothing left undecided.**

The chained-move cluster (`link_assign`) started with a hand-wired
`move_orig_ids`/`move_dest_ids` approach (mirroring the archived tests'
own technique) that produced 4 real-DB failures out of 6 new tests. User
redirected: rebuild it as a **real 2-step (`pick_ship`) warehouse flow** —
create only the pick, let Odoo's push rule generate the ship automatically —
in a new class, `TestMoveReservationMultiStep`. That approach is now the
convention for any future chained-move test: never hand-wire
`move_orig_ids`/`move_dest_ids` onto standalone moves; route through a real
picking configuration instead.

Real finding from that class: whether a backorder pick's push merges into an
already-existing ship picking, or creates a separate one, is determined
entirely by whether both picks share a `stock.reference` (`reference_ids` on
`stock.move`) — not by the existing picking's state. Kept as two separate
tests (`test_backorder_pick_without_reference_pushes_its_own_ship` /
`test_backorder_pick_merges_into_existing_ship`) rather than one, per User's
request, so both real outcomes are explicit instead of only one being shown.

Mixed lot/serial tracking reservation cluster: 2 tests found misplaced
(`test_mixed_tracking_reservation_3`/`_4` edit a move's lines *after*
`_action_done()` - deferred to, and since ported in, the `edit a done move
line` cluster below) and 1 test moved out entirely (`test_multi_step_update`,
unrelated to tracking -
ported into `TestMoveReservationMultiStep` as
`test_receiving_more_than_demanded_updates_pushed_move_demand`). A 7th test
(`test_reservation_spans_tracked_and_untracked_quants_tracked_quant_created_first`,
the `_7` port) was initially kept as a separate order-dependent regression
guard, then dropped on User's review as a substantive duplicate of
`test_reservation_spans_tracked_and_untracked_quants_serial`.

Putaway cluster: 21 archived tests → 13 kept, 6 dropped, 2 merges (4
archived tests collapsed into 2 new tests) — went into
`test_warehouse_routing.py` (`TestPutaway`), not `test_move_reservation.py`,
per User's instruction: putaway is about where a receipt routes, not
reservation mechanics. This cluster went through several rounds of
simplification on User's review after the initial port (full detail in
`test_move.md`):
- Two kept tests initially wrote `result_package_id` directly on the move
  line and failed against a real DB, because the putaway recompute on
  package assignment is wired through an `@api.onchange` that a plain field
  write never triggers; fixed by calling the real
  `move_line_ids.action_put_in_pack(package_id=...)` action instead.
- The smart-button test was "super defensive" per User and got dropped, its
  core check folded into `test_putaway_rule_by_product_takes_precedence_over_category`
  instead.
- The archive's own `_5` (ported as
  `test_putaway_rule_by_category_matches_through_parent_category`) never
  actually set a category anywhere despite its docstring claiming to — a
  mislabeled/bugged test in the original suite, faithfully carried over.
  Rewritten to actually test a parent-category rule matching a product in a
  child category.
- The two push-leg tests (package-type-filtered and category-filtered) were
  "overreacted" per User — the actual lesson (putaway evaluated on the
  *pushed* move, not the original receipt) needs neither a package nor
  several candidate shelves. Merged into one minimal test.
- `test_putaway_with_packaging` dropped per User: since a receipt's move
  auto-assigns regardless, it didn't actually demonstrate anything useful.
- The storage-category `closest_location` test was "super arbitrary" per
  User (an unused decoy sublocation + an unused pre-existing quant) and got
  merged into the quantity-capacity test instead, which now also proves the
  parent is excluded from candidates even once every real candidate is full
  (User: "except when everything is full") — the fallback to the generic
  destination in that case isn't `closest_location` "picking" the parent,
  it's just that nothing else matched.
- Naming convention clarified by User: `shelf_1`/`shelf_2` only when a test
  genuinely has two candidate sublocations; a single sublocation is named
  `child_loc`. Applied retroactively across the whole file.

Edit-done-move-line cluster: 16 archived tests → 11 kept, 4 dropped, 1
merge — mirrors the naming/economy already established for the
reservation-time equivalent cluster (`test_edit_reservation_follows_location_change`
et al., which never bothered with a package-alone or owner-alone test
either): dropped `_3` (package-alone), `_4` (owner-alone), and `_12`
(redundant subset of `_14`); merged `_5`+`_13` into one combined
lot-and-package test. Real-DB finding: `_10`'s archived name/docstring
claims editing a done incoming line's quantity to 0 "removes" the quant -
it doesn't; the row persists at quantity 0 (the archive's own
`gather_relevant` helper filtered zero-rows out for display, masking this).
Initially ported with a literal row-absence assertion and failed against a
real DB; fixed to assert the available quantity directly and renamed to
drop the inaccurate claim. User later caught a further duplicate on review
(`_6`, nearly byte-identical to the reservation-time
`test_edit_reservation_to_unavailable_location_goes_negative`) - dropped,
bringing the final count to 11 kept.

Similarity pass (per User's request, "do a pass on current test to find
similarity"): reviewed all 64 tests across both new bucket files. Found and
fixed one more concrete bug of the same class already caught twice in the
putaway cluster — a test claiming to use a "category-wide" rule that never
actually set `category_id`: both `test_putaway_rule_by_product_takes_precedence_over_category`
and `test_putaway_rule_by_product_falls_back_to_category_when_product_does_not_match`
used a plain unscoped rule instead (the first even named its unused
variable `_rule_category`). Fixed both to genuinely set `category_id`
(with the product's own category matching it) - this also meant the
smart-button assertion folded into the precedence test needed correcting,
since with a real category match the smart button now lists *both* rules,
not just the product one. Three more pairs were flagged as
borderline/judgment calls and left open (not acted on): the lot-tracked
variant of the "steal via manual move line" test, the lot-equivalent of the
just-removed `_6` duplicate (`test_edit_done_move_line_lot_to_unavailable_lot_consumes_untracked_quant`),
and two mixed-tracking-cluster tests that both land on the untracked quant
pool via slightly different starting states.

Immediate-validate cluster: 11 archived tests → 9 kept, 1 dropped, 1 merge
(final count, after a later review pass — see below) — went into
`test_transfer_flow.py` (`TestTransferFlow`), not
`test_move_reservation.py`, same reasoning as putaway: this is entirely
`stock.picking.button_validate()` behavior (wizards, backorders,
`UserError`s), matching bucket 1 "Transfer flow" in the bucket plan, not
bucket 2 "Moves & reservation". Flagged to User before writing any code;
confirmed. Unlike the putaway/edit-done-line clusters, this one read as a
deliberate coverage matrix (full/partial/unavailable availability ×
untracked/lot/serial tracking × single/multi-move × wizard/error outcomes)
closer in spirit to "basic in/out lifecycle" than to redundant
quant-characteristic edits — proposed keeping all 11 as close 1:1 ports, no
merges/drops; User confirmed. Real-DB finding: the archive's own `_6`
stops at asserting a final wizard pops, never actually processing it to
`done` - an initial over-extension (`assertEqual(state, 'done')`) failed
against a real DB; traced the real cause in `_pre_action_done_hook()`
(`stock_picking.py` ~1292-1311, auto-pick-all-moves only fires when *no*
move has been picked yet) and fixed the assertion to match. User also asked
to prefer the `_receipt`/`_deliver` helpers over manual
`_create_picking()` + `action_confirm()`/`action_assign()`/`button_validate()`
wherever a test doesn't need to inspect the return value or interleave
steps mid-flow — simplified 3 of the 11 tests accordingly (an exception
from inside `_receipt`/`_deliver` propagates out exactly like a direct
call would, so `UserError` tests can still wrap the helper call directly).
`test_immediate_validate_2` renamed to `test_backorder_wizard_opens_on_partial_availability`
per User, matching the `test_backorder_*` convention already used in
`TestMoveReservationMultiStep`. Since this cluster uses receipt/delivery
pickings "massively", User asked to extend `_receipt`/`_deliver` in
`common.py` itself with the same `validate=True` flag `_in_move`/`_out_move`
already have, rather than keep falling back to manual `_create_picking()`
for the tests that need to inspect the picking before validating it -
updated `common.py` and every test in this file that previously called
`_create_picking(self.picking_type_in/out, ...)` directly now goes through
`_receipt(..., validate=False)`/`_deliver(..., validate=False)` instead
(the one exception, `test_validate_picking_with_mixed_availability_backorders_both_moves`,
is an internal transfer - no `_transfer`-equivalent helper exists, so it
still uses `_create_picking(self.picking_type_int, ...)` directly).

On a later review pass, User asked for two more changes: merge `_5`
(serial receipt requires lots - error side) and `_9` (same toggle, success
side) into one test showing both sides of the same picking-type setting;
and drop `test_validate_picking_without_picked_reservations` outright as
"too specific and duplicate" (its "nothing to validate" lesson was already
covered by `_7`). Final: 9 tests, 183 lines. Real DB run: 9/9 passing, 0
errors, ~1,229 queries, ~5.14s.

Scrap cluster: 13 archived tests → 12 kept, 1 dropped, no merges.
`test_scrap_8` was flagged before writing any code: it doesn't use
`is_scrap`/`_action_scrap()` at all - it's 3 plain internal-transfer
pickings to the scrap location testing multi-picking cancel/partial-validate
resolution, already covered by the immediate-validate cluster plus the
simpler `_10`/`_11` tests here. Dropped per User. Added `scrap_location`
(`cls.env.company.scrap_location_id`) and two new helpers,
`_create_scrap`/`_scrap`, to `common.py` (mirroring `_create_move`/
`_validate_move`) since nearly every test in this cluster builds a scrap
move the same way. Real-DB finding while writing the UoM-aware reservation
test: the first quant/UoM numbers tried landed exactly on a rounding-
direction ambiguity (`4/6 = 0.6667` truncates to `0.66`, which
`assertAlmostEqual` at 2 decimal places can't absorb) that the archive's
own dozen-based numbers happened to avoid by luck (`4/12 = 0.3333` rounds
the same way either direction) - fixed by picking numbers that land exactly
on a clean value instead of loosening the assertion's precision. Also
renamed one test whose archived docstring claimed to "modify the done
linked stock move" afterward when the code never did that. Placement moved
twice on review: first from `test_move_reservation.py` to
`test_transfer_flow.py` (several of these tests are genuinely picking-level
- scrap linked to a `stock.picking`, validating a delivery after a scrap, a
picking whose destination is the scrap location - "uses classical move
basis and are an upper layer"), then into its own new file,
`test_scrap.py` (`TestScrap`), registered in `tests/__init__.py`. Still a
file within bucket 2's territory, not a 10th bucket. `common.py`'s
`scrap_location`/`_create_scrap`/`_scrap` stay put regardless of which file
uses them. User also strengthened one test on this pass:
`test_scrap_during_reserved_delivery_still_lets_picking_validate` now
asserts the delivery actually validated 9 pieces (`move_ids.quantity` +
`_check_inventory` at the customer location), not just `state == 'done'`.

On a further review pass, three more trims to `test_scrap.py` itself (no
change to the archived-test disposition, just the new file's own shape):
`test_scrap_destination_can_be_a_plain_delivery` deleted outright ("useless
now since the flag is on scrap move" - its premise stopped being true once
the refactor settled on `is_scrap` driving scrap-ness, not the
destination's location type);
`test_scrap_during_reserved_delivery_still_lets_picking_validate` merged
into `test_scrap_from_a_picking_adds_a_second_move` (same picking_id-linking
shape, now with the 9-delivered/1-scrapped numbers and the
validate-and-check-quantities tail folded in); `test_scrap_unlink_on_discard_depends_on_context`
deleted outright ("not a flow or a useful protection"). Also tried porting
`test_scrap_serial_number_warns_if_unavailable_at_source` from a direct
`onchange()` call to a Form-based simulation of the real `stock.view_scrap_move_form`
view, then reverted - Form only logs a warning, it doesn't hand the message
back for an assertion, so a direct `onchange()` call is the cleaner choice
specifically when what's under test is the warning's own content. Final:
9 tests, 170 lines (down from 12/195).

Initial demand/quantity editing cluster: 6 archived tests (`test_set_quantity_1`,
`test_initial_demand_1`, `test_edit_initial_demand_1/_2`,
`test_initial_demand_3/_4`, scattered around the scrap cluster in the
archive) → 4 kept, 1 dropped, 1 merge. User asked, before any code: check
whether `test_set_quantity_1` (writes `move.quantity` directly on two bare
confirmed moves, no real behavior shown) is already covered by an existing
test with quantity spread across two sub-locations. It is —
`test_reservation_updates_with_move_quantity` (cluster 2) already shows
`move.quantity = X` reassigning reservation across two shelves, several
lots, and a package — confirmed redundant, dropped. User also asked to
fold `test_initial_demand_3` into `_4`: despite its name, `_3` edits
`move.quantity`, not `product_uom_qty` - the same "named wrong, built
wrong" issue already caught twice in the putaway cluster. Folded as a
trailing step onto `_4`'s port (growing a delivery's demand past available
stock needs a manual re-assign): after that, writing `quantity` directly
is shown to leave the picking's own state untouched entirely, a different
field from `product_uom_qty` - confirmed by reading `stock.move.write()`,
which gates all the demand-change special handling (unreserve, `partially_available`,
receipt auto-reassign) on `'product_uom_qty' in vals` specifically, never
on a bare `quantity` write. 4 new tests, appended to `TestMoveReservation`
right after `test_reservation_updates_with_move_quantity` (new "Initial
demand" section).

On review, User asked to relocate the 4th test ("Move
`test_increasing_demand_past_available_stock_needs_reassign` in picking
flow and just check the delivery status base on picking type (duplicate
the test with all at once, or asap)"): moved out of `TestMoveReservation`
into `TestTransferFlow` (`test_transfer_flow.py`), since it was already
checking `delivery.state` - same "wrong bucket" call already made for
scrap and putaway/immediate-validate. Split into two tests on
`stock.picking.move_type` ("Shipping Policy": `direct` = ASAP, `one` =
All at once) - confirmed via `stock.picking._compute_state()` +
`stock.move._get_relevant_state_among_moves()` that a single
`partially_available` move reads as the picking's own `'assigned'` under
ASAP but `'confirmed'` under All at once, which is exactly what the
archived `_4`'s unexplained `# actually, partially available` comment was
gesturing at without ever testing the alternative. Dropped the `_3`-fold
tail (`quantity` write leaving picking state untouched) that this refocus
superseded - flagged rather than silently dropped. Then, same turn: "Also
try to increase and decrease the move initial demand to check if the
delivery state is updated" - added a shrink-after-grow step to both,
verified empirically first: shrinking below what's reserved unreserves
the excess and drops to `'confirmed'` under *either* policy (a delivery
never auto-reassigns itself on any demand edit, growing or shrinking -
only a receipt does), needing a manual `action_assign()` same as the grow
case.

Final: `test_move_reservation.py` 1,097 lines/54 tests (the original 45 +
3 of the 4 new initial-demand tests, the 4th having moved out, +
`TestMoveReservationMultiStep`'s 6); `test_transfer_flow.py` 258
lines/11 tests (9 + 2 new, new "Shipping policy" section). Real DB run,
full `/stock` tag: 97/97 passing, 0 errors. Combined across the four
active bucket files: 87/87 passing, 0 errors, ~9,648 queries, ~10.5s.

In-date/removal strategy cluster: 3 archived tests (`test_in_date_1..3`,
right after the initial-demand cluster's territory in the archive) → all
3 kept, no drops, no merges. Checked for overlap before writing anything:
`test_edit_done_move_line_follows_lot_change` (edit-done-move-line
cluster) already covers the same mechanism as `_2` (editing a done line's
lot re-syncs quants), but never checks `in_date` - confirmed `_2`'s
unique value is the in_date-preservation angle specifically, not a
duplicate. No existing removal-strategy test anywhere yet, and no
`pack_location` fixture in `common.py` - used a local
`self._create_location('Pack')` per test instead, same judgment as other
one-off destinations in this file. All 3 kept as genuinely distinct
mechanisms: `_1` (plain in_date propagation across an internal move, the
baseline), `_2` (FIFO removal strategy picks the oldest lot by default +
editing the resulting done line's lot afterward swaps both quants'
in_dates correctly), `_3` (creating a brand-new move line directly on an
already-done move - not editing an existing one - also carries the lot's
own in_date correctly). Appended as a new "In-date / removal strategy"
section in `TestMoveReservation`, right before "Mixed lot/serial tracking
reservation".

Real-DB finding (2 of 3 failed on first run): `stock.quant._gather(...,
strict=True)` with no `lot_id` passed doesn't mean "any lot" - its domain
becomes `lot_id in [False]` when `strict=True` and `lot_id` is falsy,
which excludes every lot-tracked quant and matches only the untracked
pool. The existing scrap-cluster precedent for this exact call shape only
worked because that product is untracked; copying it for a lot-tracked
product silently returns an empty recordset instead of raising, so
`quant.in_date` read back `False` and tripped `assertTrue` with a
misleading-looking failure. Fixed by always passing the actual `lot_id`
to `_gather()` for a tracked product, captured via
`move.move_line_ids.lot_id` right after `_in_move(..., lot_names=[...])`.
Also fixed in passing: `TestMoveReservation`'s class docstring still said
"putaway, reservation, removal strategy, scrap, UoM conversion, editing a
done move" - stale on two counts (putaway and scrap both moved out long
ago) and now finally true on "removal strategy" since this cluster
actually added one. Rewritten to match current scope.

Final: `test_move_reservation.py` 1,185 lines/57 tests (54 + 3 - 51
`TestMoveReservation` + `TestMoveReservationMultiStep`'s 6). Real DB run,
full `/stock` tag: 100/100 passing, 0 errors. Combined across the four
active bucket files: 90/90 passing, 0 errors, ~10,094 queries, ~13.3s.

Editing a done picking / put in pack cluster: 5 archived tests
(`test_change_product_type`, `test_edit_done_picking_1`,
`test_put_in_pack_1..3`, right after the in-date cluster's territory) →
4 kept, 1 dropped, no merges. Read all 5 in full before proposing anything.
`test_change_product_type` flagged and dropped: its own docstring claims
changing a product's type/tracking "will raise a user error" in several
scenarios, but the test code never calls `assertRaises`, and reading
`product.template.write()` confirmed the current model doesn't enforce
this either - changing `is_storable` with existing moves/quantities
silently resets inventory instead of raising. Neither the code nor the
model backs the docstring's claim.

`test_edit_done_picking_1` + User's instruction ("keep the test that
adding a stock.move.line in a picking will create the stock.move (in
done and not done state - single test)"): the archive only covered the
done-picking half. Extended into one test covering both, after confirming
via `stock.move.line.create()` that they're genuinely different code
paths - a not-done picking first tries to link to an existing move for
the same product (`_get_linkable_moves()`) and only creates a new one if
nothing matches, while a done picking always creates a new move
unconditionally, even for a product that already has one there. Named
`test_adding_a_move_line_to_a_picking_creates_its_move`, placed in
`test_transfer_flow.py` (picking-level), new "Editing a done picking"
section at the end of the file.

`test_put_in_pack_1..3` - User: "Keep 3 pack tests for now." First real
content for `test_packaging.py` (was an empty scaffold). Read
`stock.move.line.action_put_in_pack()`/`_get_lines_and_packages_to_pack()`
before writing anything: the real rule is picked-first filtering (if any
candidate line is `picked`, only picked lines get packed that call;
otherwise every line with quantity > 0 does) - "same package vs. different
package" is purely a function of one call vs. two calls, not of
done-quantity state the way the archive's phrasing might suggest. Ported
fairly faithfully to the archive's own steps rather than reverse-
engineering the line-splitting mechanics from the model code, then
verified empirically - all 3 passed on the first real-DB run.

Final: `test_packaging.py` 92 lines/3 tests (new file content),
`test_transfer_flow.py` 304 lines/12 tests (11 + 1 new). Real DB run, full
`/stock` tag: 106/106 passing, 0 errors. Combined across the five active
bucket files: 94/94 passing, 0 errors, ~10,797 queries, ~11.9s.

Move-line aggregation / delivery slip cluster: 7 archived tests, split
across two spots in the file (`test_move_line_aggregated_product_quantities*`
early, `test_delivery_slip_*` much later), both about the same
`stock.move.line._get_aggregated_product_quantities()` method (the
delivery-slip-printing grouping method) → 6 kept (initially; one later
dropped on review, see below), 1 merge. Read
all 7 in full, plus 2 more interspersed in the same territory that turned
out unrelated: `test_newly_added_move_line_is_picked_if_move_is_picked`
(different topic - flagged as belonging in `test_move_reservation.py`'s
edit-a-move-line territory, left deferred, now the 5th open/deferred test
- see §1) and `test_scrap_unlink_behavior_on_discard_with_and_without_context`
(already triaged/dropped in the scrap cluster).

Flagged before writing any code: `test_move_line_aggregated_product_quantities`
itself is a 185-line god-test (4 products, a 2-level backorder chain) -
proposed splitting its real lessons into 2 focused tests. User: "You can
add them in reporting. Try to merge the cancel move in another test. also
the splitted move and move_line could be merged" - placement in
`test_reporting.py`, fold `test_delivery_slip_aggregated_lines_with_canceled_move_and_packaging`
into another test instead of keeping it standalone, and merge
`test_move_line_aggregated_product_quantities_duplicate_stock_move` (two
moves, same product) with `test_delivery_slip_quantity_aggregation_across_move_lines`
(one move over-received, splits into two lines) into one test. Then:
"You can add a specific class by report" - gave this cluster its own
class, `TestDeliverySlipReport`, in `test_reporting.py` alongside the
still-empty `TestReporting`.

Two real-DB findings while writing the merged duplicate-moves/split-lines
test: (1) a plain `action_confirm()` silently merges two such similar
moves into one (same lesson as the chained-move cluster's "never hand-wire,
confirm with merge=False when testing distinct similar moves" rule,
re-encountered) - fixed with `_action_confirm(merge=False)`; (2) first
tried it as a delivery and over-delivering one move's `quantity` just grew
its existing line in place instead of splitting a second one - traced to
`_set_quantity_done_prepare_vals()`: it first tries to grow the existing
line from the *same* quant at that line's own location, and only creates
a new line if that's not possible; a receipt bypasses reservation entirely
so there's nothing to grow into, always falls through to a new line -
rewrote as a receipt, now understood rather than just copied from the
archive's own choice.

Final 6 tests in `TestDeliverySlipReport`: basic multi-product grouping
by product+description+UoM; undelivered quantities via backorder (kept)
or outright cancel (the folded-in lesson, simplified from the archive's
`action_split_transfer()`+packaging setup to a direct
`move._action_cancel()`, confirmed via `_get_aggregated_product_quantities()`'s
"empty move" tail to exercise the identical mechanism either way); the
merged duplicate-moves/split-lines test; package-scoped aggregation
(`strict=True`); the three-mode comparison for a partially-packed order
(default/`strict`/`except_package`); and packaging-UoM conversion math.

Final: `test_reporting.py` 192 lines/6 tests (`TestDeliverySlipReport`;
`TestReporting` itself still empty). Real DB run: `TestDeliverySlipReport`
alone 6/6, full `/stock` tag: 114/114 passing, 0 errors. Combined across
the six active bucket files: 100/100 passing, 0 errors, ~11,896
queries (runtime fluctuates with machine load - query count is the
stable figure).

On review, User asked to remove the cancelled-move half of
`test_aggregated_quantities_reflect_undelivered_quantities_via_backorder_or_cancel`:
"you can remove the cancel part since it's not possible anymore" -
dropped the cancel half entirely (not re-homed), the test and its name
shrank back to just the backorder lesson
(`test_aggregated_quantities_reflect_undelivered_quantities_via_backorder`).
Net effect on §1's counts: one archived test's disposition moved from
"folded in" to "dropped" - see §1's updated breakdown.

UoM conversion cluster: 5 archived tests named explicitly for UoM
(`test_move_compute_uom`, `test_change_move_line_uom`,
`test_decrease_move_quantity_with_move_line_in_different_uom`,
`test_move_line_qty_with_quant_in_different_uom`,
`test_set_quantity_done_with_rounding_issues`), plus one interspersed
test flagged as a different topic and deferred
(`test_move_line_compute_locations` - move-line location defaulting, not
UoM). User, same turn: "Keep the comments of test simple and don't add
context or specific behavior in it. Except if it makes really sens[e]" -
applied to all new/folded tests here, terser docstrings going forward
except for the rounding test (a genuine historical-bug regression guard,
where the "why" is load-bearing). Folded `test_move_compute_uom` (a
move's UoM follows a product change) into the existing
`test_new_move_demand_defaults_to_zero_and_survives_product_change`
rather than a near-duplicate test - switched to a product with a
genuinely different UoM (kg) so the recompute is actually proven, not
just coincidentally unchanged. Kept the other 4 as distinct mechanics,
switching the archive's `uom_dozen` (factor 12) to this refactor's
standard `uom_pack_6` (factor 6) and picking numbers that land on a
clean value (same rounding discipline as the scrap cluster).

Unrelated flaky test found and fixed along the way: a full-suite run
surfaced `test_edit_done_move_line_follows_lot_change_keeps_in_dates_correct`
(in-date cluster) failing intermittently - reran 3x isolated, failed
once. Root cause: one of its two `in_date` comparisons uses a live
`fields.Datetime.now()` capture (not backdated like the other), and
something in the lot-reassignment path re-stamps it close to, but not
always exactly, that capture when the two cross a second boundary -
exactly why the archive's own in-date tests used
`assertAlmostEqual(..., delta=timedelta(seconds=1))` instead of exact
equality for a live-captured value, a precedent not registered when this
was first ported. Fixed both occurrences of the pattern in the in-date
cluster's tests. Reran 2x after the fix, 0 failures.

Final: `test_move_reservation.py` 1,270 lines/61 tests (57 + 4,
`TestMoveReservation` 55 + `TestMoveReservationMultiStep`'s 6). Real DB
run, full `/stock` tag: 118/118 passing, 0 errors (twice, to confirm the
flake fix held). Combined across the six active bucket files: **104/104
passing, 0 errors, ~12,185 queries, ~13.3s**.

Forecast availability cluster: 2 archived tests named explicitly for the
field (`test_forecast_availability`, `test_inter_wh_and_forecast_availability`),
the first of several sub-clusters carved out of the remaining ~24
leftover singletons in `test_move.py` (proposed as groups A-H to User,
smallest/cleanest first). Both kept 1:1, renamed descriptively, appended
as a new `# ---- Forecast availability ----` section in
`TestMoveReservation` right after "Availability / reservation (cont'd)"
and before "Initial demand": `test_move_quantity_in_move_uom_forecast_in_product_uom`
(`move.quantity` is expressed in the move's own UoM, `forecast_availability`
stays in the product's base UoM - switched the archive's `uom_dozen` to
this refactor's `uom_pack_6`, adjusting the expected number accordingly)
and `test_forecast_availability_with_no_stock_between_warehouses`
(a move with no stock anywhere reports the real shortfall as `-1`).

Two follow-up requests from User, same turn: check `product.virtual_available`
too (both tests), and for the second test, "use the interwarehouse
location instead of doing a direct transfer" - the archive's own setup
(a freshly created second warehouse + a move straight to its
`lot_stock_id`) doesn't reflect how Odoo actually routes between
warehouses. Rewrote to move to `self.env.company.internal_transit_location_id`
(the real `'Inter-warehouse transit'` location every company gets) -
this also dropped the need for a second warehouse entirely, confirmed
via a real DB run that `product.virtual_available` already reads the
move as outgoing without one, since the transit location sits outside
the warehouse's own view location.

`test_move_reservation.py` now
1,302 lines, 63 tests (`TestMoveReservation` 57 + `TestMoveReservationMultiStep`'s
6). Real DB run, both classes: 57/57 (file tag), full `/stock` tag:
120/120 passing, 0 errors.

User-set-destination-location cluster (group B: `test_SML_location_selection`,
`test_receive_more_and_in_child_location`, `test_skip_putaway_if_dest_loc_set_by_user`
- 3 archived tests): found the same docstring-vs-code gap already caught
twice in the putaway cluster - `test_skip_putaway_if_dest_loc_set_by_user`'s
docstring claims putaway rules/storage categories are enabled, but the
test body never creates either. Proposed merging the first two (same
"destination survives" lesson, `onchange` vs. `_action_done()` triggers)
into one bare-move test, and keeping the third's two halves (destination
survives validation + receiving into a child location unblocks a
delivery waiting on the parent location) as one picking-level test with
the unsubstantiated putaway claim dropped from its name - User confirmed.
First pass built both; User then asked to drop the picking-level one
("doesn't bring that much value on top of the ones on stock.move"), then
asked to fold its "unblocks a waiting move" half into the move-level
test instead, by writing the move's own `location_dest_id` field. Before
doing that, checked the real mechanism: `location_dest_id`'s inverse
skips recomputing a line's destination when the move's new value is an
*ancestor* of the line's current one - a cleaner, more real version of
the "survives" lesson than a direct move-line write. Also checked
`_trigger_assign()` (the auto-reservation-retry mechanism) before
assuming it would fire for the "unblocks" half: it's only called from
`stock.picking._action_done()` for incoming/internal picking types,
never from a bare move's own `_action_done()` - confirmed empirically
with a throwaway probe test. Reported this back to User rather than
writing an assertion that would fail; User's call: call
`_action_assign()` explicitly on the waiting move instead of assuming an
automatic trigger. One more real-DB finding along the way: writing
`move.quantity = 3` (the move-level setter) on a receipt split into
**two** move lines instead of growing the existing one in place (the
same "receipt bypasses reservation, always creates a new line" fact
already found in the move-line-aggregation cluster) - fixed by writing
`move.move_line_ids.quantity = 3` directly instead.

Final: 3 archived tests → 1 new test
(`test_move_line_destination_location_survives_further_edits`), folding
in all three - the picking-level test, once drafted, wasn't kept as its
own entry. Two follow-up requests from User on this same test: check the
mirror-image direction too (default `stock_location` dest, write to
`child_location` - the line should follow, unlike the ancestor-write
case), then keep that as a *second*, separate move rather than walking
one move through both directions in sequence - so the test now has two
distinct moves, one proving "child → stock: line doesn't change", the
other "stock → child: line updates". `test_move_reservation.py` now
1,347 lines, 64 tests (`TestMoveReservation` 58 +
`TestMoveReservationMultiStep`'s 6). Real DB run, file tag: 58/58, full
`/stock` tag: **121/121 passing, 0 errors**.

show_* computed fields cluster (group C: `test_compute_show_info`,
`test_show_quant_create_lots_only` - 2 archived tests): read
`stock.move._compute_show_info()` before writing anything, since the
two archived tests each only exercise one combo of its formula. Merged
into `test_show_quant_and_lot_fields_depend_on_picking_type_lot_settings`
(new `# ---- Lot/quant display fields ----` section in
`TestMoveReservation`, right after "Basic in/out lifecycle") - 3 moves:
incoming+lot-tracked with both `use_create_lots`/`use_existing_lots`
True (archive's `_1`), outgoing+untracked with create-lots-only
(archive's `_2`'s untracked half), outgoing+lot-tracked with
create-lots-only (archive's `_2`'s tracked half, now also asserting
`show_lots_text`/`show_lots_m2o`, not just `show_quant` as the archive
did). Real-DB finding: writing `use_create_lots`/`use_existing_lots`
directly on `self.picking_type_in`/`_out` needs
`with_user(self.user_stock_manager)` - the class's default `stock_user`
can't write `stock.picking.type`. 2 archived → 1 new test, 0 drops.

Lot/serial editing on `stock.move.lot_ids` cluster (group D:
`test_move_sn_warning`, `test_serial_tracking`,
`test_internal_transfer_with_tracked_product`,
`test_autocomplete_sml_location_based_on_sm_lot_ids`,
`test_tracked_move_quantity_lot_ids_combined_write`,
`test_edit_serial_number_from_move`,
`test_modifying_lots_id_in_outgoing_picking` - 7 archived tests). First
real content for `test_lot_serial.py` (bucket "Serial/Lot tracking", was
an empty scaffold). Read all 7 in full, proposed a plan, confirmed with
User before writing code: kept `test_move_sn_warning` (duplicate-serial
warning dict at both move-line and move level, plus a
location-auto-correct-on-lot_id-assignment check - nothing else covers
any of this), kept `test_autocomplete_sml_location_based_on_sm_lot_ids`
(per-serial location/package guessing when setting `move.lot_ids` -
distinct), kept `test_tracked_move_quantity_lot_ids_combined_write` (a
genuine, well-written phantom-delivery regression guard - not
archive-numbered style, reads like a deliberate addition), dropped
`test_serial_tracking` and `test_internal_transfer_with_tracked_product`
(both just "basic tracked transfer works", already shown by
`test_receive_serial`/the mixed-tracking cluster), dropped
`test_edit_serial_number_from_move` (same lesson as the already-kept
`test_edit_reservation_follows_lot_change`, just via `move.lot_ids`
instead of `move_line.lot_id`). User's call on the one judgment call
(`test_modifying_lots_id_in_outgoing_picking`, zero-then-regrow
autopopulation): "merge the last one in" - folded into the
combined-write test rather than kept separate.

Final 3 tests in new `TestLotSerial(TestStockCommon)` content:
- `test_duplicate_serial_number_warns_and_auto_corrects_location`
  (renamed from `test_move_sn_warning`): ported close to 1:1, using a
  locally-created `pack_location` (`self._create_location('Pack')`) in
  place of the archive's `self.pack_location` fixture (never existed in
  the new `common.py`).
- `test_setting_move_lot_ids_guesses_each_lines_location_and_package`
  (renamed from `test_autocomplete_sml_location_based_on_sm_lot_ids`).
  Real-DB finding: first attempt used a second
  `self._create_location('Other')` for the "wrong location" serial and
  failed - `_create_location` defaults its parent to
  `self.stock_location`, so that location was genuinely *inside* the
  move's own source hierarchy and got found normally instead of falling
  back (the archive's own `pack_location` fixture was presumably *not* a
  child of stock - a separate top-level branch). Fixed by using
  `self.scrap_location` instead (a different branch of the location tree
  entirely, already a `common.py` fixture) - genuinely unreachable from
  the move's source, correctly falls back to it.
- `test_tracked_move_quantity_and_lot_ids_combined_write` (merges
  `test_tracked_move_quantity_lot_ids_combined_write` +
  `test_modifying_lots_id_in_outgoing_picking`): same 6-lot setup as the
  combined-write test; after the phantom-delivery guard zeroes
  everything, regrows to demand 2 with 2 specific lots named explicitly
  (lines autopopulate to exactly those two - the
  `test_modifying_lots_id_in_outgoing_picking` angle), then grows once
  more to demand 3 with no `lot_ids` specified at all (a third line
  autopopulates from whatever's still available - didn't assert which
  specific lot, to avoid a fragile removal-order assumption, just the
  resulting count).

7 archived → 3 new tests (3 dropped, 1 merge pair). `test_lot_serial.py`
now 108 lines (first real content). Real DB run, file tag: 3/3 passing,
0 errors.

**Process change, same turn**: User: "Can you run the tests and the
upgrade of md files and html in a background task since I don't need to
check them and it slow the process" - the real-DB verification commands
now run with `run_in_background: true` rather than blocking the
foreground, and the tracking-doc updates (this file, `test_move.md`,
`dashboard.html`) are now handed to a background `fork` agent instead of
being written inline - applied starting with these two clusters.

Picking-level misc cluster (group E: `test_scheduled_date_after_backorder`,
`test_recompute_stock_reference`, `test_internal_picking_uses_shipping_policy_from_picking_type`,
`test_picking_deadline_excludes_cancelled_move`, `test_move_state_after_split`
- 5 archived tests, → `test_transfer_flow.py`). Read all 5 before
proposing anything. Dropped `test_recompute_stock_reference` (`reference`
is just a trivial pass-through of `picking.name` for the non-inventory
case - no real stock-specific logic) and
`test_internal_picking_uses_shipping_policy_from_picking_type`
(`move_type`'s default-from-picking-type is a one-line compute check
with no scenario; the already-kept Shipping Policy tests in the same
file deliberately set `move_type` rather than relying on this default).
User confirmed both drops. Kept 3 initially, ported into two new
sections in `TestTransferFlow`: `# ---- Scheduling & deadlines ----`
(`test_picking_scheduled_date_follows_earliest_move_backorder_inherits_the_rest`,
renamed from `test_scheduled_date_after_backorder` - a picking's
scheduled date is its earliest move's date, a backorder created from a
partial validation inherits the remaining move's own date instead; and
`test_picking_deadline_excludes_cancelled_move`, kept close to 1:1) and
`# ---- Splitting a transfer ----` (`test_move_state_after_split`, kept
close to 1:1, dropping the archive's own `productA.is_storable = True`
dance since `self.product` is already storable by default -
`action_split_transfer()` splits a partially-reserved move's unmet
demand off into a backorder, recomputing states on both sides - first
time this action is exercised anywhere in the new suite).

Real-DB finding on the scheduled-date test: setting a move's `date`
directly inside a nested `move_ids: [(0, 0, {...})]` creation command
silently gets lost - the move ends up with `date` = `fields.Datetime.now()`
regardless, even while still in `draft` (so it's not
`_action_confirm()`/`_autoconfirm_picking()` touching it - that helper's
own filter never matches a freshly-created, unreserved move). Isolated
via a throwaway probe test: a bare `stock.move.create({..., 'date': X})`
- standalone, or via an explicit `picking_id` FK pointing at an
*already-existing* picking - keeps the explicit date correctly; only
the nested-o2m-inside-`picking.create()` path loses it. Didn't fully
root-cause why inside the ORM (looks like a framework-level quirk, not
stock-specific - `stock.move.date` has no compute/inverse that could
explain it); fixed by building the picking via `_create_picking()`
without `date` in the per-move dicts, then **writing** each move's
`date` afterward instead - confirmed that always sticks. New lesson:
don't set a move's `date` inside a nested `move_ids` create command,
write it on the move after creation instead.

User, same turn, on `test_picking_deadline_excludes_cancelled_move`:
"You can delete test_picking_deadline_excludes_cancelled_move since we
can't have cancelled move in the picking anymore" - deleted outright,
no replacement (same spirit as the earlier move-line-aggregation
cluster's cancel-move drop). Final: 5 archived → 2 kept, 3 dropped, 0
merges. `test_transfer_flow.py` now 359 lines, 14 tests. Real DB run:
14/14 passing, 0 errors.

Likely-duplicates-vs.-existing-coverage cluster (group F:
`test_storage_category_restriction`, `test_correct_quantity_autofilled`
- 2 archived tests). Compared both directly against the tests they were
suspected of duplicating before writing anything.
`test_storage_category_restriction` confirmed as a straight duplicate of
the already-kept `test_putaway_storage_category_quantity_capacity_blocks_once_full`
(same lesson, and the kept test's per-move location assertions are
already more precise than the archived test's `total_qty <= capacity`
check) - dropped outright. `test_correct_quantity_autofilled` is only a
*partial* duplicate: its first half (creating one line via `quant_id`
auto-fills the move's full demand) duplicates the already-kept
`test_create_line_from_quant_in_different_uom`, but its second half
(creating a *second* line via `quant_id` after the first line's
quantity was shrunk - the second line auto-fills only the remaining
demand, not the full demand again) is genuinely new. User confirmed
re-deriving a narrower test for just that second half. Result:
`test_creating_a_second_line_from_quant_id_only_fills_remaining_demand`,
appended to `TestMoveReservation`'s UoM-conversion section right after
`test_create_line_from_quant_in_different_uom`, using a gram/kg product
instead of the archive's `uom_dozen`-era framing. Final: 2 archived → 1
new test, 1 dropped outright, 0 merges. `test_move_reservation.py` now
1,397 lines, 66 tests (`TestMoveReservation` 60 +
`TestMoveReservationMultiStep`'s 6). Real DB run, file tag: 60/60
passing, 0 errors.

Combined verification for both clusters together, full `/stock` tag:
**130/130 stock tests passing, 0 errors, ~13,587 queries** (runtime
fluctuates with machine load).

Free_reservation tie-break cluster (group G: `test_free_reservation` - 1
archived test). First port
(`test_free_reservation_unreserves_the_latest_move_when_tied`, bare-move
level in `test_move_reservation.py`'s Unreserve section, close to 1:1
from the archive including `freeze_time` to force two same-date moves)
was verified passing, but User judged it "an edge case" and asked for
something more interesting: "it would be more interesting to check that
the picking with last scheduled date is unreserved... adapt the test in
transfer flow instead." Deleted that first version outright (and its
now-unused `freezegun`/`Datetime` imports) and read the real mechanism
before writing the replacement: `stock.move.line._get_outdated_candidate_sort_key()`
sorts unreservation candidates by "same picking as the triggering line
first, then latest `scheduled_date` first" - so the *primary* rule (not
just a same-date tiebreaker) is "the picking scheduled furthest in the
future gives up its reservation first." New test,
`test_scrap_unreserves_the_picking_scheduled_furthest_in_the_future`, in
`test_transfer_flow.py`'s new `# ---- Reservation priority across
pickings ----` section: two deliveries for the same product with
different scheduled dates (2 vs. 5 days out), both fully reserved;
scrapping enough to make stock insufficient for both leaves the
earlier-scheduled delivery untouched and partially unreserves the later
one.

Two real-DB findings while writing it: (1) confirmed via a throwaway
probe that `_free_reservation` only triggers from inside
`_action_done()`'s own move-line-validation loop (when consuming stock
makes a location's available quantity go negative) - not from any
direct quant-quantity write - so the scrap has to be validated, which it
already was; (2) the reservation WAS correctly stolen from the later
delivery, but asserting on the picking's own `state` read as
`'assigned'` regardless, because a single `partially_available` move
reads as its picking's own `'assigned'` under the default
`move_type='direct'` (ASAP) policy - the same fact already documented
from the initial-demand cluster earlier in this refactor. Fixed by
asserting on `late_delivery.move_ids.state` directly instead.

Final: 1 archived → 1 new test (re-derived from scratch after the first
attempt was rejected and deleted - not a "kept 1:1" entry).
`test_transfer_flow.py` now 383 lines, 15 tests.

Multicompany orderpoint cluster (group H:
`test_multicompany_orderpoint_horizon_and_deadline` - 1 archived test,
the very last one in `test_move.py`). Originally flagged to defer (real
replenishment/multicompany scope, would open an entirely unexplored
`test_multicompany.py` bucket). Asked User whether to tackle it now or
leave it deferred - the answer redirected the placement entirely: "Put
it in transferflow in a new class for multi company. Don't create a new
company but use ones from test data in base." New class,
`TestTransferFlowMultiCompany(TestStockCommon)`, appended to
`test_transfer_flow.py` (not `test_multicompany.py` - that bucket stays
an empty scaffold). Used `base.test_company_template2` (a pre-made,
independent, non-branch test company `base` ships for exactly this
purpose) instead of `res.company.create()`.

Real investigation needed (all via throwaway probes): (1) `env.companies`/
`env.company` validate `allowed_company_ids` against a fresh DB search
on `res.company.user_ids` (`res_users.py`'s `_get_company_ids()`, not a
cached field) - granting the second company needs an actual
`company_ids` write on the user record; (2) the real blocker -
`BaseCommon._callSetUp()` only rebinds `self.env` to `self._test_user`
**per test method**; during `setUpClass` itself, `cls.env.user` is still
the admin/superuser test account. The first attempt granted `company_b`
to `cls.env.user` inside `setUpClass`, silently granting it to the wrong
record - the restricted user the test method actually runs as
(`cls._test_user`) never got it, reproducing the exact same
`AccessError: Access to unauthorized or invalid companies` from inside
the test method despite the grant appearing to work moments earlier.
Fixed by targeting `cls._test_user` explicitly (not `cls.env.user`) in
`setUpClass`. **Lesson for any future multi-company test in this
refactor**: grant `company_ids` to `cls._test_user` specifically, never
`cls.env.user`, when doing it from `setUpClass`.

New test,
`test_orderpoint_replenishment_deadline_and_horizon_follow_its_own_company`:
one orderpoint (company fixed to `base.test_company`, never changed) is
replenished once "as" `company_b` (horizon 30) and once "as"
`self.env.company` (horizon 365) via `with_company()` - both times, the
resulting receipt's deadline and the replenishment info's displayed
horizon days follow the orderpoint's own fixed company, never whichever
company was merely "active" when triggering the replenishment. A genuine
multi-company isolation guard, not a tautology - if the bug this guards
against existed, acting "as" `company_b` would leak its horizon (30)
into the displayed text instead of the orderpoint's own (365).

Final: 1 archived → 1 new test, 0 drops, 0 merges. `test_transfer_flow.py`
now 422 lines, 16 tests across 2 classes (`TestTransferFlow` 15 +
`TestTransferFlowMultiCompany`'s 1).

**This closes out `test_move.py`'s entire triage.** Combined verification
for everything in this session, full `/stock` tag: **134/134 stock tests
passing, 0 errors, ~14,276 queries** (runtime fluctuates with machine
load) - the final combined figure across all seven active-content bucket
files (`test_move_reservation.py`, `test_warehouse_routing.py`,
`test_transfer_flow.py`, `test_scrap.py`, `test_packaging.py`,
`test_reporting.py`, `test_lot_serial.py`).

**Update: all 6 originally-deferred test methods from `archive/test_move.py`
are now resolved, none left undecided.** `test_out_3`, `test_past_quantity`,
and `test_product_tree_views` confirmed redundant/defensive and dropped;
`test_past_availability_in_strict_mode` kept/renamed as
`test_availability_at_date`; `test_move_line_compute_locations` kept and
ported as `test_move_line_location_defaults_from_its_move_or_its_picking`;
`test_newly_added_move_line_is_picked_if_move_is_picked` folded into the
existing `test_creating_a_second_line_from_quant_id_fills_remaining_demand_and_inherits_picked`
(see §1 for all of these). **`archive/test_move.py`'s triage is fully
complete.**

**Follow-up tidy-up, after the above closed out**: User: "Can you move
the last company test in test_warehouse_routing and delete
test_multicompany file." Moved `TestTransferFlowMultiCompany` out of
`test_transfer_flow.py` entirely into `test_warehouse_routing.py`,
renamed `TestWarehouseRoutingMultiCompany` - placed right after the
(still test-less) `TestWarehouseRouting` class, since that class's own
docstring already names "replenishment (reordering rules, the replenish
wizard)" as its territory, a better fit for an orderpoint test than
picking-level `test_transfer_flow.py`. Its `Command`/`json.loads`
imports moved along with it. Deleted the now-pointless empty
`test_multicompany.py` scaffold outright and dropped its import from
`tests/__init__.py`. No triage disposition changed - same 1 archived →
1 new test, just relocated. Real DB run: the four affected classes
together 29/29 passing, 0 errors; full `/stock` tag re-run after:
**134/134 passing, 0 errors, ~14,284 queries** - same total as before
the move, confirming nothing broke.

**Follow-up tidy-up #2**: User: "I think it would be great to rename
test_move_reservation by something else since it tests the whole move
ecosystem" - correct, the file's scope had long outgrown "reservation"
specifically. Asked User for a name rather than guessing; picked
`test_move.py`, matching the archived source file it supersedes (fully
triaged) and the bucket's own name ("Moves & reservation"). Renamed via
plain filesystem move (it was still untracked in git), updated
`tests/__init__.py`'s import and the committed `stock_tests.md`'s
file-listing line to match. While checking the rename, found and
deleted a genuinely stray leftover: `test_probe_trigger_assign.py`, a
throwaway probe from a much earlier cluster's investigation, believed
deleted at the time but apparently wasn't (never registered in
`tests/__init__.py`, so it never ran - just dead clutter). Real DB run,
full `/stock` tag: **135/135 passing, 0 errors** - identical count to
before the rename.

**Follow-up**: User asked to also rename the two class names inside
`test_move.py` ("tests the whole move ecosystem" now, not just
reservation) - `TestMoveReservation` → `TestStockMove`,
`TestMoveReservationMultiStep` → `TestStockMoveMultiStep` (User:
"Use TestStockMove to avoid collision" after a first suggestion of the
plainer `TestMove`). Updated the one other file referencing them,
`stock_tests.md`. Real DB run, full `/stock` tag: 135/135, identical
count again.

**`archive/test_move2.py` triage: COMPLETE** (3,957 lines, ~90 test
methods across 6 classes - `TestPickShip`, `TestSinglePicking`,
`TestStockUOM`, `TestRoutes`, `TestAutoAssign`, `TestPickShipBackorder`).
Unlike every prior archived file, this one was triaged **solo** rather
than cluster-by-cluster with User, per explicit instruction ("do
test_move2 by yourself using all the context I gave you"). Outcome: 37
archived tests kept/ported (2 pairs merged into a single host each, so
39 archived tests landed as those 37 new test methods) as 37 new tests,
48 dropped (the large majority - `TestPickShip`'s
hand-wired `create_pick_ship`/`create_pick_pack_ship` factory alone
accounted for about a third of the drops, see `test_move2.md` and
`SKILL.md`'s own notes on why), 0 left open. No new bucket file was
needed - everything landed in the existing structure: `test_move.py`
(`TestStockMove` 62→67, `TestStockMoveMultiStep` 6→11),
`test_transfer_flow.py` (15→32 - the single biggest growth, three new
sections: Merging moves, Returns, Picking/move description, plus a
Default-locations-from-operation-type/contact section),
`test_warehouse_routing.py` (14→21 - `TestWarehouseRouting` went from
fully empty to its first real content, 7 tests), and `test_lot_serial.py`
(3→6). Full per-test breakdown with reasoning: `test_move2.md`. Real DB:
full `/stock` tag **157/157 passing, 0 errors** after every fix was
applied (several real empirical corrections along the way - see
`SKILL.md`'s own entry for this pass, since those are process lessons,
not User-facing triage decisions). `archive/test_move2.py` itself has
been deleted (process point 3 - an archived file is removed once every
one of its tests is decided).

**Follow-up to the `test_move2.py` triage (`TestPickShip`'s MTO cluster):**
User pushed back on the dropped `test_mto_to_mts`/`_2`/`_3`,
`test_mto_moves_transfer`, `test_mto_cancel_move_line` group - the hand-wired
premises really were unreproducible (as recorded above), but the mechanic
they were reaching for (a sale-like need triggering a real MTO pull chain -
a receipt linked to a delivery) was still worth protecting, built the right
way this time: via `stock.rule.run()`, the way another module (e.g.
`sale_stock`) actually creates a need, not a hand-wired move. Added two
`common.py` helpers - `_create_procurement(product, location, quantity,
**values)` (wraps `stock.rule.Procurement` + `stock.rule.run()`, defaulting
`values['warehouse_id']` to `self.warehouse`, mirroring
`sale_order_line._create_procurements()`'s own call shape) and
`_sell(product, quantity, **values)` (alias defaulting the need's location
to `self.customer_location`) - and one new test,
`test_sale_need_on_mto_resupplied_product_pulls_a_linked_receipt`, in
`test_warehouse_routing.py`'s `TestWarehouseRouting`, right after the
existing resupply-replenishment test (same 2-warehouse fixture pattern): a
product on `route_warehouse0_mto` + a resupply-from-another-warehouse route,
`self._sell()` with no stock anywhere in the main warehouse pulls a real
3-move chain (the other warehouse's own delivery → this warehouse's receipt
→ the original delivery), validated end to end, finishing with the original
delivery genuinely `assigned`. This is new coverage *added after* the
triage, not a reversal of any "dropped" verdict above - see `SKILL.md`'s own
entry for the real-DB gotcha hit along the way (`route_warehouse0_mto` ships
`active=False`; reading `product.route_ids` back after writing an inactive
route onto it silently drops it). Real DB: full `/stock` tag **158/158
passing, 0 errors** (+1 from the 157 baseline above).

**Follow-up 2 (correction):** a first re-check of the dropped
`test_mto_to_mts`/`_2`/`_3`/`test_mto_moves_transfer`/`test_mto_cancel_move_line`
group against the knowledge above concluded "nothing to correct" - **wrong**,
corrected after User pointed at `archive/test_old_rules.py`: a third real
warehouse configuration exists beyond the two already covered - a "rigid
process" setup where *every* delivery step (not just the first) is rewritten
to a real pull rule, generating the whole chain upfront, fully linked. Under
that real configuration, 4 of the 5 originally-dropped tests reproduce
exactly as claimed (cancelling a step reverts the next to MTS; moving either
end of the link before validating does the same; a chained step reserves
only what its origin delivered, not other pre-existing stock at the same
location). Ported as a new class, `TestStockMoveMultiStepPull` in
`test_move.py` (sibling to `TestStockMoveMultiStep`), 5 tests total (the 4
revived plus one making the "whole chain created upfront" premise explicit
in its own right) - User's explicit call to use a dedicated class with its
own `setUpClass` rather than a reusable `common.py` helper called per test.
The 5th dropped test (`test_mto_cancel_move_line`) also reproduces but was
deliberately left unported - its lesson is a `_recompute_state()` nuance
orthogonal to this follow-up's pull-vs-push focus. See `test_move2.md`'s own
"Follow-up 2" section for the full account. Real DB: full `/stock` tag
**163/163 passing, 0 errors** (+5 from the 158 baseline above).

**Follow-up 3:** User noticed how many tests the `test_move2.py` triage
dropped (48) and asked to check whether any could be folded into an
existing test as an extra assertion instead of staying dropped outright -
same spirit as the 2 merges already done during the original pass. Went
through every dropped row looking for a genuinely-distinct residual lesson
with a cheap, non-disruptive host. Folded 2: `test_merge_moves_never_attributes`
(a real merge-key nuance - `never_product_template_attribute_value_ids` is
part of what makes two moves "the same" for merging, same as `product_id` -
too narrow for its own test, cheap as one more move on an existing one) into
`test_same_product_moves_in_a_picking_merge_on_confirm` (`test_transfer_flow.py`);
and `test_unreservation_on_qty_decrease` (a dup of
`test_reservation_updates_with_move_quantity`'s own "shrinking unreserves in
reverse removal-strategy order" claim - except that test, as written, only
ever *grew* `move.quantity`, never actually shrank it) into
`test_reservation_updates_with_move_quantity` itself (`test_move.py`),
reusing its existing 4-quant/lot/package fixture to shrink back down and
confirm the two *last*-reserved lines are released first. Considered and
rejected 2 more once checked against the candidate host's own ending
(`test_no_backorder_1`'s "cancel doesn't disturb the already-pushed ship"
would contradict `test_backorder_pick_without_reference_pushes_its_own_ship`'s
own ending rather than extend it; `test_mto_moves_return_extra`'s
"over-return merges back, capped at what was delivered" had no kept return
test with room for a second return step) - and one more,
`test_mtso_mto_adjust_01`, isn't a fold candidate at all in this sense: the
archived test only ever exercised the boring/default `mts_else_mto` branch,
so there's no existing assertion anywhere to extend, just a possible future
gap. See `test_move2.md`'s own "Follow-up 3" section for the full account.
No new test methods anywhere - `test_move.py` and `test_transfer_flow.py`
keep their exact same counts, only 2 existing tests grew by a few lines
each. Real DB: full `/stock` tag **163/163 passing, 0 errors** (unchanged
from Follow-up 2's baseline, as expected).

## 2. Metrics

### Before (original suite, structural — never executed; User's instruction
is to never run the archived tests, so these are read/grep-derived counts,
not measured runtime)

- `archive/test_move.py`: 7,131 lines, 1 class (`TestStockMove`), 170 test
  methods, no sub-grouping, numbered non-descriptive names
  (`test_availability_1..10`, `test_unreserve_1..6`, ...).
- Duplication found in the original coverage pass (whole-suite, not just
  `test_move.py`): ~450+ raw `stock.picking`/`stock.move` `.create()` calls
  each followed by a hand-typed confirm→assign→validate sequence;
  `TestStockCommon._create_move()` (the helper that already existed for this)
  was used **0 times** in the entire 31.7k-line original suite;
  `gather_relevant()` duplicated byte-for-byte between `test_move.py` and
  `test_quant.py`; ~200+ ad hoc `_update_available_quantity` calls with no
  wrapper.

### After (new structure, measured against a real local Postgres DB)

- `addons/stock/tests/common.py`: **390 lines** (+23, MTO follow-up;
  unchanged by Follow-up 2 - an earlier draft added a reusable
  `_make_delivery_fully_pull(warehouse)` helper here, but User asked for a
  dedicated test class with its own `setUpClass` instead, so it was added
  then removed again).
  Helpers: `_create_product`, `_check_inventory`, `_create_move`,
  `_validate_move`, `_in_move`/`_out_move`, `_create_picking`,
  `_validate_picking`, `_receipt`/`_deliver`, `_create_procurement`/`_sell`
  (new - a real `stock.rule.run()` need, not a hand-wired move; `_sell`
  defaults the need's location to `self.customer_location`),
  `_create_scrap`/`_scrap`, `_process_backorder_wizard`, `_create_warehouse`,
  `_create_location`, `_create_orderpoint`. No `sudo()` anywhere —
  `with_user(self.user_stock_manager)` covers every elevated-rights case.
- `addons/stock/tests/test_move.py` (renamed from `test_move_reservation.py`):
  **Update (Follow-up 2): ~1,750 lines, 83 tests total across 3 classes** -
  added `TestStockMoveMultiStepPull` (5 tests - see `test_move2.md`'s
  "Follow-up 2"), sibling to `TestStockMoveMultiStep` but with every
  delivery step rewritten to a real pull rule instead of the default
  first-pull-rest-push config. The rest of this paragraph describes the
  pre-Follow-up-2 state (test_move2.py pass): **1,647 lines, 78 tests
  total** (`TestStockMove` 62→67, `TestStockMoveMultiStep` 6→11 - new sections
  "Editing a done pick updates its ship" and "Reception chaining &
  merge", plus one more test each in "Availability / reservation",
  "Basic in/out lifecycle", and "Backorder push: merge vs. separate
  ship" - see `test_move2.md`). The rest of this paragraph describes the
  pre-test_move2.py state (1,415 lines, 68 tests), covering what used to be split across `test_in_1..3`/
  `test_out_1..3`, `test_availability_1..10`, `test_unreserve_1..6`,
  `test_use_reserved_move_line_1..2`/`test_use_unreserved_move_line_1..4`,
  `test_edit_reserved_move_line_1..9`, `test_link_assign_1..10`,
  `test_mixed_tracking_reservation_1..9`, `test_multi_step_update`,
  `test_edit_done_move_line_1..14`, (3 of 4 - see §1) of
  `test_set_quantity_1`/`test_initial_demand_1..4`/`test_edit_initial_demand_1..2`,
  `test_in_date_1..3`, the UoM-conversion cluster (`test_move_compute_uom`
  folded in, plus 5 more standalone - see §1, including the group F
  remainder-aware line-split test),
  `test_forecast_availability`/`test_inter_wh_and_forecast_availability`,
  `test_SML_location_selection`/`test_receive_more_and_in_child_location`/
  `test_skip_putaway_if_dest_loc_set_by_user` (all 3 folded into 1 test),
  and `test_compute_show_info`/`test_show_quant_create_lots_only` (both
  folded into 1 test), `test_past_availability_in_strict_mode`
  (renamed `test_availability_at_date`, moved here from a brief stop in
  `test_reporting.py` - see §1's follow-up note; `test_past_quantity`,
  its paired archived test, was dropped as redundant), and
  `test_move_line_compute_locations` (kept close to 1:1, see §1's
  follow-up note).
  - `TestStockMove`: 62→**67** tests, `stock.move`/`stock.move.line`-level
    mechanics without a full picking flow.
  - `TestStockMoveMultiStep`: 6→**11** tests, a real 2-step (`pick_ship` +
    `two_steps` reception) warehouse configuration, reservation chained
    across pick → ship via Odoo's own push rule (no hand-wired
    `move_orig_ids`/`move_dest_ids`).
  - `TestStockMoveMultiStepPull` (**new, Follow-up 2**): **5** tests, same
    pick → ship chain but with every delivery step rewritten to a real
    pull rule instead of the default (first step pull, rest push) - the
    "rigid process" setup from `archive/test_old_rules.py`, generating the
    whole chain upfront, fully linked, rather than the next step appearing
    lazily once the one before it is done.
  - **Follow-up 3**: still 83 tests, no new methods - `TestStockMove`'s
    `test_reservation_updates_with_move_quantity` grew one more step
    (shrink back down after growing, see `test_move2.md`'s "Follow-up 3").
- `addons/stock/tests/test_warehouse_routing.py`: **Update
  (test_move2.py pass + MTO follow-up): 624 lines, 22 tests across 3
  classes** (`TestWarehouseRouting` went from empty to 8 tests - its first
  real content, covering reservation-method/scheduler timing, push rules,
  and replenishment incl. the MTO-pull-chain follow-up test; see
  `test_move2.md`). Below reflects the pre-test_move2.py state (396
  lines, 14 tests across 2 classes), covering `test_putaway_1..9`,
  `test_putaway_with_storage_category_1..9`,
  `test_putaway_rule_with_last_used_sublocation` (see §1;
  `test_putaway_rules_smart_button` and `test_putaway_with_packaging` were
  dropped), and now the multicompany orderpoint test
  (`test_orderpoint_replenishment_deadline_and_horizon_follow_its_own_company`,
  from `test_multicompany_orderpoint_horizon_and_deadline` - originally
  ported into `test_transfer_flow.py`, moved here afterward - see the
  "follow-up tidy-up" note above).
  - `TestWarehouseRoutingMultiCompany`: 1 test, a second pre-made test
    company (`base.test_company_template2`) rather than a newly created
    one.
  - `TestPutaway`: 13 tests.
  - `TestWarehouseRouting`: 0→7→**8** tests (replenishment incl. the MTO
    pull-chain follow-up, push rules, reservation-method/scheduler timing
    - see `test_move2.md`).
  Real DB run: **14/14 passing, 0 errors** (pre-test_move2.py state).
- `addons/stock/tests/test_transfer_flow.py`: **Update (test_move2.py
  pass): 748 lines, 32 tests** (`TestTransferFlow`) - four new sections
  (Merging moves, Returns, Picking/move description, Default locations
  from operation type/contact), plus 3 more tests folded into the
  existing Immediate-validate section - see `test_move2.md`.
  **Follow-up 3**: still 32 tests, no new methods -
  `test_same_product_moves_in_a_picking_merge_on_confirm` grew a 4th move
  (a no-variant attribute value that doesn't merge either - see
  `test_move2.md`'s "Follow-up 3"). The rest
  of this paragraph describes the pre-test_move2.py state (381 lines, 15
  tests), covering `test_immediate_validate_1..10`,
  `test_validate_picking_without_picked_reservations`, (the relocated
  4th test - see §1) `test_initial_demand_3`/`_4`,
  `test_edit_done_picking_1` from the archive (see §1; `_5`+`_9` merged
  into one, `test_validate_picking_without_picked_reservations` dropped),
  the picking-level-misc cluster (`test_scheduled_date_after_backorder`,
  `test_picking_deadline_excludes_cancelled_move` - later deleted, see
  §1 - and `test_move_state_after_split`; `test_recompute_stock_reference`/
  `test_internal_picking_uses_shipping_policy_from_picking_type` dropped),
  and the re-derived free_reservation tie-break test
  (`test_scrap_unreserves_the_picking_scheduled_furthest_in_the_future`,
  from `test_free_reservation` - see §1). Real DB run: **15/15 passing,
  0 errors**.
- `addons/stock/tests/test_scrap.py`: 170 lines, 9 tests (`TestScrap`),
  covering `test_scrap_1..12` (+
  `test_scrap_unlink_behavior_on_discard_with_and_without_context`) from
  the archive (see §1; `_8` dropped at cluster time, then 2 more tests
  dropped and 1 pair merged on further review - see §1). A new file within
  bucket 2's territory - see §1. Real DB run: **9/9 passing, 0 errors**.
- `addons/stock/tests/test_packaging.py`: 92 lines, 3 tests
  (`TestPackaging`), covering `test_put_in_pack_1..3` from the archive
  (see §1). First real content in this bucket file. Real DB run:
  **3/3 passing, 0 errors**.
- `addons/stock/tests/test_reporting.py`: 192 lines, 6 tests
  (`TestDeliverySlipReport`; `TestReporting` itself still empty),
  covering `test_move_line_aggregated_product_quantities*` and
  `test_delivery_slip_*` from the archive (see §1; the 185-line
  `test_move_line_aggregated_product_quantities` split into 2 focused
  tests, 2 merge pairs). First real content in this bucket file. Real DB
  run: **6/6 passing, 0 errors**.
- `addons/stock/tests/test_lot_serial.py`: **Update (test_move2.py
  pass): 195 lines, 6 tests** (`TestLotSerial`) - added a lot-creation-
  restriction test and two `lot_ids`-onchange tests (see `test_move2.md`
  for why these ended up as direct ORM writes, not `Form`). The rest of
  this paragraph describes the pre-test_move2.py state (108 lines, 3
  tests), covering `test_move_sn_warning`,
  `test_autocomplete_sml_location_based_on_sm_lot_ids`,
  `test_tracked_move_quantity_lot_ids_combined_write`, and
  `test_modifying_lots_id_in_outgoing_picking` from the archive (see §1;
  the last two merged into one test; `test_serial_tracking`,
  `test_internal_transfer_with_tracked_product`, and
  `test_edit_serial_number_from_move` dropped as duplicates). First real
  content in this bucket file. Real DB run: **3/3 passing, 0 errors**.
- Combined, all seven files together: **163 tests**, unchanged by
  Follow-up 3 (no new test methods, 2 existing ones extended - see §1),
  after Follow-up 2 (158 after the first MTO follow-up, +5 - test-count
  only; the full `/stock` tag, which also runs other not-yet-refactored
  stock test files, measured **163/163 passing, 0 errors** for this state
  too - see §1). Pre-test_move2.py
  state: 118 tests, full `/stock` tag 136/136. Every helper and
  every ported test has been verified against a real DB, not just
  lint/`ast.parse`-checked.
- Every new test uses the shared helpers (`_create_move`/`_validate_move`/
  `_in_move`/`_out_move`/`_receipt`/`_deliver`/`_check_inventory`) instead
  of hand-rolled `.create()` + manual lifecycle calls — the #1 duplication
  pattern flagged in the original pass (above) is gone from these files.

No "before" query/runtime number exists to compare against, by design — the
archived tests are reference-only and are never run (see `common.py`'s
replacement rather than the original file for why: `TestStockCommon` grew
real duplication-fixing helpers only once an actual ported test needed them).
The meaningful "before" comparison is structural (line count, duplication
instance counts, helper reuse), not a timing number.

## 3. Target feature-area buckets (9, settled at the bucket level)

Refined several times with User's feedback from an initial 16-bucket split
down to this. File names within each bucket are not final — only the bucket
grouping is settled.

1. **Transfer flow** (`stock.picking`-level: confirm/assign/validate,
   chaining pickings, returns/exchanges, picking-tour UI) —
   `test_stock_flow.py`, `test_stock_return_picking.py`, `test_immediate.py`,
   `test_picking_tours.py`, plus the MTO-chain/multi-picking parts of
   `test_move2.py`.
2. **Moves & reservation** (`stock.move`/`stock.move.line` mechanics —
   putaway, reservation, removal strategy, scrap, UoM conversion, editing a
   done move — without a full picking flow) — `test_move.py` (archived
   source file - triage done, see §1), `test_move_lines.py`, plus
   `test_quant.py`'s removal-strategy tests, plus
   the reservation/recheck-availability parts of `test_move2.py`.
3. **Packaging** — `test_packing.py`, `test_packing_neg.py`.
4. **Batch & wave picking** — `test_batch_picking.py`, `test_wave_picking.py`,
   `test_auto_waving.py`.
5. **Inventory adjustments** (quant CRUD/relocate, stock counts) —
   `test_inventory.py`, `test_quant_inventory_mode.py`, plus `test_quant.py`'s
   direct-CRUD/relocate tests.
6. **Serial/Lot tracking** — `test_stock_lot.py`, `test_generate_serial_numbers.py`.
7. **Warehouse config, routing & replenishment** — `test_warehouse.py`,
   `test_stock_location_search.py`, `test_proc_rule.py`, `test_old_rules.py`,
   `test_replenish.py`, `test_stock_order_point.py`.
8. **Reporting & dashboards** — `test_report.py`, `test_report_stock_quantity.py`,
   `test_report_tours.py`, `test_overview_graph.py`.
9. **Multi-company** — `test_multicompany.py`.

No standalone bucket for `test_robustness.py` or `test_product.py` — both
fold into whichever topic each individual test concerns, decided per-test
during triage.

## 4. Original coverage-pass findings still worth keeping in mind

For the 29 archived files not yet triaged — kept here since their own
per-file detail reports were removed once this became a progress doc rather
than a research dump (the analysis predates the new `common.py`/bucket
structure anyway, so it's directional, not a checklist):

- `test_old_rules.py` is **not** dead code — it deliberately re-tests MTO/
  MTSO/backorder/package scenarios against hand-rewired "old style" rule
  configs to guard backward compatibility. Keep it (rename for clarity), just
  de-duplicate its picking-creation boilerplate.
- `TestProcRuleLoad` in `test_proc_rule.py` is a single test with an
  unconditional `skipTest` — genuinely dead weight.
- Class name collision: `TestBatchPicking` is defined independently in both
  `test_batch_picking.py` and `test_wave_picking.py`.
- `test_report.py`'s `test_report_quantity_1..4` and all of
  `test_report_stock_quantity.py` test the exact same `report.stock.quantity`
  feature — merge candidate.
- `test_quant_inventory_mode.py` and `test_inventory.py` both test
  inventory-adjustment mechanics from separate, non-shared fixtures — looks
  like two eras of the same feature.
- Several archived files intentionally diverge from the old `TestStockCommon`
  for a reason that should be confirmed before assuming it's accidental
  duplication rather than deliberate (e.g. `TestProcRule` wanting the
  *default* demo warehouse).

## 5. Where to find triage detail

- `test_move.md` — test-by-test triage log for `archive/test_move.py`: every
  decided test, whether it was kept/renamed, merged, or dropped, and why.
- `test_move2.md` — same, for `archive/test_move2.py` (triaged solo, not
  cluster-by-cluster - see the note at the top of that file).
