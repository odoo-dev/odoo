# `archive/test_move.py` — triage log

Test-by-test record of what's been decided so far for `archive/test_move.py`
(170 original tests, 1 class `TestStockMove`). Updated as triage continues.
New tests land in `addons/stock/tests/test_move.py` (renamed from
`test_move_reservation.py` once its scope outgrew "reservation"
specifically) unless noted.

Legend: **kept** (ported, usually renamed/simplified) · **merged** (folded
into another kept test) · **dropped** (not ported) · **open** (not decided
yet).

## Cluster: basic in/out lifecycle

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_in_1` | kept | `test_receive` | Baseline: receive a storable product, full reservation, quant balance after. |
| `test_in_2` | kept | `test_receive_lot` | Same, lot-tracked product. |
| `test_in_3` | kept | `test_receive_serial` | Same, serial-tracked product (one move line per unit). |
| `test_out_1` | kept | `test_deliver` | Baseline: deliver a storable product. |
| `test_out_2` | kept | `test_deliver_non_storable` | Delivering a consumable touches no quant. |
| `test_out_3` | **dropped** | — | Despite its name, not really "basic" — it's about `move_type='one'` (all-at-once shipping policy) and how zeroing one move's demand affects picking/move state across a 3-move picking. Deferred initially, then confirmed redundant with the shipping-policy cluster's `test_increasing_demand_past_available_stock_ships_partial_asap`/`..._waits_all_at_once` (already show `picking.state` tracking `move_type` correctly when a move isn't fully ready) - User: "I think we already have a test for picking that check the state is correct back on picking type move_type, if yes drop it". Dropped, no port. |
| *(none — new)* | kept | `test_deliver_without_stock` | Not ported from any archived test — User asked directly ("do we have a test that forces an extra quantity for a delivery?", then "add a test that forces a delivery without any stock"). Forcing a delivery through with zero stock creates a negative quant at the source location, same as a receipt does at the supplier. |

## Cluster: availability / reservation

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_availability_1` | kept | `test_availability_enough_stock` | `availability` field, enough stock. |
| `test_availability_2` | kept | `test_availability_not_enough_stock` | `availability` field, not enough stock. |
| `test_availability_9` | kept | `test_reassign_receipt_grows_with_demand` | Receipt auto-reserves, including after demand grows. |
| `test_availability_5` | kept | `test_reassign_serial_creates_new_lines` | Re-running assign on a serial-tracked delivery adds new lines rather than bumping existing ones. |
| `test_availability_8` | kept | `test_reduce_demand_on_partial_reservation` | Reducing demand to match available stock makes a partial reservation complete. |
| `test_availability_4` | kept | `test_overpicking_unreserves_other_move` | Over-validating one move can steal another move's reservation. |
| `test_availability_3` | kept | `test_reservation_skips_negative_lot` | Reservation skips a negative-quant lot in favor of a positive one; now also asserts the *correct* lot got picked (User's follow-up). |
| `test_availability_6` | kept | `test_reservation_respects_uom_rounding` | Coarser-UoM move only reserves once stock rounds up to a whole unit of that UoM. Uses `uom_pack_6` (created in `common.py`), not `uom_dozen` (inactive by default) — User's steer. |
| `test_availability_7` | kept | `test_reservation_respects_uom_rounding_across_quants` | Same, but reserving across several quants/lots; also now asserts move-line count, UoM, and exact lot set (User's follow-up). |
| `test_availability_10` | kept | `test_reservation_updates_with_move_quantity` | Reservation ordering across several locations/lots/a package, recomputed as `move.quantity` changes. Direct 1:1 port, not a merge of anything. |
| `test_past_quantity` | **dropped** | — | Resolved in a later follow-up pass: its `to_date` check never actually produces a different result (always 0, nothing backdated) - its real content (live `qty_available` after a partial pick/UoM move) duplicates existing reservation/UoM tests. See the closing follow-up note below. |
| `test_past_availability_in_strict_mode` | **kept (renamed)** | `test_availability_at_date` | The genuine historical-lookup test of the pair (two moves backdated 5-7 days, checked at 3 past dates with 3 different results). Ported close to 1:1. See the closing follow-up note below. |
| `test_product_tree_views` | **dropped** | — | A defensive ACL smoke test (basic-permission user opening the product tree view via Form) — not stock-move/picking behavior, no sign it guards a historical bug. Same class of test already dropped elsewhere (putaway smart-button, scrap unlink-on-discard). Dropped, no port. |

## Cluster: unreserve

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_unreserve_1` | **merged** | `test_unreserve_restores_available_quantity` | Basic unreserve scenario. |
| `test_unreserve_3` | **merged** | `test_unreserve_restores_available_quantity` | Same scenario as `_1`, just with extra quant-level (`reserved_quantity`) detail checks — genuine duplicate, folded into one test covering both. |
| `test_unreserve_4` | kept | `test_unreserve_partial_reservation` | Unreserving a partially-available move frees back exactly what it had reserved. |
| `test_unreserve_2` | kept | `test_unreserve_packaged_quant` | Unreserve works when the reserved quant is in a package; now checks the specific package via `_check_inventory(..., package=package)` (User's follow-up). |
| `test_unreserve_5` | kept | `test_unreserve_across_multiple_quants` | Unreserving frees reservation across all quants involved, not just one. |
| `test_unreserve_6` | kept | `test_unreserve_with_negative_quant` | Unreserve correctly restores `reserved_quantity` on a negative+positive quant pair. |

## Cluster: use reserved/unreserved move line

All six of these are variations on "a move can steal stock already reserved
by another move" — the core mechanic is already covered by
`test_overpicking_unreserves_other_move` above. Pruned heavily: kept the one
genuinely distinct mechanic (manually injecting a move line via `write()`),
dropped the rest as redundant or non-illustrative.

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_use_reserved_move_line_1` | dropped | — | A 0-demand "force done" move stealing from the reserved pool — a narrow variation of the same steal mechanic, redundant with what's kept below. |
| `test_use_reserved_move_line_2` | dropped | — | Same mechanic again via a UoM-dozen conversion angle — redundant. |
| `test_use_unreserved_move_line_1` | kept | `test_validating_move_line_steals_other_moves_reservation` | The distinct mechanic worth keeping: manually creating a move line (via `write()`) on a move that couldn't reserve anything, then validating it, still steals another move's reservation. |
| `test_use_unreserved_move_line_2` | kept | `test_validating_move_line_steals_other_moves_lot_reservation` | Same mechanic, lot-tracked — the forced move line must carry the right lot. |
| `test_use_unreserved_move_line_3` | dropped | — | An internal regression guard for `_free_reservation` not double-processing move lines in a mixed assigned/forced state — not illustrative feature behavior, more a historical bug-fix guard. |
| `test_use_unreserved_move_line_4` | dropped | — | `picking.do_unreserve()` + reassign after zeroing one move's demand in a 2-product picking — overlaps with `test_reduce_demand_on_partial_reservation`/`test_overpicking_unreserves_other_move` already covered. |

## Cluster: edit a reserved move line

Four of the nine (`_1`-`_4`) are parallel variations of the exact same
mechanic across different fields (location/lot/package/owner) — kept the
location and lot variants, dropped package/owner as redundant repeats of the
same pattern. `_7`/`_8` cover the same lesson (assigning a lot after
reservation doesn't change quantity or go negative) at different complexity —
kept the simpler one (`_7`), dropped the more complex mixed-lines restatement
(`_8`).

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_edit_reserved_move_line_1` | kept | `test_edit_reservation_follows_location_change` | Editing a move line's location to another sub-location with stock re-targets the reservation there. |
| `test_edit_reserved_move_line_2` | kept | `test_edit_reservation_follows_lot_change` | Same mechanic, editing the lot instead. |
| `test_edit_reserved_move_line_3` | dropped | — | Same mechanic again via `package_id` — redundant with the location/lot variants kept above. |
| `test_edit_reserved_move_line_4` | dropped | — | Same mechanic again via `owner_id` — redundant. |
| `test_edit_reserved_move_line_5` | kept | `test_edit_reservation_follows_combined_lot_and_package_change` | Distinct: editing lot *and* package together, not just one field. |
| `test_edit_reserved_move_line_6` | kept | `test_edit_reservation_to_unavailable_location_goes_negative` | Distinct: editing to a location with *no* stock forces a negative quant instead of being blocked. |
| `test_edit_reserved_move_line_7` | kept | `test_edit_reservation_assigning_lot_afterwards_keeps_quantity` | A tracked product reserved before any lot is assigned; setting the lot afterwards doesn't change the reservation or go negative. |
| `test_edit_reserved_move_line_8` | dropped | — | Same lesson as `_7`, with a more complex two-move-line (mixed tracked/untracked) setup — redundant restatement, `_7` is the clearer standalone version. |
| `test_edit_reserved_move_line_9` | kept | `test_edit_reservation_quantity_has_no_maximum` | Distinct: manually writing more quantity than available on a move line is allowed, no cap enforced. |

## Cluster: reservation across chained moves (`link_assign`)

Original plan was to keep 6 of the 10 archived tests (`_1`, `_2`, `_3`, `_5`,
`_6`, `_10`), porting `move_orig_ids`/`move_dest_ids` chaining by hand onto
standalone `_create_move()` moves — the same low-level technique the
archived tests used. Implemented that way first; 4 of the 6 failed or
errored against a real DB (two assertion mismatches, two `MissingError`s,
the latter suspected to be `_action_confirm(merge=True)` silently merging
distinct-but-similar hand-built moves). **User redirected mid-implementation**:
don't hand-wire the chain, build a real 2-step (`pick_ship`) warehouse
config, create only the pick picking, and let Odoo's own push rule generate
the ship picking on validation — the way a real delivery actually chains.
Rebuilt from scratch on that approach in a new class,
`TestMoveReservationMultiStep(TestStockCommon)`, in the same file. All 4
tests below verified against a real DB; 0 hand-wired `move_orig_ids`/
`move_dest_ids` anywhere in the class.

Real push routing only produces 1:1 pick→ship chains — true fan-in/fan-out
via `move_orig_ids`/`move_dest_ids` (what `_3`/`_5`/`_6`/`_10` hand-wired)
doesn't have a direct equivalent. Re-derived the *intent* of each instead of
the literal mechanics, confirmed against actual push/backorder behavior
rather than assumed:

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_link_assign_1` | kept | `test_validating_pick_creates_and_reserves_ship` | Basic chain: validating the pick auto-creates and reserves the ship picking via the push rule. |
| `test_link_assign_2` | kept | `test_validating_pick_creates_and_reserves_ship_lot` | Same, lot-tracked — the lot carries through to the ship's reservation automatically. |
| `test_link_assign_3` | kept (re-derived) | `test_backorder_pick_without_reference_pushes_its_own_ship` + `test_backorder_pick_merges_into_existing_ship` | Re-derived the "2 sources → 1 destination" intent as a real backorder: a pick that can only partially deliver creates a backorder pick, and the backorder's push either creates its own separate ship picking, or merges into the first push's ship - **depending entirely on whether both picks share a `stock.reference`** (see below). Kept as two tests, one per behavior, rather than picking just one - User's request after reviewing the single-behavior version, to make both outcomes explicit instead of only showing one and leaving the other as an unstated assumption. |
| `test_link_assign_4` | dropped | — | Lot-tracked variant of `_3` — redundant with `_2` (lot propagation) + `_3`/`_6` (backorder chaining) combined. |
| `test_link_assign_5` | **dropped** | — | "1 source → 2 destinations" fan-out has no simple real-routing equivalent. Investigated two step reception + per-shelf orderpoints as a candidate real-flow fan-out (User's suggestion): traced `stock.warehouse.get_rules_dict()` and `stock.rule._get_stock_move_values()` and confirmed empirically that 2-step reception's second leg is a **push** rule targeting the generic `WH/Stock` location, not a per-destination pull - an orderpoint at a specific shelf never actually routes stock to that shelf through it, the receipt just lands at `WH/Input` regardless. Real fan-out would need custom pull rules per shelf or putaway rules - more complexity than warranted for this cluster. Dropped per User ("drop it for now"), not pursued further. |
| `test_link_assign_6` | kept (re-derived, merged with `_3`) | `test_backorder_pick_merges_into_existing_ship` | Same backorder-chain mechanic as `_3`'s re-derivation covers this one too (2-step receipt-backorder chaining, `waiting`→`assigned` transitions) — the "merges" variant is the one that actually demonstrates one combined delivery, matching `_6`'s original intent most closely. |
| `test_link_assign_7`/`_8`/`_9` | dropped | — | UoM-rounding + backorder + chaining combined with MTO wizard interactions — narrow combinations of mechanics already covered elsewhere (UoM rounding in the availability cluster, backorder chaining above). |
| `test_link_assign_10` | kept (re-derived) | `test_ship_reservation_reduced_by_prior_shortage` | Re-derived "partial availability from an unrelated prior delivery pre-occupying the intermediate location": force a ship through with no stock at the output location (negative quant there), then a pick that fully satisfies its own demand still only pushes a *partially_available* ship, since the output location's net quantity is reduced by the earlier negative quant. Renamed from the first, overly-literal name (`test_pushed_ship_accounts_for_prior_negative_quant_at_output`) per User's feedback that it was too complex to parse at a glance. |

**Real finding worth keeping in mind**: whether a backorder's push merges into
an already-existing ship picking, or creates a separate one, is **not**
determined by picking state (an `'assigned'` picking is eligible per
`stock.move._search_picking_for_assignation_domain()`) - it's determined
entirely by whether both picks share a `stock.reference` (`reference_ids` on
`stock.move`, normally populated by a sale order via `sale_stock`, or
manually in a plain-`stock` test). No reference → no merge, every push
creates its own picking, confirmed by reading
`stock.move._assign_picking()`/`_search_picking_for_assignation()` and
`stock.rule._push_prepare_move_copy_values()` and verifying both outcomes
empirically. Demonstrated by keeping both as separate tests rather than
picking one.

Real DB run (`TestMoveReservationMultiStep`, full class): **5/5 passing, 0
errors**. Combined with `TestMoveReservation`: **34/34 passing, 0 errors,
~3,783 queries, ~4.2s**.

## Cluster: mixed lot/serial tracking reservation

Reservation mechanics when tracked and untracked quants of the same product
coexist - lot/serial assignment during and after reservation, fallback
behavior, negative-quant avoidance when editing a reserved line's lot. Two
tests found misplaced in this archived cluster and deliberately deferred:
`_3`/`_4` both edit a move's lines *after* `_action_done()` - that's a
done-move edit, belongs in the upcoming `test_edit_done_move_line_1..14`
cluster, not here. `test_multi_step_update` (interspersed mid-cluster in the
archive) is unrelated to tracking entirely - a chained-move quantity
propagation scenario, ported into `TestMoveReservationMultiStep` instead
(see the "reservation across chained moves" cluster above).

`_5` and `_6` overlap (both: a move line's lot points at something with no
matching quant, validating still falls back to the untracked pool instead of
going negative) - merged into one test, keeping `_6`'s richer double-edit
angle and dropping `_5`'s narrower manual-move-line-creation variant.

`_7` was initially ported separately (quant-creation order reversed vs.
`_1`/`_2`), but User judged it a duplicate of
`test_reservation_spans_tracked_and_untracked_quants_serial` in substance -
dropped.

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_mixed_tracking_reservation_1` | kept | `test_reservation_spans_tracked_and_untracked_quants` | Tracked + untracked quants coexist for a lot-tracked product - reserving a demand spanning both creates one move line per quant group. |
| `test_mixed_tracking_reservation_2` | kept | `test_reservation_spans_tracked_and_untracked_quants_serial` | Serial-tracked version: 4 one-unit lines across 2 lots + 2 untracked; reassigning the untracked lines' lots to brand-new lots before validating still lands cleanly at 0. |
| `test_mixed_tracking_reservation_3` | **deferred** | — | Edits a move's lines after `_action_done()` - belongs in the `edit a done move line` cluster, not here. |
| `test_mixed_tracking_reservation_4` | **deferred** | — | Same reason as `_3` - post-done edit. |
| `test_mixed_tracking_reservation_5` | **merged** | `test_reservation_line_lot_reassigned_to_unavailable_lot_still_validates_clean` | Narrower variant of `_6`'s lesson (manual move-line creation vs. editing an auto-reserved line) - folded in. |
| `test_mixed_tracking_reservation_6` | kept (merged with `_5`) | `test_reservation_line_lot_reassigned_to_unavailable_lot_still_validates_clean` | Editing a reserved line's lot twice, to lots with no matching quant, still validates cleanly against the untracked quant it was actually reserved from. |
| `test_mixed_tracking_reservation_7` | **dropped** | — | Same shape as `_1`/`_2` with quant-creation order reversed - judged a duplicate of `test_reservation_spans_tracked_and_untracked_quants_serial`, not a genuine regression guard. |
| `test_multi_step_update` | kept (moved) | `test_receiving_more_than_demanded_updates_pushed_move_demand` | Not about tracking - moved to `TestMoveReservationMultiStep`. Receiving more than a receipt's own demand updates the downstream pushed move's demand to match what was actually delivered. |
| `test_mixed_tracking_reservation_8` | kept | `test_unreserve_after_reassigning_to_unavailable_lot` | Reassigning a reserved line's lot to one not in stock frees the original lot's quant immediately; unreserving afterwards correctly leaves the lot quant and the untracked quant available side by side, without error. |
| `test_mixed_tracking_reservation_9` | kept | `test_reservation_reassigned_lot_goes_negative_without_affecting_other_quants` | Reassigning a line's lot to one with no stock goes negative only for that lot - an unrelated large positive quant and an unrelated pre-existing negative quant are both left untouched. |

Real DB run: **5/5 new mixed-tracking tests + 1 multi-step test, all passing,
0 errors**. Combined (`TestMoveReservation` + `TestMoveReservationMultiStep`):
**40/40 passing, 0 errors, ~4,369 queries, ~4.86s**.

## Cluster: putaway

Putaway rule matching (by product/category, with precedence between them),
the `closest_location`/`last_used` sublocation strategies, storage-category
capacity limits (quantity, package count, weight) and `allow_new_product`
restrictions, and putaway applied on a *pushed* move (2-step reception's
Input → Stock leg) rather than the original receipt.

Unlike every other cluster so far, these new tests went into
`test_warehouse_routing.py` (`TestPutaway`), not `test_move_reservation.py` -
putaway is about *where* a receipt routes, not reservation mechanics, so it
fits the "warehouse config & routing" bucket better. Per User's instruction.

This cluster went through several rounds of simplification on User's review
after the initial port - see the "Why" column below for each. Final count:
**21 archived tests → 13 kept, 6 dropped, 2 merges** (4 archived tests
collapsed into 2 new tests).

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_putaway_1` | kept | `test_putaway_rule_without_product_or_category_routes_receipt` | A location-wide rule (no product/category filter) reroutes every receipt into its `location_in_id` to the configured sublocation. |
| `test_putaway_2` | **dropped** | — | Same observable outcome as `_1` via a product-scoped rule instead of an unscoped one - adds nothing `_3`/`_4` (precedence) don't already show. |
| `test_putaway_rules_smart_button` | **dropped** | — | Dropped per User - "super defensive", more protection than this cluster needs; its core assertion (the smart button lists only the rule that actually applies) folded into `test_putaway_rule_by_product_takes_precedence_over_category` instead of a standalone test, since that test already creates both an unscoped and a product-scoped rule. |
| `test_putaway_3` | kept (fixed) | `test_putaway_rule_by_product_takes_precedence_over_category` | **Same bug as `_5` below: the "category" rule never set `category_id`, it was unscoped.** Caught on a later similarity pass; fixed to genuinely set `category_id` with the product's own category matching it. A product-specific rule wins over a real category-wide one when both could match - also checks the "putaway rules" smart button lists both rules that genuinely apply (not just the product-specific one, now that the category one is real too). |
| `test_putaway_4` | kept (fixed) | `test_putaway_rule_by_product_falls_back_to_category_when_product_does_not_match` | **Same bug** - the "category-wide rule" was unscoped, never had `category_id` set. Fixed the same way. A product-specific rule for a different product doesn't match - falls back to a real category-wide rule. |
| `test_putaway_5` | kept (fixed) | `test_putaway_rule_by_category_matches_through_parent_category` | **The archive's own `_5` never sets a category anywhere despite its docstring claiming to - identical in substance to `_1`.** User flagged this (the port faithfully carried the bug over); rewritten to actually test a parent-category rule matching a product in a child category. |
| `test_putaway_6` | kept | `test_putaway_rule_by_more_specific_category_takes_precedence` | Of two category rules, the one on the product's own (more specific) category wins over a broader parent-category rule. |
| `test_putaway_7` + `test_putaway_9` | **merged** | `test_putaway_rule_applies_on_pushed_move` | User: the package-type/category-filtered versions of this lesson were "overreacted" - the actual point (putaway is evaluated on the *pushed* Input → Stock move, not the original receipt) needs neither a package nor several candidate shelves. Collapsed both into one minimal test with a plain product rule, which now also asserts the receipt's own line keeps the generic Input destination (a check neither archived test made). |
| `test_putaway_8` | **dropped** | — | Same push-leg lesson as `_7`/`_9`, redundant once those two were simplified into one minimal test. |
| `test_putaway_with_packaging` | **dropped** | — | Dropped per User - since a receipt's move auto-assigns regardless, the "applies at confirm" distinction this test was making didn't actually demonstrate anything useful. |
| `test_putaway_with_storage_category_1` + `test_putaway_with_storage_category_2` | **merged** | `test_putaway_storage_category_quantity_capacity_blocks_once_full` | User called the standalone `_1` port "super arbitrary" (it had an unused decoy sublocation + a pre-existing quant that played no role) and asked to simplify it down to "closest_location never picks the parent" - then added "except when everything is full". Rather than keep two near-identical tests, folded `_1`'s lesson (parent excluded from candidates even when it shares the exact storage category) directly into `_2`'s capacity test: the first receipt proves the child shelf is picked over the parent, the second (once capacity is full) proves the fallback to the generic destination isn't `closest_location` "picking" the parent - there's just no candidate left. |
| `test_putaway_with_storage_category_3` | kept | `test_putaway_storage_category_empty_only_blocks_once_occupied` | `allow_new_product='empty'` only lets the putaway apply while the sublocation is still empty. |
| `test_putaway_with_storage_category_4` | kept | `test_putaway_storage_category_same_product_only_blocks_different_product` | `allow_new_product='same'` blocks as soon as the sublocation already holds a different product. |
| `test_putaway_with_storage_category_5` | kept | `test_putaway_storage_category_routes_packaged_receipt` | A storage-category rule filtered by package type routes a packaged receipt once it's actually in that package - checked via the package's own location, not just the move line. |
| `test_putaway_with_storage_category_6` | kept | `test_putaway_storage_category_package_capacity_blocks_once_full` | A per-package-type capacity (distinct from the per-product quantity capacity) lets one package in, then blocks the next once full. |
| `test_putaway_with_storage_category_7` | **dropped** | — | Same `allow_new_product='empty'` lesson as `_3`, just via a package instead of a plain move line - no new mechanic. |
| `test_putaway_with_storage_category_8` | **dropped** | — | Same `allow_new_product='same'` lesson as `_4`, just via a package instead of a plain move line - no new mechanic. |
| `test_putaway_with_storage_category_9` | kept | `test_putaway_storage_category_max_weight_blocks_once_exceeded` | A max-weight capacity (a third capacity dimension, distinct from quantity and package-count) blocks once the received weight would exceed it. |
| `test_putaway_rule_with_last_used_sublocation` | kept | `test_putaway_rule_remembers_last_used_sublocation` | A `last_used` rule routes the first receipt to its generic destination; once manually overridden to a sublocation and done, the next receipt reuses that sublocation automatically. |

Two of the kept tests initially wrote `result_package_id` directly on the
move line and failed against a real DB (package ended up at the generic
location, not the storage-category sublocation): `location_dest_id`'s
putaway recompute on package assignment is wired through an `@api.onchange`
(`stock.move.line._onchange_putaway_location`), which a plain ORM field
write never triggers. Fixed by calling the real action instead,
`move_line_ids.action_put_in_pack(package_id=...)`, whose `_put_in_pack()`
explicitly recomputes `location_dest_id` via the putaway strategy before
writing `result_package_id` - the same path the "Put in Pack" button
triggers. Confirmed via real DB: this is why the 2-step-reception push-leg
test didn't need this fix - there, the putaway recompute happens on the
freshly-created pushed move's own line via an explicit
`_apply_putaway_strategy()` call in `stock.move`'s push-move creation, not
the onchange.

Real DB run: **13/13 new putaway tests passing, 0 errors**. Combined with
`test_move_reservation.py`'s `TestMoveReservation` +
`TestMoveReservationMultiStep`: **53/53 passing, 0 errors, ~5,734 queries,
~6.93s**.

## Cluster: edit a done move line

Editing a `stock.move.line` field *after* its move is `done` - same
mechanism as editing a reserved line (see "edit a reserved move line"
above), just applied post-validation: the quant resyncs immediately, no
blocking. Includes the two tests deferred from the mixed-tracking cluster
(`test_mixed_tracking_reservation_3`/`_4`), since both edit/add lines after
`_action_done()`.

Mirrors the naming/economy already established for the *reservation-time*
equivalent cluster (`test_edit_reservation_follows_location_change`,
`_lot_change`, `_combined_lot_and_package_change` - which never bothered
with a package-alone or owner-alone test either). Proposed the same
plan/economy before writing code; User confirmed. Final count: **16
archived → 11 kept, 4 dropped, 1 merge** (2 archived tests collapsed into 1
new test).

User later caught a further duplicate on review: `test_edit_done_move_line_to_unavailable_location_goes_negative`
(`_6`) turned out to be nearly byte-identical to
`test_edit_reservation_to_unavailable_location_goes_negative` (the
reservation-time equivalent above), differing only in whether the move is
validated before or after the location edit - and
`test_edit_done_move_line_follows_location_change` already proves the
done-line mechanism mirrors the reservation-time one. Same reasoning
already applied to `_3`/`_4`/`_12` - dropped.

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_edit_done_move_line_1` | kept | `test_edit_done_move_line_follows_location_change` | Editing a done line's location to another sub-location with stock immediately re-syncs the quants there. |
| `test_edit_done_move_line_2` | kept | `test_edit_done_move_line_follows_lot_change` | Same lesson, editing the lot instead. |
| `test_edit_done_move_line_3` | **dropped** | — | Package-alone edit - redundant once the combined lot+package test exists; the reservation-time cluster never tested package alone either. |
| `test_edit_done_move_line_4` | **dropped** | — | Owner-alone edit - same underlying mechanism as location/lot, no new code path; the reservation-time cluster never tested owner either. |
| `test_edit_done_move_line_5` + `test_edit_done_move_line_13` | **merged** | `test_edit_done_move_line_follows_combined_lot_and_package_change` | Both show a packed+tracked done line's lot/package being edited together - merged into the direct done-line analog of `test_edit_reservation_follows_combined_lot_and_package_change`. |
| `test_edit_done_move_line_6` | **dropped** | — | Nearly byte-identical to `test_edit_reservation_to_unavailable_location_goes_negative` - caught by User on review. Same mechanism, no new code path, once `test_edit_done_move_line_follows_location_change` already proves the done-line resync mirrors the reservation-time one. |
| `test_edit_done_move_line_7` | kept | `test_edit_done_move_line_location_steals_other_moves_reservation` | Editing a done line's source location to one another move has reserved steals that reservation - the other move re-reserves itself, including from the location just vacated. |
| `test_edit_done_move_line_8` | kept | `test_edit_done_move_line_quantity_increase_goes_negative` | Increasing a done line's quantity beyond what was actually in stock pushes the quant negative. |
| `test_edit_done_move_line_9` | kept | `test_edit_done_move_line_quantity_zeroed_restores_availability` | Zeroing a done line's quantity on an outgoing move restores the stock it had taken. |
| `test_edit_done_move_line_10` | kept (renamed) | `test_edit_done_incoming_move_line_quantity_zeroed_undoes_quant` | **Real-DB finding: the archived name/docstring claims the quant row is "removed" - it isn't.** The row persists at quantity 0 (the archive's own `gather_relevant` helper filtered zero-rows out for display, masking this); initially ported with a literal row-absence assertion and failed. Fixed to assert the available quantity directly (0, not negative) and renamed to drop the inaccurate "removes" claim. |
| `test_edit_done_move_line_11` | kept | `test_add_move_line_to_done_move_updates_quant` | Adding a brand new move line to an already-done move updates the quant immediately too. |
| `test_edit_done_move_line_12` | **dropped** | — | Redundant subset of `_14` - both scale a done line's quantity in a non-default UoM, but `_14` also covers editing the UoM itself and the move-level UoM-edit guard. |
| `test_edit_done_move_line_14` | kept | `test_edit_done_move_line_quantity_and_uom_scale_quant_correctly` | Editing a done line's quantity and UoM both scale the quant correctly; a move's own UoM can no longer be edited once done (`UserError`). |
| `test_mixed_tracking_reservation_3` | kept | `test_add_tracked_move_lines_to_done_move_assigns_new_lots` | Adding move lines with fresh serial numbers to an already-done move updates the quants immediately, landing exactly at 0. |
| `test_mixed_tracking_reservation_4` | kept | `test_edit_done_move_line_lot_to_unavailable_lot_consumes_untracked_quant` | Editing a done line's lot to one with no matching quant at all falls back to consuming the untracked quant instead of going negative under that lot. |

Real DB run: **11/11 new tests passing, 0 errors**. Combined with the rest
of `TestMoveReservation` + `TestMoveReservationMultiStep`: **51/51 passing,
0 errors, ~5,642 queries, ~6.21s**.

## Note: similarity pass across both new bucket files

Per User's request ("Can you do a pass on current test to find similarity"),
reviewed all 64 tests across `test_move_reservation.py` and
`test_warehouse_routing.py` for near-duplicates. Found and fixed one more
concrete bug of the same class already caught twice in the putaway cluster
(a test's rule claims to be "category-wide" but never actually sets
`category_id` - see putaway cluster above for the first instance, `_5`):
both `test_putaway_rule_by_product_takes_precedence_over_category` and
`test_putaway_rule_by_product_falls_back_to_category_when_product_does_not_match`
used a plain *unscoped* rule where their names/docstrings claimed a
"category-wide" one (the first even named its unused variable
`_rule_category`). Fixed both to genuinely set `category_id` (with the
product's own `categ_id` set to match) - this also meant the smart-button
assertion folded into the precedence test had to be corrected: with a real
category match, the smart button correctly lists *both* the category and
the product rule, not just the product one as before (when the "category"
rule was invisible to the smart button's domain for having no category at
all). Three more pairs were flagged as borderline/judgment calls and left
to User to decide (not yet acted on): `test_validating_move_line_steals_other_moves_reservation`
vs `_lot_reservation`; `test_edit_done_move_line_lot_to_unavailable_lot_consumes_untracked_quant`
(possible lot-equivalent of the location duplicate just removed); and
`test_reservation_line_lot_reassigned_to_unavailable_lot_still_validates_clean`
vs `test_edit_reservation_assigning_lot_afterwards_keeps_quantity`.

## Cluster: immediate validate

`stock.picking.button_validate()` behavior: when it processes directly vs.
opens the backorder wizard vs. raises a `UserError`, across full/partial/
unavailable availability, untracked/lot/serial tracking, single vs.
multi-move pickings, and batch-validating several pickings at once.

**Placement**: unlike every other cluster so far, these new tests went into
`test_transfer_flow.py` (`TestTransferFlow`), not `test_move_reservation.py`
- this is entirely `stock.picking`-level behavior (confirm/assign/validate,
wizards), matching bucket 1 "Transfer flow" in the bucket plan, not bucket
2 "Moves & reservation". Flagged to User before writing any code, same
reasoning as the putaway → `test_warehouse_routing.py` move; User confirmed.

Read all 11 archived tests in full before proposing a plan. Unlike the
putaway/edit-done-line clusters, this one reads as a deliberate coverage
matrix (full/partial/unavailable × untracked/lot/serial × single/multi-move
× wizard/error outcomes) - closer in spirit to "basic in/out lifecycle"
(`test_receive`/`_lot`/`_serial`, 3 kept variants of one concept) than to
the redundant quant-characteristic edits trimmed in earlier clusters.
Proposed keeping all 11 as close 1:1 ports, no merges/drops; User confirmed
initially - on a later review pass, User asked to merge `_5`+`_9` (same
"tracked receipt + picking-type lot requirement" setup, just checking the
error side vs. the success side separately) and drop
`test_validate_picking_without_picked_reservations` outright ("too specific
and duplicate"). Final count: **11 archived → 9 kept, 1 dropped, 1 merge**
(2 archived tests collapsed into 1 new test).

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_immediate_validate_1` | kept | `test_validate_fully_available_picking_processes_directly` | A fully-reserved move validates directly - no wizard, `button_validate()` returns `True`. |
| `test_immediate_validate_2` | kept (renamed) | `test_backorder_wizard_opens_on_partial_availability` | A partially-reserved move opens the backorder wizard; keeping it processes what was available and backorders the remainder. Renamed per User to match the `test_backorder_*` naming convention already used elsewhere (`TestMoveReservationMultiStep`'s backorder tests). |
| `test_immediate_validate_3` | kept | `test_validate_picking_with_mixed_availability_backorders_both_moves` | A picking with 2 moves (one partial, one totally unavailable) still opens one wizard for the whole picking - keeping it correctly splits the remainder of *both* moves into the backorder. |
| `test_immediate_validate_4` | kept | `test_validate_fully_available_lot_tracked_picking_processes_directly` | Same as `_1` but lot-tracked - the lot carries through to the move line untouched. |
| `test_immediate_validate_5` + `test_immediate_validate_9_tracked_move_with_0_quantity` | **merged** | `test_validate_tracked_receipt_requires_lots_unless_picking_type_waives_it` | Both set the same picking-type lot requirement up/down and validate a tracked receipt - `_5` showed the error side (serial, lots required), `_9` the success side (serial+lot together, lots not required). Merged per User into one test showing both sides of the same toggle. |
| `test_immediate_validate_6` | kept (clarified) | `test_validate_tracked_receipt_blocks_until_lot_assigned_then_backorders` | A mixed untracked+lot-tracked receipt blocks (`UserError`) until the tracked move actually has a lot - merely marking it picked isn't enough. **The archive's own test stops at asserting the final wizard pops; I initially over-extended it to assert `state == 'done'` and it failed against a real DB.** Traced the real cause in `_pre_action_done_hook()` (`stock_picking.py` ~1292-1311): the auto-pick-all-moves branch only fires when *no* move in the picking has been picked yet - since the lot move was explicitly picked first to get past the earlier error, the untracked move never gets auto-picked, so it's left for the backorder. Fixed the assertion to match (wizard pops, not processed further) and documented the real mechanism. |
| `test_immediate_validate_7` | kept (simplified) | `test_validate_unavailable_picking_raises_error` | An unavailable move raises a `UserError` - nothing to validate. Dropped the archive's unrelated scrap-creation step (an unused decoy, doesn't affect the delivery's own reservation state). |
| `test_immediate_validate_8` | kept | `test_validate_multiple_pickings_at_once` | Calling `button_validate()` on a recordset of several pickings validates all of them. |
| `test_immediate_validate_10_tracked_move_without_backorder` | kept | `test_validate_fully_reserved_tracked_transfer_skips_backorder_wizard` | A fully-reserved tracked transfer validates directly - the backorder wizard is for genuinely short quantities, not just because the product is tracked. |
| `test_validate_picking_without_picked_reservations` | **dropped** | — | Dropped per User as "too specific and duplicate" - the underlying "nothing to validate" `UserError` is already shown by `_7`, and the specific picked/unpicked interplay was a narrower variant that didn't earn its own test. |

User also asked to prefer the `_receipt`/`_deliver` helpers over manual
`_create_picking()` + `action_confirm()`/`action_assign()`/`button_validate()`
wherever a test doesn't need to inspect `button_validate()`'s return value or
interleave steps mid-flow - simplified `_5`, `_7`, and `_9`'s ports
accordingly (`_5`'s first half and `_7` wrap the helper call directly in
`assertRaises`, since an exception from inside `_receipt`/`_deliver`
propagates out exactly the same as a direct call would). The tests that
specifically assert `action is True`/inspect a wizard action, or interleave
manual `picked`/lot assignment between confirm and validate, correctly stay
on manual `_create_picking()` control - using the helper there would
silently swallow the exact behavior being tested. But since this cluster
uses receipt/delivery pickings "massively" (User's phrasing), rather than
keep falling back to raw `_create_picking()` for those tests too, User
asked to extend `_receipt`/`_deliver` in `common.py` itself with the same
`validate=True` flag `_in_move`/`_out_move` already have. Updated
`common.py`, then switched every remaining `_create_picking(self.picking_type_in/out,
...)` call in this file over to `_receipt(..., validate=False)`/
`_deliver(..., validate=False)` - the one exception, `_3` (an internal
transfer, `picking_type_int`), has no `_transfer`-equivalent helper, so it
still uses `_create_picking()` directly. General guidance from User for the
rest of this refactor: don't hesitate to extend `common.py` when a change
is generic and has broad impact - this doesn't contradict "grow `common.py`
demand-driven, not speculatively" (a real caller already existed, in
bulk), it just means readily generalizing a helper once several callers
want the same shape, not only adding a helper from scratch when a caller
needs it.

Real DB run: **9/9 new tests passing, 0 errors, ~1,229 queries, ~5.14s**
(this file alone). Combined with `test_move_reservation.py` and
`test_warehouse_routing.py`: **73/73 passing, 0 errors, ~8,283 queries,
~27.37s** (fluctuates with machine load; query count is the stable
figure).

## Cluster: scrap

`stock.move.is_scrap`/`action_scrap()`/`_action_scrap()` behavior: impact on
quants, interaction with reserved move lines and UoM-aware reservation, the
insufficient-quantity warning wizard, serial-number availability checks,
and a couple of "destination is the scrap location" scenarios that don't
even need the `is_scrap` flag at all.

13 archived tests (`test_scrap_1..12` + `test_scrap_unlink_behavior_on_discard_with_and_without_context`,
the last one interspersed much later in the archive file). Flagged one
placement/substance concern before writing code: `_8` doesn't use
`is_scrap`/`_action_scrap()` at all - it's 3 plain internal-transfer
pickings to the scrap location, testing multi-picking cancel/partial-validate
state resolution, squarely in the territory the immediate-validate cluster
already covers (its "destination is scrap" angle is already shown more
simply by `_10`/`_11`). User: drop it. Final count: **13 archived → 12
kept, 1 dropped, no merges**.

**Placement**: initially put into `test_move_reservation.py` (bucket 2
"Moves & reservation" explicitly lists "scrap" in its own description),
then moved to `test_transfer_flow.py` on User's review: several of these
tests are genuinely picking-level (scrap linked to a `stock.picking`,
validating a delivery after a scrap, a picking whose own destination is
the scrap location) rather than bare-move mechanics - "uses classical move
basis and are an upper layer" (User's phrasing). Then User went one step
further: "In fact you could move the scrap in their own test file" - moved
the whole cluster into a brand-new `test_scrap.py` (`TestScrap`), registered
in `tests/__init__.py` (alphabetical with the rest). Still a new *file*
within bucket 2's territory, not a new bucket at the §3 grouping level - the
bucket plan already notes file names within a bucket aren't final.
`common.py`'s `scrap_location`/`_create_scrap`/`_scrap` additions stay in
`common.py` regardless of which file uses them. On this same pass, User also
strengthened `test_scrap_during_reserved_delivery_still_lets_picking_validate`:
"check that 9 pieces were correctly validated" - added
`self.assertEqual(delivery.move_ids.quantity, 9)` and
`self._check_inventory(self.product, {self.customer_location: 9})` after
the picking validates, rather than just asserting `state == 'done'`.

Added `scrap_location` to `common.py` (`cls.env.company.scrap_location_id`
- computed per company, no `quick_ref` risk) and two new helpers,
`_create_scrap`/`_scrap` (mirroring `_create_move`/`_validate_move`:
`_create_scrap` builds an `is_scrap=True` move from `self.stock_location`
to `self.scrap_location` by default, `_scrap` also calls `_action_scrap()`
immediately) - justified per User's "don't be afraid to update common"
guidance, since nearly every test in this cluster creates a scrap move the
same way.

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_scrap_1` | kept | `test_scrap_reduces_quant` | Scrapping a storable product creates a done move to the scrap destination and removes it from the source location's quant. |
| `test_scrap_2` | kept | `test_scrap_consumable_routes_through_inventory_destination` | A consumable's scrap touches no quant (consumables aren't tracked to begin with) - but the scrap move's own destination is treated as an inventory-type location regardless of the chosen location's actual `usage`. |
| `test_scrap_3` | kept | `test_scrap_deletes_reserved_move_line` | Scrapping the product a move line had reserved deletes that line and reverts the move to `confirmed`. |
| `test_scrap_4` | kept (renamed) | `test_scrap_from_a_picking_adds_a_second_move` | **The archive's own docstring claims to "modify the done linked stock move" afterward - the test code never actually does that.** Renamed to describe what it actually demonstrates: a scrap linked to a picking adds a second move alongside the original, without touching it. |
| `test_scrap_5` | kept | `test_scrap_updates_uom_aware_reservation` | Scrapping some of a product reserved by a move in a coarser UoM recomputes that move's own UoM-converted reserved quantity. Picked quant/scrap numbers that avoid a rounding-direction ambiguity the original dozen-based numbers didn't have to deal with (pack-of-6 math landed exactly on a `x.5/6`-style boundary with the first numbers tried - see below). |
| `test_scrap_6` | kept | `test_scrap_more_than_available_triggers_insufficient_qty_warning` | Scrapping more than available opens the insufficient-quantity wizard; confirming anyway forces a negative quant, scaled for the scrap's own UoM. |
| `test_scrap_7_sn_warning` | kept | `test_scrap_serial_number_warns_if_unavailable_at_source` | Picking a serial number for a scrap warns if that serial isn't actually available at the scrap's own source location. |
| `test_scrap_8` | **dropped** | — | Doesn't use `is_scrap` at all - 3 plain internal-transfer pickings to the scrap location testing multi-picking cancel/partial-validate state resolution, already covered by the immediate-validate cluster + `_10`/`_11` below. |
| `test_scrap_9_with_delivery` | **merged** | into `test_scrap_from_a_picking_adds_a_second_move` | Originally ported as its own test; on further review User judged it mergeable with `_4`'s port (same picking_id-linking shape) - folded in, with the numbers switched to 9-delivered/1-scrapped and a validate-and-check-final-quantities tail appended. |
| `test_scrap_10` | **dropped (on further review)** | — | Kept initially as `test_scrap_destination_can_be_a_plain_delivery`; User: "useless now since the flag is on scrap move" - its premise (destination's location type drives scrap-ness) stopped being true once the refactor settled on `is_scrap` as the actual driver. |
| `test_scrap_11` | kept (renamed) | `test_scrap_move_back_to_stock_restores_quant_cleanly` | Moving a reserved quantity's source to the scrap location merges cleanly into the existing quant there - no garbage quant left behind. |
| `test_scrap_12_qty_in_sublocation` | kept | `test_scrap_insufficient_qty_in_sublocation_triggers_warning` | A product only available in a sublocation still triggers the insufficient-quantity warning when scrapping from the parent - scrap doesn't search sublocations the way reservation does. |
| `test_scrap_unlink_behavior_on_discard_with_and_without_context` | **dropped (on further review)** | — | Kept initially as `test_scrap_unlink_on_discard_depends_on_context`; User: "not a flow or a useful protection" - its `Form.from_action` discard-wizard mechanics tested an implementation detail, not a user-facing flow. |

Real-DB finding while writing `_5`'s port: the first numbers tried (4
available units, reserving in a pack-of-6 UoM) landed on `4/6 = 0.6667`,
which Odoo's own quantity rounding truncates to `0.66` - a real ambiguity
`assertAlmostEqual` at 2 decimal places can't absorb either way (the
archive's own version used dozens, where `4/12 = 0.3333` happens to round
the same way regardless of direction, masking this). Fixed by picking
numbers (`11` available, scrap `5`, landing exactly on `1.0`) that don't
hit that boundary, rather than loosening the assertion's precision (which
wouldn't have actually fixed the mismatch - the discrepancy was bigger than
one extra decimal place).

On a further review pass, three more trims (no change to the
archived-test's own disposition above beyond the rows just updated): tried
converting `test_scrap_serial_number_warns_if_unavailable_at_source` from a
direct `onchange()` call to a Form simulating the real
`stock.view_scrap_move_form` view, then reverted - Form only logs a
warning, it doesn't return it, so asserting the message text is cleaner via
`onchange()` directly when the warning's content is specifically what's
under test.

Real DB run: **9/9 new tests passing, 0 errors** (`TestScrap`, its own
file now, 170 lines - `test_transfer_flow.py` is back to 9
immediate-validate tests only). Combined with `test_move_reservation.py`
(51 tests) and `test_warehouse_routing.py` (13 tests): **82/82 passing, 0
errors**.

## Cluster: initial demand / quantity editing

Editing a move's `product_uom_qty` (the demand) - and, as a side
question, the unrelated `quantity` field (the reserved/picked amount) -
before the move is done. 6 archived tests, scattered around the scrap
cluster in the archive, same "interspersed" pattern as
`test_multi_step_update` earlier.

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_set_quantity_1` | **dropped** | — | Writes `move.quantity` directly on two bare confirmed, never-reserved moves and checks the write sticks - no real behavior shown. User asked to check first whether an existing test already covers quantity-across-sub-locations writes before dropping: `test_reservation_updates_with_move_quantity` (availability cluster) does, far more richly - confirmed redundant. |
| `test_initial_demand_1` | kept (renamed) | `test_new_move_demand_defaults_to_zero_and_survives_product_change` | A fresh draft move defaults `product_uom_qty` to 0; changing the product afterward doesn't reset a demand already set by hand. |
| `test_edit_initial_demand_1` | kept (renamed) | `test_increasing_reserved_demand_grows_the_move_line_in_place` | Growing an already-reserved receipt's demand reassigns automatically - the existing line grows in place. |
| `test_edit_initial_demand_2` | kept (renamed) | `test_decreasing_reserved_demand_shrinks_the_move_line_in_place` | Shrinking keeps it fully reserved - the existing line shrinks in place, no line dropped and recreated. |
| `test_initial_demand_3` | **merged** | into the `_4` port | Despite its name, edits `move.quantity`, not `product_uom_qty` - mislabeled, same class of bug already caught twice in the putaway cluster. User: "fold _3 in _4." |
| `test_initial_demand_4` | kept (renamed, `_3` merged in) | `test_increasing_demand_past_available_stock_needs_reassign` | Growing a delivery's demand past what's currently reserved drops to `partially_available` (unlike the unlimited-source receipt case) - needs a manual `action_assign()`; initially also carried the folded-in `_3` lesson (writing `quantity` directly leaves picking state untouched) as a trailing step - see below for what happened to it next. |

4 new tests, appended to `TestMoveReservation` (`test_move_reservation.py`)
right after `test_reservation_updates_with_move_quantity` (new "Initial
demand" section).

**Follow-up, same review pass**: User asked to relocate and redesign the
4th test ("Move `test_increasing_demand_past_available_stock_needs_reassign`
in picking flow and just check the delivery status base on picking type
(duplicate the test with all at once, or asap)"). Moved out of
`TestMoveReservation` into `TestTransferFlow` (`test_transfer_flow.py`,
new "Shipping policy" section) - it was already checking `delivery.state`,
the same "wrong bucket" lesson already applied to scrap and
putaway/immediate-validate. Split into two tests on `stock.picking.move_type`
("Shipping Policy": `direct` = As soon as possible, `one` = All at once):

| New test | What it shows |
|---|---|
| `test_increasing_demand_past_available_stock_ships_partial_asap` | Under "as soon as possible", a single `partially_available` move reads as the picking's own `assigned` - ready to ship what's there. |
| `test_increasing_demand_past_available_stock_waits_all_at_once` | Same move state, but under "all at once" the picking instead reads `confirmed` - not ready at all until everything can go together. |

Confirmed via `stock.picking._compute_state()` +
`stock.move._get_relevant_state_among_moves()` before writing assertions -
this is exactly what the archived `_4`'s unexplained `# actually, partially
available` comment was gesturing at without ever testing the alternative.
Dropped the `_3`-fold tail (`quantity` write leaving picking state
untouched) that this refocus superseded - flagging the removal rather than
silently dropping previously-verified coverage.

User's further follow-up, same turn: "Also try to increase and decrease
the move initial demand to check if the delivery state is updated" - added
a shrink-after-grow step to both tests. Verified empirically first:
shrinking below what's currently reserved unreserves the excess and drops
the move to `confirmed` under *either* policy (a delivery never
auto-reassigns itself on any demand edit, growing or shrinking - only a
receipt's `write()` does that), needing a manual `action_assign()` same as
the grow case. Both tests now: confirm/assign at demand 10 (fully
reserved) → grow to 12 (`partially_available`/`assigned` or `confirmed`
per policy) → reassign (`assigned`) → shrink to 6 (`confirmed` either way)
→ reassign (`assigned`, quantity 6).

Also caught and fixed in passing: the 4th test's `def` line had been
silently corrupted to `def c(self):` at some point between sessions (body/
docstring intact), surfaced via the harness's own "file changed on disk"
notice - moot once rewritten for the move, but flagged rather than
silently absorbed.

Final: `test_move_reservation.py` 1,097 lines/54 tests (the original 45 +
3 of the 4 new initial-demand tests + `TestMoveReservationMultiStep`'s 6);
`test_transfer_flow.py` 258 lines/11 tests (9 + 2 new). Real DB run, full
`/stock` tag: 97/97 passing, 0 errors. Combined across the four active
bucket files: 87/87 passing, 0 errors, ~9,648 queries, ~10.5s.

## Cluster: in-date / removal strategy

Does moving a tracked quant keep its incoming date (`in_date`), and does
the default removal strategy (FIFO, oldest first) + editing/adding move
lines on a done move keep both lots' in_dates straight. 3 archived tests,
right after the initial-demand cluster's territory in the archive.

Checked for overlap before writing anything: `test_edit_done_move_line_follows_lot_change`
(edit-done-move-line cluster) already covers the same *mechanism* as `_2`
(editing a done line's lot re-syncs quants), but never checks `in_date` -
confirmed `_2`'s unique value is specifically the in_date-preservation
angle, not a duplicate. No existing removal-strategy test anywhere in the
new structure yet, and no `pack_location` fixture in `common.py` - used a
local `self._create_location('Pack')` per test instead (one-off
destination, same judgment as `destination = self._create_location('Destination')`
used elsewhere in this file).

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_in_date_1` | kept (renamed) | `test_in_date_survives_internal_move` | Moving a tracked quant to another location keeps its incoming date - an internal transfer doesn't reset it. The simple baseline. |
| `test_in_date_2` | kept (renamed) | `test_edit_done_move_line_follows_lot_change_keeps_in_dates_correct` | FIFO (oldest incoming date first) is the default removal strategy, picks the older lot automatically with no lot specified; editing the resulting done line's lot afterward swaps the two quants cleanly, each keeping its own incoming date. |
| `test_in_date_3` | kept (renamed) | `test_adding_a_move_line_to_a_done_move_carries_its_in_date` | Creating a brand-new move line directly on an already-done move - not editing an existing one, a different code path - also carries the lot's own incoming date correctly. |

All 3 kept, no drops, no merges - each shows a genuinely distinct
mechanism, not a redundant variant. Appended as a new "In-date / removal
strategy" section in `TestMoveReservation`, right before "Mixed lot/serial
tracking reservation".

**Real-DB finding** (2 of 3 failed on first run): `stock.quant._gather(...,
strict=True)` with no `lot_id` passed doesn't mean "any lot" - its domain
(`_get_gather_domain`, `stock_quant.py` ~793-812) becomes `lot_id in
[False]` when `strict=True` and `lot_id` is falsy, which **excludes every
lot-tracked quant** and matches only the untracked pool. The existing
scrap-cluster precedent for this exact call shape
(`test_scrap_move_back_to_stock_restores_quant_cleanly`) only worked
because that product is untracked - copying the same shape for a
lot-tracked product silently returns an empty recordset instead of
raising, so `quant.in_date` read back `False` and tripped `assertTrue`
with a misleading-looking failure (not an obvious "wrong domain" error).
Fixed by always passing the actual `lot_id` to `_gather()` once a product
is lot/serial-tracked, captured via `move.move_line_ids.lot_id` right
after `_in_move(..., lot_names=[...])`. **Lesson for future tests**:
`_gather(product, location, strict=True)` with no `lot_id` is only safe
for an untracked product.

Also fixed in passing: `TestMoveReservation`'s class docstring still said
"putaway, reservation, removal strategy, scrap, UoM conversion, editing a
done move" - stale on two counts (putaway moved to
`test_warehouse_routing.py`, scrap to its own file, long before this
cluster) and now finally true on "removal strategy" since this cluster
actually added one. Rewritten to match current scope.

Final: `test_move_reservation.py` 1,185 lines/57 tests (54 + 3 -
`TestMoveReservation` 51 + `TestMoveReservationMultiStep`'s 6). Real DB
run, full `/stock` tag: 100/100 passing, 0 errors. Combined across the
four active bucket files: 90/90 passing, 0 errors, ~10,094 queries,
~13.3s.

## Cluster: editing a done picking / put in pack

5 archived tests, right after the in-date cluster's territory:
`test_change_product_type`, `test_edit_done_picking_1`,
`test_put_in_pack_1..3`. Read all 5 in full before proposing anything.

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_change_product_type` | **dropped** | — | Docstring claims changing a product's type/tracking "will raise a user error" in several scenarios - the test code never calls `assertRaises` anywhere, and reading `product.template.write()` confirmed the current model doesn't enforce this either (changing `is_storable` with existing moves/quantities silently resets inventory instead of raising). Neither the code nor the model backs the docstring's claim. |
| `test_edit_done_picking_1` | kept (renamed, extended) | `test_adding_a_move_line_to_a_picking_creates_its_move` | Archive only covered the done-picking half; User asked to extend into one test covering both the done and not-done halves, confirmed via `stock.move.line.create()` to be genuinely different code paths (a not-done picking tries to link to an existing move for the same product first; a done picking always creates a fresh one, even for a product that already has one there). Moved to `test_transfer_flow.py` (picking-level), new "Editing a done picking" section. |
| `test_put_in_pack_1` | kept (renamed) | `test_put_in_pack_splits_partially_picked_line_into_separate_packages` | One move, pack 1-of-2 via `move.quantity = 1` - splits into a packed line plus an unpacked remainder; packing the remainder afterward uses a different package. |
| `test_put_in_pack_2` | kept (renamed) | `test_put_in_pack_packs_multiple_reserved_lines_together_in_one_call` | Two products, neither line `picked` - a single `action_put_in_pack()` call packs both into the same package. |
| `test_put_in_pack_3` | kept (renamed) | `test_put_in_pack_separate_calls_use_separate_packages` | Same two products, each individually marked `picked` before its own separate call - lands in different packages. |

4 kept, 1 dropped, no merges. `test_put_in_pack_1..3` are the first real
content in `test_packaging.py` (was an empty scaffold since the bucket
plan was first drafted). Read `stock.move.line.action_put_in_pack()`/
`_get_lines_and_packages_to_pack()` before writing anything - the real
rule is picked-first filtering (if any candidate line is `picked`, only
picked lines get packed that call; otherwise every line with quantity > 0
does), so "same package vs. different package" is purely a function of
one call vs. two calls, not of done-quantity state the way the archive's
phrasing might suggest. Ported fairly faithfully to the archive's own
steps rather than reverse-engineering the line-splitting mechanics from
the model code alone, then verified empirically - all 3 passed on the
first real-DB run.

Final: `test_packaging.py` 92 lines/3 tests, `test_transfer_flow.py` 304
lines/12 tests (11 + 1 new). Real DB run, full `/stock` tag: 106/106
passing, 0 errors. Combined across the five active bucket files: 94/94
passing, 0 errors, ~10,797 queries, ~11.9s.

## Cluster: move-line aggregation / delivery slip

`stock.move.line._get_aggregated_product_quantities()` - the delivery-
slip-printing grouping method. 7 archived tests, split across two spots
in the file: `test_move_line_aggregated_product_quantities*` early,
`test_delivery_slip_*` much later - both about the same method. Read all
7 in full, plus 2 more interspersed in the same territory:
`test_newly_added_move_line_is_picked_if_move_is_picked` (different
topic - picked-flag propagation onto a newly split-off move line -
flagged as belonging in `test_move_reservation.py`'s edit-a-move-line
territory instead, left deferred) and
`test_scrap_unlink_behavior_on_discard_with_and_without_context` (already
triaged/dropped in the scrap cluster).

Flagged before writing any code: `test_move_line_aggregated_product_quantities`
itself is a 185-line god-test (4 products, a 2-level backorder chain) -
proposed splitting its real lessons into 2 focused tests rather than
porting it whole. User: "You can add them in reporting. Try to merge the
cancel move in another test. also the splitted move and move_line could
be merged" - then, same turn: "You can add a specific class by report."

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_move_line_aggregated_product_quantities` | **split into 2** | `test_aggregated_quantities_group_multiple_products_with_descriptions` + `test_aggregated_quantities_reflect_undelivered_quantities_via_backorder` | 185-line god-test trimmed to its two real lessons: grouping by product+description+UoM, and tracking `qty_ordered`/`quantity` correctly through one level of backorder. The second-level backorder chain and "unlink a line, cancel without backorder" tail dropped as repeating the same lesson at more depth. |
| `test_delivery_slip_aggregated_lines_with_canceled_move_and_packaging` | **dropped** (initially folded in, then removed) | — | User first: "Try to merge the cancel move in another test" - folded into `test_aggregated_quantities_reflect_undelivered_quantities_via_backorder_or_cancel` (simplified from the archive's `action_split_transfer()`+packaging mechanism to a direct `move._action_cancel()`). On further review, User: "you can remove the cancel part since it's not possible anymore" - dropped the cancel half entirely rather than re-homing it; the test (and its name) shrank back to just the backorder lesson. |
| `test_move_line_aggregated_product_quantities_duplicate_stock_move` | **merged with** `_across_move_lines` | `test_aggregated_quantities_sum_across_duplicate_moves_and_split_lines` | User: "the splitted move and move_line could be merged." Two separate moves for the same product, one of them also over-received into a second line - all collapse into one aggregate entry. |
| `test_delivery_slip_quantity_aggregation_across_move_lines` | **merged with** `_duplicate_stock_move` | (same as above) | Merged in, see above. |
| `test_move_line_aggregated_product_quantities_two_packages` | kept (renamed) | `test_aggregated_quantities_scoped_to_one_package` | `strict=True` scopes the aggregate to one specific package at a time. |
| `test_move_line_aggregated_product_quantities_incomplete_package` | kept (renamed) | `test_aggregated_quantities_modes_for_partially_packed_order` | Default / `strict=True` / `except_package=True` read a partially-packed order three different ways. |
| `test_delivery_slip_quantity_aggregation_with_pack_uom` | kept (renamed) | `test_aggregated_quantities_convert_to_packaging_uom` | Plain-unit lines across two packages aggregate correctly converted into the move's packaging UoM. |

6 new tests, 1 merge pair, 1 dropped (the cancel test, after initially
being folded in - see above). Placed in a dedicated class, `TestDeliverySlipReport`, in
`test_reporting.py` (not `test_transfer_flow.py`, which was also floated)
- `TestReporting` itself (forecast/inventory-overview reports) stays
empty, a different report entirely.

Two real-DB findings while writing the merged duplicate-moves/split-lines
test: (1) a plain `action_confirm()` silently merges two such similar
moves into one (same lesson as the chained-move cluster's "confirm with
`merge=False` when testing distinct similar moves" rule, re-encountered) -
fixed with `_action_confirm(merge=False)`; (2) first tried it as a
delivery and over-delivering one move's `quantity` just grew its existing
line in place instead of splitting a second one - traced to
`_set_quantity_done_prepare_vals()` (`stock_move.py` ~2585-2664): it
first tries to grow the existing line by reserving more from the *same*
quant at that line's own location, and only creates a new line if that's
not possible; a receipt bypasses reservation entirely (nothing to grow
into at a virtual supplier location), so it always falls through to a new
line - rewrote the test as a receipt, matching the archive's own choice
but now understood rather than just copied.

Final: `test_reporting.py` 192 lines/6 tests (`TestDeliverySlipReport`).
Real DB run: `TestDeliverySlipReport` alone 6/6, full `/stock` tag:
114/114 passing, 0 errors. Combined across the six active bucket files:
100/100 passing, 0 errors, ~11,896 queries (runtime fluctuates with
machine load - query count is the stable figure).

On review, User: "you can remove the cancel part since it's not possible
anymore" (about
`test_aggregated_quantities_reflect_undelivered_quantities_via_backorder_or_cancel`'s
cancelled-move half, originally folded in from
`test_delivery_slip_aggregated_lines_with_canceled_move_and_packaging`) -
dropped the cancel half entirely rather than re-homing it; the test
shrank back to just the backorder lesson, renamed
`test_aggregated_quantities_reflect_undelivered_quantities_via_backorder`.
The cancelled-move archived test's disposition is now "dropped", not
"folded in" - see the table above, updated.

## Cluster: UoM conversion

5 archived tests named explicitly for UoM: `test_move_compute_uom`,
`test_change_move_line_uom`,
`test_decrease_move_quantity_with_move_line_in_different_uom`,
`test_move_line_qty_with_quant_in_different_uom`,
`test_set_quantity_done_with_rounding_issues`. One more interspersed test
flagged as a different topic and deferred:
`test_move_line_compute_locations` (a move line's `location_id`/
`location_dest_id` defaulting from the move or picking, not UoM).

User, same turn: "Keep the comments of test simple and don't add context
or specific behavior in it. Except if it makes really sens[e]" - applied
to every new/folded test in this cluster; the rounding test keeps a
slightly richer docstring as the one genuine exception (a historical-bug
regression guard).

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_move_compute_uom` | **folded into** | `test_new_move_demand_defaults_to_zero_and_survives_product_change` | A move's UoM follows a product change - folded in rather than a near-duplicate standalone test, switching to a product with a genuinely different UoM (kg) so the recompute is actually proven. |
| `test_change_move_line_uom` | kept (renamed) | `test_edit_reserved_line_uom_recomputes_quant_reservation` | Editing a reserved line's UoM (with and without also changing quantity) recomputes the quant's `reserved_quantity`. |
| `test_decrease_move_quantity_with_move_line_in_different_uom` | kept (renamed) | `test_decrease_move_quantity_with_line_in_different_uom` | Shrinking `move.quantity` keeps a line in a different UoM in sync. |
| `test_move_line_qty_with_quant_in_different_uom` | kept (renamed) | `test_create_line_from_quant_in_different_uom` | Creating a line via `quant_id` on a move in a coarser UoM reserves correctly. |
| `test_set_quantity_done_with_rounding_issues` | kept (renamed) | `test_forcing_exact_quantity_keeps_rounding_remainder_valid` | An imperial-UoM (oz/gram) rounding discrepancy, forced to the exact demand, creates a near-zero remainder line without corrupting reserved quantity. |

4 kept, 1 folded in, 0 dropped. Switched the archive's `uom_dozen`
(factor 12) to this refactor's standard `uom_pack_6` (factor 6)
throughout, picking numbers that land on a clean value (same rounding
discipline as the scrap cluster). New `# ---- UoM conversion ----`
section in `TestMoveReservation`, right after "In-date / removal
strategy".

**Unrelated flaky test found and fixed along the way**: a full-suite run
surfaced `test_edit_done_move_line_follows_lot_change_keeps_in_dates_correct`
(in-date cluster) failing intermittently - reran it 3x in isolation,
failed once. Root cause: one of its two `in_date` comparisons uses a live
`fields.Datetime.now()` capture (not backdated like the other), and
something in the lot-reassignment path re-stamps it close to, but not
always exactly, that original capture when the two happen to cross a
second boundary - exactly why the archive's own in-date tests used
`assertAlmostEqual(..., delta=timedelta(seconds=1))` instead of exact
equality for a live-captured value, a precedent not registered when this
was first ported. Fixed both occurrences of the pattern in the in-date
cluster's tests
(`test_edit_done_move_line_follows_lot_change_keeps_in_dates_correct`
and `test_adding_a_move_line_to_a_done_move_carries_its_in_date`);
reran 2x after the fix, 0 failures.

Final: `test_move_reservation.py` 1,270 lines/61 tests (57 + 4,
`TestMoveReservation` 55 + `TestMoveReservationMultiStep`'s 6). Real DB
run, full `/stock` tag: 118/118 passing, 0 errors (twice, to confirm the
flake fix held). Combined across the six active bucket files: **104/104
passing, 0 errors, ~12,185 queries, ~13.3s**.

## Cluster: forecast availability

2 archived tests named explicitly for the field. First of several
sub-clusters proposed to User out of the remaining ~24 leftover
singletons in `test_move.py` (groups A-H, smallest/cleanest first:
A = forecast availability, B = user-set destination location surviving
system overrides, C = show_* computed fields, D = lot/serial editing on
`stock.move.lot_ids`, E = picking-level misc, F = likely duplicates of
existing coverage, G = a `free_reservation` tie-break test, H = a
deferred multicompany-orderpoint test). User: "Go for A".

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_forecast_availability` | kept (renamed) | `test_move_quantity_in_move_uom_forecast_in_product_uom` | `move.quantity` is expressed in the move's own UoM, `forecast_availability` stays in the product's base UoM. Switched the archive's `uom_dozen` to this refactor's standard `uom_pack_6`, adjusting the expected number (12, not the archive's 24) accordingly. |
| `test_inter_wh_and_forecast_availability` | kept (renamed) | `test_forecast_availability_with_no_stock_between_warehouses` | A move with no stock anywhere reports the real shortfall (`-1`) both before and after confirm. |

2 kept, 0 dropped, 0 merged. Appended as a new `# ---- Forecast
availability ----` section in `TestMoveReservation`, right after
"Availability / reservation (cont'd)" and before "Initial demand" -
thematically a direct continuation of availability/reservation
mechanics.

User follow-up, same turn: "can you check the forecast on the product
level also" (both tests) - added `self.product.virtual_available`
assertions (the product-level "Forecasted Quantity" field), placed after
`_action_confirm()` since `_compute_quantities_dict()` only counts a move
toward `outgoing_qty` once it's past `draft`. Then, for the second test:
"use the interwarehouse location instead of doing a direct transfer" -
the archive's own setup (a freshly created second warehouse + a move
straight to its `lot_stock_id`) isn't how Odoo actually routes between
warehouses; rewrote to move to `self.env.company.internal_transit_location_id`
(the real `'Inter-warehouse transit'` location every company gets,
inactive by default) instead - this also removed the need for a second
warehouse entirely, since the transit location already sits outside
`self.warehouse.view_location_id`'s descendants, so `virtual_available`
reads the move as outgoing without one (confirmed via a real DB run, not
assumed). One rights gap found the same way: activating the transit
location needs `with_user(self.user_stock_manager)`, not the class's
default `stock_user`.

`test_move_reservation.py` now 1,302 lines/63 tests (`TestMoveReservation`
57 + `TestMoveReservationMultiStep`'s 6). Real DB run, file tag: 57/57,
full `/stock` tag: 120/120 passing, 0 errors. Combined across the six
active bucket files: **106/106 passing, 0 errors**. `test_move.py`
triage progress now 148 of 170 (87%).

## Cluster: user-set destination location surviving system overrides

Group B (3 archived tests): `test_SML_location_selection`,
`test_receive_more_and_in_child_location`,
`test_skip_putaway_if_dest_loc_set_by_user`. Found the same
docstring-vs-code gap already caught twice in the putaway cluster -
`test_skip_putaway_if_dest_loc_set_by_user`'s docstring claims putaway
rules/storage categories are enabled, but the test body never creates
either.

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_SML_location_selection` | **folded into** | `test_move_line_destination_location_survives_further_edits` | Editing a move line's `quantity` in a Form doesn't let the `location_dest_id` onchange reset a destination the user already picked. |
| `test_receive_more_and_in_child_location` | **folded into** | (same) | Re-derived at the real mechanism level instead of ported 1:1 - see below. |
| `test_skip_putaway_if_dest_loc_set_by_user` | **folded into, then partly dropped** | (same, partially) | Its "putaway skipped" framing was never substantiated by the test's own code - dropped. Its "destination survives `button_validate()`" half and "receiving into a child location unblocks a delivery waiting on the parent location" half were first ported as a separate picking-level test, then that whole test was dropped per User ("doesn't bring that much value on top of the ones on stock.move"), with the "unblocks" half re-derived into the move-level test instead (see below). |

Proposed merging the first two into one bare-move test, keeping the
third's two halves as one picking-level test with the putaway claim
dropped from its name - User confirmed. First pass built both; User
then asked to drop the picking-level test, then asked to fold its
"unblocks a waiting move" half into the move-level test by writing the
move's own `location_dest_id` field instead.

Investigated the real mechanism before writing anything: `stock.move.location_dest_id`'s
`inverse='_set_location_dest_id'` skips recomputing a line's destination
when the move's new value is an *ancestor* of the line's current one -
a cleaner, more real version of the "survives" lesson than a direct
move-line write. Separately, checked `_trigger_assign()` (the
auto-reservation-retry mechanism) before assuming it would fire for the
"unblocks" half: it's only called from `stock.picking._action_done()`
for incoming/internal picking types, never from a bare move's own
`_action_done()` - confirmed empirically with a throwaway probe test
(added temporarily to `tests/__init__.py`, removed after). Reported this
back to User rather than writing an assertion that would fail; User's
call: call `_action_assign()` explicitly on the waiting move instead of
assuming an automatic trigger.

One real-DB finding: writing `move.quantity = 3` (the move-level setter)
on a receipt split into **two** move lines instead of growing the
existing one in place (the same "receipt bypasses reservation, always
creates a new line" fact already found in the move-line-aggregation
cluster) - fixed by writing `move.move_line_ids.quantity = 3` directly.

Two more follow-up requests from User on this same test: check the
mirror-image direction too ("if you have by default the stock location
as dest and you update the move to use child loc, it should update the
lines") - added a second move, left at its default `stock_location`
destination after confirm, then written to `child_location` (line
follows, since this direction isn't the ancestor-skip case). Then: "I
think you should keep the initial statement but add another ones to
assert both work. child to stock, don't change and stock to child
update" - kept both directions as two separate, explicit moves rather
than walking one move through both transitions in sequence.

3 archived → 1 new test, 0 separately-dropped (all three folded in).
`test_move_reservation.py` now 1,347 lines/64 tests
(`TestMoveReservation` 58 + `TestMoveReservationMultiStep`'s 6). Real DB
run, file tag: 58/58, full `/stock` tag: 121/121 passing, 0 errors.
Combined across the six active bucket files: **107/107 passing, 0
errors**. `test_move.py` triage progress now 151 of 170 (89%).

## Cluster: show_* computed fields

Group C (2 archived tests): `test_compute_show_info`,
`test_show_quant_create_lots_only`. Read `stock.move._compute_show_info()`
before writing anything, since the two archived tests each only
exercise one combo of its formula - wanted the merged test to cover the
formula's real branches, not just restate the two archived scenarios.

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_compute_show_info` | **merged into** | `test_show_quant_and_lot_fields_depend_on_picking_type_lot_settings` | Incoming + lot-tracked, both `use_create_lots`/`use_existing_lots` True: `show_quant` False, `show_lots_text` False, `show_lots_m2o` True. |
| `test_show_quant_create_lots_only` | **merged into** | (same) | Outgoing + create-lots-only: untracked product → `show_quant` True; lot-tracked product → `show_quant` False (now also asserting `show_lots_text`/`show_lots_m2o`, not just `show_quant` as the archive did). |

Real-DB finding: writing `use_create_lots`/`use_existing_lots` directly
on `self.picking_type_in`/`_out` needs `with_user(self.user_stock_manager)`
- the class's default `stock_user` can't write `stock.picking.type`.

2 archived → 1 new test, 0 drops. New `# ---- Lot/quant display fields
----` section in `TestMoveReservation`, right after "Basic in/out
lifecycle" (before "Availability / reservation"). `test_move_reservation.py`
now 1,372 lines/65 tests (`TestMoveReservation` 59 +
`TestMoveReservationMultiStep`'s 6). Real DB run, file tag: 59/59
passing, 0 errors.

## Cluster: lot/serial editing on `stock.move.lot_ids`

Group D (7 archived tests): `test_move_sn_warning`,
`test_serial_tracking`, `test_internal_transfer_with_tracked_product`,
`test_autocomplete_sml_location_based_on_sm_lot_ids`,
`test_tracked_move_quantity_lot_ids_combined_write`,
`test_edit_serial_number_from_move`,
`test_modifying_lots_id_in_outgoing_picking`. First real content for
`test_lot_serial.py` (bucket "Serial/Lot tracking", was an empty
scaffold). Read all 7 in full, proposed a plan, confirmed with User via
`AskUserQuestion` before writing any code.

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_move_sn_warning` | **kept (renamed)** | `test_duplicate_serial_number_warns_and_auto_corrects_location` | Duplicate-serial warning dict at both move-line and move level, plus assigning an existing lot by id auto-corrects the line's source location to where that lot's quant actually is. Nothing else covers any of this. |
| `test_serial_tracking` | **dropped** | — | "Basic tracked transfer works" - already shown by `test_receive_serial`/the mixed-tracking cluster, nothing new. |
| `test_internal_transfer_with_tracked_product` | **dropped** | — | Same as above - a plain internal transfer with a serial product works, no new mechanic. |
| `test_autocomplete_sml_location_based_on_sm_lot_ids` | **kept (renamed)** | `test_setting_move_lot_ids_guesses_each_lines_location_and_package` | Per-serial location/package guessing when setting `move.lot_ids` directly - distinct, nothing else covers it. |
| `test_tracked_move_quantity_lot_ids_combined_write` | **kept, merged with the next row** | `test_tracked_move_quantity_and_lot_ids_combined_write` | A genuine, well-written phantom-delivery regression guard (not archive-numbered style - reads like a deliberate addition). |
| `test_edit_serial_number_from_move` | **dropped** | — | Same lesson as the already-kept `test_edit_reservation_follows_lot_change`, just via `move.lot_ids` instead of `move_line.lot_id`. |
| `test_modifying_lots_id_in_outgoing_picking` | **merged into** | `test_tracked_move_quantity_and_lot_ids_combined_write` | Zero-then-regrow autopopulation angle - User: "merge the last one in" rather than keep as its own test. |

Disposition proposed and confirmed before writing code: keep
`test_move_sn_warning` and `test_autocomplete_sml_location_based_on_sm_lot_ids`
as their own tests, keep `test_tracked_move_quantity_lot_ids_combined_write`
as the base of a merged test, drop `test_serial_tracking`/
`test_internal_transfer_with_tracked_product`/`test_edit_serial_number_from_move`
as duplicates of existing coverage, merge
`test_modifying_lots_id_in_outgoing_picking` in on User's instruction.

Final 3 tests, all new `TestLotSerial(TestStockCommon)` content:
- `test_duplicate_serial_number_warns_and_auto_corrects_location`:
  ported close to 1:1, using a locally-created `pack_location`
  (`self._create_location('Pack')`) in place of the archive's
  `self.pack_location` fixture (never existed in the new `common.py`).
- `test_setting_move_lot_ids_guesses_each_lines_location_and_package`.
  Real-DB finding: first attempt used a second
  `self._create_location('Other')` for the "wrong location" serial and
  failed - `_create_location` defaults its parent to `self.stock_location`,
  so that location was genuinely *inside* the move's own source
  hierarchy and got found normally instead of falling back (the
  archive's own `pack_location` fixture was presumably *not* a child of
  stock - a separate top-level branch, which is why it triggered the
  fallback there). Fixed by using `self.scrap_location` instead (a
  different branch of the location tree entirely, already a `common.py`
  fixture) - genuinely unreachable from the move's source, correctly
  falls back to it.
- `test_tracked_move_quantity_and_lot_ids_combined_write`: same 6-lot
  setup as the combined-write test; after the phantom-delivery guard
  zeroes everything, regrows to demand 2 with 2 specific lots named
  explicitly (lines autopopulate to exactly those two - the
  `test_modifying_lots_id_in_outgoing_picking` angle), then grows once
  more to demand 3 with no `lot_ids` specified at all (a third line
  autopopulates from whatever's still available - didn't assert which
  specific lot, to avoid a fragile removal-order assumption, just the
  resulting count).

7 archived → 3 new tests, 3 dropped, 1 merge pair. `test_lot_serial.py`
now 108 lines (first real content, 3 tests, `TestLotSerial`). Real DB
run, file tag: 3/3 passing, 0 errors.

**Process change, same turn**: User: "Can you run the tests and the
upgrade of md files and html in a background task since I don't need to
check them and it slow the process" - the real-DB verification commands
now run with `run_in_background: true`, and these tracking-doc updates
are now handed to a background `fork` agent rather than written inline -
applied starting with these two clusters (C and D).

`test_move.py` triage progress now 160 of 170 (94%).

## Cluster: picking-level misc

Group E (5 archived tests): `test_scheduled_date_after_backorder`,
`test_recompute_stock_reference`,
`test_internal_picking_uses_shipping_policy_from_picking_type`,
`test_picking_deadline_excludes_cancelled_move`,
`test_move_state_after_split`. Read all 5 before proposing anything -
confirmed with User via `AskUserQuestion`.

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_scheduled_date_after_backorder` | **kept (renamed)** | `test_picking_scheduled_date_follows_earliest_move_backorder_inherits_the_rest` | A picking's scheduled date is its earliest move's date; a backorder created from a partial validation inherits the remaining move's own date instead. |
| `test_recompute_stock_reference` | **dropped** | — | `reference` is just a trivial pass-through of `picking.name` for the non-inventory case - no real stock-specific logic, barely tests anything beyond basic ORM recompute. |
| `test_internal_picking_uses_shipping_policy_from_picking_type` | **dropped** | — | `move_type`'s default-from-picking-type is a one-line compute check with no scenario; the already-kept Shipping Policy tests deliberately set `move_type` rather than relying on this default, so nothing exercises it either way, but this test adds no new behavior either. |
| `test_picking_deadline_excludes_cancelled_move` | **kept, then deleted** | — | Ported 1:1 first, then User: "You can delete test_picking_deadline_excludes_cancelled_move since we can't have cancelled move in the picking anymore" - deleted outright, no replacement. |
| `test_move_state_after_split` | **kept (1:1)** | `test_move_state_after_split` | `action_split_transfer()` - genuinely novel, first time this action is exercised anywhere in the new suite. Dropped the archive's own `productA.is_storable = True` dance since `self.product` is already storable by default. |

Proposed: keep the scheduled-date, deadline, and split tests; drop the
two thin ones (`test_recompute_stock_reference`,
`test_internal_picking_uses_shipping_policy_from_picking_type`). User
confirmed. Two new sections in `TestTransferFlow`:
`# ---- Scheduling & deadlines ----` and `# ---- Splitting a transfer ----`.

Real-DB finding on the scheduled-date test: setting a move's `date`
directly inside a nested `move_ids: [(0, 0, {...})]` creation command
silently gets lost - the move ends up with `date` = `fields.Datetime.now()`
regardless, even while still in `draft` (ruling out
`_action_confirm()`/`_autoconfirm_picking()` as the cause - that
helper's own filter, `move.state == 'draft' and move.quantity`, never
matches a freshly-created, unreserved move). Isolated via a throwaway
probe test (added temporarily to `tests/__init__.py`, removed after): a
bare `stock.move.create({..., 'date': X})` - standalone, or via an
explicit `picking_id` FK pointing at an *already-existing* picking -
keeps the explicit date correctly; only the nested-o2m-inside-
`picking.create()` path loses it. Didn't fully root-cause why inside
the ORM (looks like a framework-level quirk, not stock-specific -
`stock.move.date` has no compute/inverse that could explain it); fixed
by building the picking via `_create_picking()` without `date` in the
per-move dicts, then **writing** each move's `date` afterward instead -
confirmed via the same probe that a plain write always sticks.
**Lesson for future tests**: don't set a move's `date` inside a nested
`move_ids` create command - write it on the move after creation instead.

After the fix was verified, User asked to delete
`test_picking_deadline_excludes_cancelled_move` entirely (see table
above) - same spirit as the earlier move-line-aggregation cluster's
cancel-move drop, a scenario the current model no longer allows.

Final: 5 archived → 2 kept, 3 dropped, 0 merges. `test_transfer_flow.py`
now 359 lines, 14 tests. Real DB run: 14/14 passing, 0 errors.

## Cluster: likely duplicates vs. existing coverage

Group F (2 archived tests): `test_storage_category_restriction`,
`test_correct_quantity_autofilled`. Compared both directly against the
tests they were suspected of duplicating before writing anything.

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_storage_category_restriction` | **dropped** | — | A straight duplicate of the already-kept `test_putaway_storage_category_quantity_capacity_blocks_once_full` - same lesson, and the kept test's per-move location assertions are already more precise than this one's `total_qty <= capacity` check. |
| `test_correct_quantity_autofilled` | **re-derived (narrower)** | `test_creating_a_second_line_from_quant_id_only_fills_remaining_demand` | Only a *partial* duplicate: its first half (one line via `quant_id` auto-fills the full demand) duplicates the already-kept `test_create_line_from_quant_in_different_uom`, but its second half (a *second* line via `quant_id` after the first line's quantity was shrunk, auto-filling only the remaining demand) is genuinely new - nothing else covers it. Kept only that second half. |

User confirmed dropping `test_storage_category_restriction` outright and
re-deriving a narrower test for just the remainder-aware half of
`test_correct_quantity_autofilled`, dropping its redundant first half
and its `uom_dozen`-era framing (uses a gram/kg product instead).
Appended to `TestMoveReservation`'s UoM-conversion section right after
`test_create_line_from_quant_in_different_uom` (thematically adjacent -
both about creating a line via `quant_id`).

Final: 2 archived → 1 new test, 1 dropped, 0 merges.
`test_move_reservation.py` now 1,397 lines, 66 tests
(`TestMoveReservation` 60 + `TestMoveReservationMultiStep`'s 6). Real DB
run, file tag: 60/60 passing, 0 errors.

Combined verification for both clusters together, full `/stock` tag:
**130/130 stock tests passing, 0 errors, ~13,587 queries**.

`test_move.py` triage progress now 170 of 170 (100%).

## Cluster: free_reservation tie-break (re-derived)

Group G (1 archived test): `test_free_reservation`.

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_free_reservation` | **re-derived** | `test_scrap_unreserves_the_picking_scheduled_furthest_in_the_future` | First ported close to 1:1 (`test_free_reservation_unreserves_the_latest_move_when_tied`, bare-move level, same-date tiebreaker via `freeze_time`) and verified passing - User judged it "an edge case" and asked for the *primary* rule instead: "it would be more interesting to check that the picking with last scheduled date is unreserved... adapt the test in transfer flow instead." Deleted the first version outright. |

Read the real mechanism before writing the replacement:
`stock.move.line._get_outdated_candidate_sort_key()` sorts
unreservation candidates by "same picking as the triggering line first,
then latest `scheduled_date` first" - the picking scheduled furthest in
the future gives up its reservation first, not just a same-date
tiebreaker. New test in `test_transfer_flow.py`'s new `# ---- Reservation
priority across pickings ----` section: two deliveries for the same
product with different scheduled dates (2 vs. 5 days out), both fully
reserved; scrapping enough to make stock insufficient for both leaves
the earlier-scheduled delivery untouched and partially unreserves the
later one.

Two real-DB findings: (1) confirmed via a throwaway probe that
`_free_reservation` only triggers from inside `_action_done()`'s own
move-line-validation loop (when consuming stock makes a location's
available quantity go negative), not from any direct quant-quantity
write - the scrap has to be validated, which it already was; (2) the
reservation WAS correctly stolen from the later delivery, but asserting
on the picking's own `state` read as `'assigned'` regardless, because a
single `partially_available` move reads as its picking's own
`'assigned'` under the default `move_type='direct'` (ASAP) policy - the
same fact already documented earlier in this refactor. Fixed by
asserting on `late_delivery.move_ids.state` directly.

Final: 1 archived → 1 new test (re-derived, not kept 1:1). `test_transfer_flow.py`
now 383 lines, 15 tests.

## Cluster: multicompany orderpoint

Group H (1 archived test, the very last one in `test_move.py`):
`test_multicompany_orderpoint_horizon_and_deadline`. Originally flagged
to defer - real replenishment/multicompany scope, would open an
entirely unexplored `test_multicompany.py` bucket. Asked User whether
to tackle it now or leave it deferred - the answer redirected the
placement entirely: "Put it in transferflow in a new class for multi
company. Don't create a new company but use ones from test data in
base."

| Archived test | Disposition | New test | Notes |
|---|---|---|---|
| `test_multicompany_orderpoint_horizon_and_deadline` | **kept (1:1, relocated twice)** | `test_orderpoint_replenishment_deadline_and_horizon_follow_its_own_company` | First landed in a new class, `TestTransferFlowMultiCompany(TestStockCommon)`, in `test_transfer_flow.py` (not `test_multicompany.py`, per User). Moved again on further review - User: "move the last company test in test_warehouse_routing and delete test_multicompany file" - now `TestWarehouseRoutingMultiCompany` in `test_warehouse_routing.py`, next to `TestWarehouseRouting` (whose own docstring already names replenishment as its territory). Uses `base.test_company_template2` (a pre-made, independent, non-branch test company) instead of `res.company.create()`. |

Real investigation needed (all via throwaway probes, added temporarily
to `tests/__init__.py`, removed after each):
1. `env.companies`/`env.company` validate `allowed_company_ids` against
   a fresh DB search on `res.company.user_ids` (`res_users.py`'s
   `_get_company_ids()`, not a cached field) - granting the second
   company needs an actual `company_ids` write on the user record, not
   just rebinding the env's context.
2. A bare `stock.move.create()` with an explicit `with_context(allowed_company_ids=...)`
   keeps the override correctly in isolation - confirmed this specific
   mechanism works before building the real class around it.
3. The real blocker, found by tracing `BaseCommon._callSetUp()`:
   `self.env` is only rebound to `self._test_user` **per test method**;
   during `setUpClass` itself, `cls.env.user` is still the admin/superuser
   test account. The first attempt granted `company_b` to `cls.env.user`
   inside `setUpClass`, silently granting it to the wrong record - the
   restricted user the test method actually runs as (`cls._test_user`)
   never got it, reproducing the exact same `AccessError: Access to
   unauthorized or invalid companies` from inside the test method
   despite the grant appearing to work moments earlier. Fixed by
   targeting `cls._test_user` explicitly (not `cls.env.user`) in
   `setUpClass`.

**Lesson for any future multi-company test in this refactor**: grant
`company_ids` to `cls._test_user` specifically, never `cls.env.user`,
when doing it from `setUpClass`.

New test: one orderpoint (company fixed to `base.test_company`, never
changed) is replenished once "as" `company_b` (horizon 30) and once "as"
`self.env.company` (horizon 365) via `with_company()` - both times, the
resulting receipt's deadline and the replenishment info's displayed
horizon days follow the orderpoint's own fixed company, never whichever
company was merely "active" when triggering the replenishment. A
genuine multi-company isolation guard, not a tautology.

Final: 1 archived → 1 new test, 0 drops, 0 merges. `test_transfer_flow.py`
now 422 lines, 16 tests across 2 classes (`TestTransferFlow` 15 +
`TestTransferFlowMultiCompany`'s 1).

Combined verification for everything in this session, full `/stock` tag:
**134/134 stock tests passing, 0 errors, ~14,276 queries** (runtime
fluctuates with machine load).

`test_move.py` triage progress now 170 of 170 (100%) - **COMPLETE**.

**Follow-up tidy-up, after the above**: User asked to relocate this one
test again and delete the now-pointless `test_multicompany.py` scaffold
(see the table row above, updated) - `TestTransferFlowMultiCompany` →
`TestWarehouseRoutingMultiCompany` in `test_warehouse_routing.py`.
`test_transfer_flow.py` back down to 381 lines/15 tests (1 class);
`test_warehouse_routing.py` now 396 lines/14 tests across 2 classes.
No triage disposition changed. Real DB run: the four affected classes
29/29 passing, 0 errors; full `/stock` tag re-run: 134/134 passing,
0 errors, ~14,284 queries - same total as before the move.

**Follow-up tidy-up #2**: two more of the open/deferred tests resolved
(see the table rows above, updated) - `test_past_quantity` dropped,
`test_past_availability_in_strict_mode` kept as `test_availability_at_date`.
First placed in `test_reporting.py`'s `TestReporting` class, then moved
per User's follow-up request into `test_move.py`'s (then still
`test_move_reservation.py`) `TestMoveReservation`, `# ---- Availability
/ reservation ----` section. Verified at both stops: `TestReporting`
1/1, then `TestMoveReservation` 61/61, full `/stock` tag 135/135 both
times.

**Follow-up tidy-up #3**: User asked to rename `test_move_reservation.py`
itself, since its scope had long outgrown "reservation" - renamed to
`test_move.py` (matching this very archived file it supersedes). Same
content, same class names at that point, only the file renamed. A stray
leftover probe file (`test_probe_trigger_assign.py`, from a much earlier
cluster, never actually registered/run) was found and deleted in the
same pass. Full `/stock` tag: 135/135 passing, 0 errors - identical
count to before the rename.

**Follow-up tidy-up #4**: User asked to rename the classes too -
`TestMoveReservation` → `TestStockMove`, `TestMoveReservationMultiStep` →
`TestStockMoveMultiStep` (first tried the plain `TestMove`, User
redirected: "Use TestStockMove to avoid collision"). Test method names
inside both classes untouched. Full `/stock` tag: 135/135 passing, 0
errors - identical count again.

**Follow-up tidy-up #5**: `test_product_tree_views`'s drop prompted a
side-quest outside this file's own scope - User asked whether an
equivalent test already exists post-install in the `product` module for
a basic user opening the product page. Searched `addons/product/tests/`
and broadly every module; found nothing, so the earlier drop still
rests on its original reasoning, not on redundancy. User then asked to
add the real equivalent directly in `product` instead (kanban, list,
form views, one test) - ended up as `addons/product/tests/test_common.py`'s
`TestProduct.test_product_user_access`, merged with the pre-existing
`test_any_user_can_print_product_labels` per User's request, after two
renames. Verified: full `product` module tag, 206/206, 0 errors (one
fewer than the pre-merge baseline of 207, confirming a merge). Not part
of this file's own triage counts.

Continuing the open list itself: `test_move_line_compute_locations` read
and kept. `stock.move.line._compute_location_id()`/`_compute_location_dest_id()`
prefer `line.move_id.location_id`/`_dest_id` first, falling back to
`line.picking_id.location_id`/`_dest_id` only when the line has no move
at all - exactly the two cases the archived test demonstrates. Distinct
from the existing "Move line destination location" section (that one is
about surviving an edit after creation, this one is about defaulting at
creation time with no move yet). Ported close to 1:1 as
`test_move_line_location_defaults_from_its_move_or_its_picking`, right
before `test_move_line_destination_location_survives_further_edits` in
`TestStockMove`. 1 archived → 1 new test, 0 drops/merges. `TestStockMove`
now 62 tests (`test_move.py` 68 total across 2 classes). Real DB run:
`TestStockMove` 62/62, full `/stock` tag 136/136 passing, 0 errors (one
more than the previous 135).

Closing out the open list: `test_newly_added_move_line_is_picked_if_move_is_picked`
read and kept. Exercises `stock.move.line.create()`'s `vals['picked'] =
move.picked` default (`stock_move_line.py` ~363-364: a line created
with `move_id` set and no explicit `picked` key inherits the move's own
`picked` state) - a real behavior worth protecting per User ("we want
to protect this behavior"). User then asked to fold it into an existing
test rather than port a new one ("Can you try to include it in an
existing test"). Folded into `TestStockMove`'s
`test_creating_a_second_line_from_quant_id_only_fills_remaining_demand`,
which already builds the exact same shape (a confirmed-but-not-done
move, lines created directly via `env['stock.move.line'].create({'move_id':
move.id})`) - added `move.picked = True` mid-test plus two assertions
(the pre-existing line picks up `picked` via `_inverse_picked()`'s
write-time propagation on the move; a line created afterwards inherits
it via the `create()` default). Renamed to
`test_creating_a_second_line_from_quant_id_fills_remaining_demand_and_inherits_picked`
to reflect both things it now checks. 1 archived test folded into 1
existing test, 0 new test methods - `TestStockMove` holds at 62 tests
(`test_move.py` holds at 68 total across 2 classes). Real DB run:
`TestStockMove` 62/62, full `/stock` tag 0 failed/0 errors (raw count
drifted to 120 this run, a pre-existing unrelated drift already noted
elsewhere in this doc - driven by the still-empty
`test_batch_wave`/`test_inventory_adjustment` scaffolds contributing 0
tests and incidental `test_js` tests pulled in by `-i stock`'s
dependency chain; not reconciled, same as every prior drift note here -
what holds is 0 failed/0 errors both before and after).

## Not yet reached

Nothing - `test_move.py`'s triage is **fully complete**. All 6 of the
originally-deferred test methods (`test_out_3`, `test_past_quantity`,
`test_past_availability_in_strict_mode`, `test_product_tree_views`,
`test_move_line_compute_locations`, and
`test_newly_added_move_line_is_picked_if_move_is_picked`) are now
resolved: the first, second, and fourth confirmed redundant/defensive
and dropped; the third kept/renamed as `test_availability_at_date`; the
fifth kept as `test_move_line_location_defaults_from_its_move_or_its_picking`;
the sixth folded into
`test_creating_a_second_line_from_quant_id_fills_remaining_demand_and_inherits_picked`
- see their entries above. Nothing left undecided in this file.
