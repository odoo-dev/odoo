# `archive/test_move2.py` — triage log

Test-by-test record of what was decided for `archive/test_move2.py` (3,957
lines, ~90 test methods across 6 classes: `TestPickShip`, `TestSinglePicking`,
`TestStockUOM`, `TestRoutes`, `TestAutoAssign`, `TestPickShipBackorder`).

Unlike `test_move.md` (built cluster-by-cluster together with User), this
file was triaged **solo, end to end, in one pass** — User: "do test_move2 by
yourself using all the context I gave you." No per-cluster check-in; every
decision below is this session's own call, verified against a real DB
afterward rather than confirmed with User beforehand. The file is now
deleted (process point 3 — archived files go once every test is decided).

Legend: **kept** (ported, usually renamed/simplified) · **merged** (folded
into another kept test) · **dropped** (not ported).

## Cluster: `TestPickShip` (22 tests)

Almost every test in this class was built on two hand-wired factory helpers,
`create_pick_ship()`/`create_pick_pack_ship()`, which set `move_dest_ids`/
`move_orig_ids` directly at creation instead of routing through a real
picking/warehouse configuration — exactly what process point 13 already
forbids. Neither helper was recreated. Where a test's scenario had a clean
equivalent via `TestStockMoveMultiStep`'s existing real `pick_ship`-routed
setup, it was re-derived there; several others turned out, once actually
tried against real routing, to have **no clean equivalent at all** —
empirically disproven premises, not just "too much effort to port" (see
`SKILL.md`'s own entry for the exact findings: push links only exist after
the origin is done, never before; a pushed move's own reservation is an
ordinary FIFO quant search, not restricted to what the origin delivered; a
pushed move is never `'waiting'`).

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_unreserve_only_required_quantity` | kept | `test_overpicking_steals_only_the_required_amount` (`test_move.py`) | Pure move-level (no chain at all despite the class). Validating for only slightly more than what's freely available steals only the extra bit from another move's reservation, not all of it — a genuinely distinct nuance from `test_overpicking_unreserves_other_move` (which steals everything because the full amount was needed there). |
| `test_mto_moves` | dropped | — | Ship becomes assigned once pick is done (dup of `test_validating_pick_creates_and_reserves_ship`); partial-ship-then-backorder half dup of generic backorder coverage. |
| `test_mto_to_mts` | dropped → **revived, see Follow-up 2** | `test_moving_the_pick_off_its_destination_reverts_the_ship_to_mts` (`test_move.py`, `TestStockMoveMultiStepPull`) | Hand-wired premise (edit a *pre-existing* hand-wired `move_dest_ids` link) doesn't map onto the *default* push routing — confirmed, that part still holds. But a third real warehouse configuration (all steps rewritten to real pull rules, not just the first) reproduces the exact mechanic for real; see Follow-up 2. |
| `test_mto_to_mts_2` | dropped → **revived, see Follow-up 2** | `test_cancelling_the_pick_reverts_the_ship_to_mts` | Same correction as `test_mto_to_mts` above — the `propagate_cancel` mechanic is real, just needs the all-pull configuration to ever observe it. |
| `test_mto_to_mts_3` | dropped → **revived, see Follow-up 2** | `test_moving_the_ship_off_its_source_reverts_it_to_mts` | Same correction again (ship's own source changed instead of pick's dest) — reproduces the same way. |
| `test_mto_moves_transfer` | dropped → **revived, see Follow-up 2** | `test_ship_reserves_only_what_the_pick_delivered` | Premise ("the ship ignores stock already sitting at its own destination") was falsified against the *default* push routing, which was the wrong setup to test it against — it holds true under the all-pull configuration instead; see Follow-up 2. |
| `test_mto_moves_return` | kept | `test_mto_partial_return_unreserves_the_downstream_ship` (`test_transfer_flow.py`) | A partial return of what the pick delivered correctly un-reserves the downstream ship by exactly that much. Real `delivery_steps='pick_ship'` + `_create_return()`, no hand-wiring needed. |
| `test_mto_moves_extra_qty` | dropped | — | Dup in substance of the already-kept `test_receiving_more_than_demanded_updates_pushed_move_demand` — same "extra received flows through to the downstream move's own quantity" lesson, different stage of the chain. |
| `test_mto_moves_return_extra` | dropped | — | A combination of two already-separately-covered mechanics (extra-move merging + returns), not a new lesson on its own. |
| `test_mto_resupply_cancel_ship` | dropped | — | Narrow scheduler/procurement regression guard (2 warehouses + resupply route + `run_scheduler()` + "no runaway mail.activity" check) — high setup cost for a narrow edge case, low general value. |
| `test_no_backorder_1` | dropped | — | Backorder-pushes-its-own-ship half already covered by `test_backorder_pick_without_reference_pushes_its_own_ship`; the one new bit ("cancelling the backorder doesn't disturb the already-pushed ship") judged a fairly obvious corollary, not surprising enough to protect on its own. |
| `test_edit_done_chained_move` | kept | `test_editing_done_pick_quantity_updates_ships_reservation` (`test_move.py`, `TestStockMoveMultiStep`) | Editing a done pick's move-line quantity re-syncs the not-yet-done ship's own reservation live. Real push chain, no hand-wiring. |
| `test_edit_done_chained_move_with_lot` | kept | `test_editing_done_pick_lot_updates_ships_reservation` | Lot companion of the above — editing the done pick line's lot instead. |
| `test_chained_move_with_uom` | dropped | — | Combination of UoM conversion (already extensively covered in `test_move.py`'s own UoM-conversion cluster) and chaining (already covered) — no new lesson. |
| `test_pick_ship_return` | kept (simplified) | `test_returning_each_leg_of_a_chain_separately_links_the_returns` (`test_transfer_flow.py`) | Core lesson kept (returning pick and ship *independently* still links the two returns via `move_orig_ids`/`move_dest_ids`), but the archived version's intermediate-state assertion (`return_pick` reads `'waiting'` before `return_ship` exists) doesn't hold for a real chain either — dropped that part, kept only the final link check, relaxed to `assertIn` since one extra pre-existing origin showed up alongside the expected one. Trimmed from ~60 lines (lot tracking, `return_picking_type_id=False` override) to the essential mechanic. |
| `test_pick_pack_ship_return` | dropped | — | A deeper (3-step, serial-tracked) but redundant variant of the same lesson `test_pick_ship_return` already demonstrates — verifying multi-hop `move_orig_ids`/`move_dest_ids` propagation specifically wasn't judged worth a second, much longer test. |
| `test_merge_move_mto_mts` | kept | `test_merge_move_mto_mts_does_not_merge` (`test_transfer_flow.py`) | Two same-product moves in one picking, one MTO and one MTS, never merge — `procure_method` is part of the merge key. Doesn't actually need the chain/routing at all, simplified to two plain moves in one picking. |
| `test_mto_cancel_move_line` | dropped (confirmed reproducible under the all-pull config too, see Follow-up 2 — deliberately still not ported) | — | Premise (a pushed move can read `'waiting'`, becoming `'confirmed'` only once every origin is done) is false for the *default* push chain — confirmed, still holds. Reproduces fine under the all-pull config, but its real lesson is a `_recompute_state()` nuance orthogonal to the pull-vs-push distinction Follow-up 2 is about — left as a candidate for a separate pass instead of stretching that one's scope. |
| `test_unreserve` | dropped | — | Trivial/duplicate of existing `test_unreserve_restores_available_quantity` coverage — "unreserve a reserved picking" and "unreserve an already-unreserved one is a no-op" aren't a new lesson. |
| `test_return_only_one_product` | kept | `test_return_all_computes_remaining_quantity_after_partial_return` | `action_return_all()` correctly computes what's left to return per product after an earlier partial return. Simplified from 3 products to 2. |
| `test_return_location` | kept | `test_return_to_a_different_location_than_the_original_source` | Returning part to the original source and part to a different location (even another warehouse's) correctly splits the quantity. |
| `test_return_lot` | kept (simplified) | `test_return_suggests_the_lots_actually_taken_by_the_picking` | `_create_return()` proposes exactly the lot (and quantity) the picking actually consumed, following FIFO — not just any lot. Simplified from 3 lots/2 deliveries with a partial split to 2 lots/2 deliveries with a clean FIFO handoff, same lesson. |

## Cluster: `TestSinglePicking` (46 tests)

The biggest cluster by far, and the most duplicate-heavy — most of its
scenarios (backorder variants, extra-move variants, recheck-availability
variants, the five `use_create_lot`/`use_existing_lot` combinations) are
numbered repeats of a mechanic already demonstrated once, cleanly, elsewhere
in the new structure.

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_backorder_1` | dropped | — | Dup of `test_backorder_wizard_opens_on_partial_availability`. |
| `test_backorder_2` | dropped | — | Dup of the same, slightly different reserved/done split. |
| `test_backorder_3` | dropped | — | Dup of `test_validate_picking_with_mixed_availability_backorders_both_moves`. |
| `test_backorder_4` | kept | `test_cancelling_backorder_cancels_the_unprocessed_move` (`test_transfer_flow.py`) | Cancelling the backorder wizard (instead of keeping it) cancels the move with nothing processed — not just skips it. Not covered by any kept backorder test, which all keep the backorder. |
| `test_assign_deadline` | kept (simplified) | `test_reservation_priority_follows_deadline_before_scheduled_date` (`test_move.py`, `TestStockMove`) | A `date_deadline` always wins reservation priority over a move with only a scheduled `date`. Trimmed from 4 competing moves (also comparing two no-deadline moves by `date`) to 2, after the 4-move version hit real ordering/merge pitfalls not worth chasing further (`stock.picking.action_assign()`'s own sort key `(-priority, not bool(date_deadline), date_deadline, date, id)`, and `stock.merge_only_same_date` needed for the two no-deadline moves not to merge) — the 2-move version still protects the real lesson cleanly. |
| `test_extra_move_1` | dropped | — | Dup in effect of `test_edit_done_move_line_quantity_increase_goes_negative` — same "more than demand, after done, goes negative, no backorder for the extra" end state, just reached via a different mechanical path (pre-done quantity override vs. post-done edit). |
| `test_extra_move_2` | dropped | — | Same, different overshoot amount. |
| `test_extra_move_3` | dropped | — | Receipt-side variant — receiving more than demanded is unremarkable (dest absorbs it, src/supplier can't go negative the other way); not a genuinely interesting edge case on its own. |
| `test_extra_move_4` | kept | `test_move_added_after_confirm_does_not_merge_with_existing_move` (`test_transfer_flow.py`) | A move added directly to an already-confirmed picking doesn't retroactively merge with an existing move of the same product — merging only happens at confirm time. Simplified away from the archived version's pre-set `state`/`quantity` hack in the create dict. |
| `test_recheck_availability_1` | dropped | — | Dup in substance of the existing reassign/grow-in-place coverage (`test_reassign_receipt_grows_with_demand` etc.) — the trigger (an inventory-count apply) isn't meaningfully different from a direct quant update for reservation purposes. |
| `test_recheck_availability_2` | dropped | — | Lot variant of the same, dup of existing lot-matching-grows-in-place mechanics. |
| `test_recheck_availability_3` | dropped | — | "New stock under a different lot creates a second line" — same core lesson as `test_reservation_spans_tracked_and_untracked_quants` (one line per distinct quant/lot group), different trigger. |
| `test_recheck_availability_4` | dropped | — | Serial variant — dup of `test_reassign_serial_creates_new_lines`. |
| `test_use_create_lot_use_existing_lot_1` | dropped | — | `use_create_lots=False, use_existing_lots=False` works without any lot — dup of `test_validate_tracked_receipt_requires_lots_unless_picking_type_waives_it`. |
| `test_use_create_lot_use_existing_lot_2` | dropped | — | Both `True` — dup in effect of `test_validate_tracked_receipt_blocks_until_lot_assigned_then_backorders` (same "must provide a lot before validating, `lot_name` resolves it" end behavior, different combination of the two booleans). |
| `test_use_create_lot_use_existing_lot_3` | dropped | — | Same combination as the already-kept `test_validate_tracked_receipt_blocks_until_lot_assigned_then_backorders` (`use_create=True, use_existing=False`), just on an outgoing picking type instead of incoming — the check doesn't care about direction. |
| `test_use_create_lot_use_existing_lot_4` | kept | `test_creating_a_lot_from_a_picking_that_disallows_it_raises` (`test_lot_serial.py`) | The one genuinely distinct nuance in this cluster — `use_create_lots=False, use_existing_lots=True` blocks *creating* a brand-new lot from the picking's own context (a different code path, `stock.lot.create()`'s own guard, not `_action_done()`'s). |
| `test_use_create_lot_use_existing_lot_5` | dropped | — | Dup of `test_edit_done_move_line_lot_to_unavailable_lot_consumes_untracked_quant`/`test_edit_reservation_assigning_lot_afterwards_keeps_quantity` — same "falls back to the untracked quant instead of going negative under an unrelated lot" lesson. |
| `test_merge_moves_1` | kept | `test_same_product_moves_in_a_picking_merge_on_confirm` (`test_transfer_flow.py`) | The basic "moves merge on confirm" mechanic — a genuine gap, nothing in the new structure demonstrated it yet. |
| `test_merge_moves_2` | merged | `test_same_product_moves_in_a_picking_merge_on_confirm` | Origin-string concatenation/dedup across merged moves — folded in as an extra assertion on the test above rather than a separate test. |
| `test_merge_moves_3` | dropped | — | Doesn't actually test what its own docstring claims (zero-initial-demand merge edge case) — the two moves it builds are for *different products*, which already never merge for an unrelated reason; a confused/non-illustrative original test. |
| `test_merge_moves_never_attributes` | dropped | — | A real, distinct merge-grouping-key nuance (`never_product_template_attribute_value_ids`), but a niche feature (no-variant attributes) — judged too narrow relative to the setup cost, given the core merge mechanic is already protected by `test_same_product_moves_in_a_picking_merge_on_confirm`. |
| `test_merge_chained_moves` | kept | `test_multistep_reception_merges_moves_sharing_a_reference` (`test_move.py`, `TestStockMoveMultiStep`) | Two separate receipts sharing the same stock reference push into ONE merged picking at the next 3-step-reception stage, keeping both as origins — a genuinely distinct chained-merge mechanic. |
| `test_prevent_merge_moves_without_stock_reference` | kept | `test_multistep_reception_does_not_merge_moves_without_a_shared_reference` | Natural negative companion of the above — without a shared reference, the two receipts' next steps stay on separate pickings. |
| `test_empty_moves_validation_1` | merged | `test_validate_picking_with_only_zero_demand_moves` (`test_transfer_flow.py`) | Validating a picking of only zero-demand, zero-done moves raises `UserError`. |
| `test_empty_moves_validation_2` | merged | `test_validate_picking_with_only_zero_demand_moves` | Companion half of the same test — one zero-demand move manually processed, the other auto-cancelled, no backorder. Combined into one test with two pickings rather than kept as two separate tests, since they share the exact same setup theme. |
| `test_unlink_move_1` | dropped | — | Trivial `Form`/ORM-plumbing check (removing a move before saving just works) — no real stock business logic being protected. |
| `test_additional_move_1` | dropped | — | Narrow `show_check_availability` UI-flag check — judged a secondary concern relative to the core reservation mechanics this refactor prioritizes. |
| `test_additional_move_2` | dropped | — | Companion of the above, same reasoning. |
| `test_delete_move_line_reserve_button` | dropped | — | Same `show_check_availability`-flag family. |
| `test_owner_1` | kept | `test_receive_with_owner_carries_owner_to_quant` (`test_move.py`, `TestStockMove`) | A real, previously-uncovered mechanic — an explicit `owner_id` on a receipt carries through to both the supplier's negative quant and the stock quant. (`owner_id` lives on `stock.picking`, not `stock.move` — see `SKILL.md`.) |
| `test_putaway_for_picking_sml` | dropped | — | Dup, already thoroughly covered by `TestPutaway` in `test_warehouse_routing.py`. |
| `test_cancel_plan_transfer` | dropped | — | Too trivial on its own — a bare `action_cancel()` state transition with no interesting side effect, already incidentally exercised by other kept tests involving cancellation. |
| `test_immediate_transfer` | dropped | — | Dup in effect of `test_adding_a_move_line_to_a_picking_creates_its_move` (a move-line with no `move_id` auto-creates its move) — just exercised via the picking's own `create()` instead of a follow-up `stock.move.line.create()`. |
| `test_immediate_picking_with_lot` | dropped | — | Same immediate-create mechanic plus lot assignment, both already covered separately. |
| `test_picking_reservation_at_confirm` | kept | `test_scheduler_reserves_at_confirm_pickings_as_stock_arrives` (`test_warehouse_routing.py`) | A genuinely novel, previously-uncovered mechanic — the scheduler (`run_scheduler()`) keeps retrying reservation for an `'at_confirm'` picking type as stock arrives over time, contrasted with `'manual'` which it never touches. `TestWarehouseRouting`'s first real content. |
| `test_create_picked_move_line` | dropped | — | Exact duplicate of the `picked`-inheritance-on-create mechanic already explicitly protected (per User's own request) by `test_creating_a_second_line_from_quant_id_fills_remaining_demand_and_inherits_picked`, via the picking-linking code path specifically flagged to avoid re-covering. |
| `test_unreservation_on_qty_decrease` | dropped | — | Dup in substance of `test_reservation_updates_with_move_quantity`'s "shrinking unreserves in reverse removal-strategy order" lesson — the `closest` strategy specifics are the only wrinkle, not enough to justify a second test. |
| `test_unreservation_on_qty_decrease_2` | dropped | — | Narrow direct-call probe of the internal `_set_quantity_done_prepare_vals()` method — package-preservation behavior already covered via the normal `move.quantity =` write path. |
| `test_unreservation_on_qty_decrease_3` | dropped | — | Same, companion variant. |
| `test_onchange_picking_locations` | kept | `test_picking_location_change_propagates_to_its_moves` (`test_transfer_flow.py`) | Editing a picking's own source/destination updates the moves it already holds — a real, previously-uncovered, cheap-to-protect default-follow mechanic. |
| `test_onchange_lot_ids_for_lot_tracked_product_without_reservation` | kept (simplified) | `test_onchange_lot_ids_without_reservation` (`test_lot_serial.py`) | `lot_ids` assignment on an unreserved move: existing valid-lot lines kept, a removed lot's line dropped, new lots added, quantity recomputed. Simplified to one tracked product (serial) in a single UoM — dropped the archived version's mixed serial+lot, dual-UoM (`uom_dunit`) setup, a secondary UoM-rounding detail already covered elsewhere. Also switched from `Form` to a direct `move.lot_ids = ...` write — the embedded picking "Operations" popup view (`view_stock_move_operations`) has no `lot_ids` field at all, only per-line `move_line_ids`; `lot_ids` as a bulk quick-editor only exists on `stock.move`'s own direct form. |
| `test_onchange_lot_ids_for_lot_tracked_product_with_reservation` | kept (simplified) | `test_onchange_lot_ids_with_reservation` | Same mechanic, reserved: quantity maxes out at what's actually available per chosen lot, minimum 1 unit when a lot has no quant at all. Simplified to one lot-tracked product, no sublocation-priority-ordering complexity, same `Form`→direct-write switch as above. |
| `test_validate_picking_twice` | kept | `test_validating_an_already_done_picking_is_a_noop` (`test_transfer_flow.py`) | Calling `button_validate()` a second time on an already-done picking is a no-op — a real, cheap, previously-uncovered guard (distinct from `test_validate_multiple_pickings_at_once`, which validates several *different* pickings at once). |
| `test_picking_destination_from_operation_type_and_contact` | kept | same name (`test_transfer_flow.py`) | Contact's own stock location wins over the operation type's generic default, except for a sibling-company (transit-location) contact, falling back to the operation type's default when the contact has no location of its own. Adapted `self.warehouse_1`/`self.partner_1` references to `self.warehouse`/freshly-created partners. |
| `test_picking_source_from_operation_type_and_contact` | kept | same name | Mirror of the above for a receipt's source. |

## Cluster: `TestStockUOM` (2 tests)

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_pickings_transfer_with_different_uom_and_back_orders` | dropped | — | Combination of UoM conversion and backorder creation, both already separately and thoroughly covered in `test_move.py`'s UoM-conversion cluster and `test_transfer_flow.py`'s backorder tests — no new lesson from combining them. |
| `test_move_product_with_different_uom` | dropped | — | Dup of `test_forcing_exact_quantity_keeps_rounding_remainder_valid` — same "UoM rounding discrepancy must not reserve more than what's actually in stock" lesson. |

## Cluster: `TestRoutes` (8 tests)

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_replenish_pick_ship_1` | kept (rewritten) | `test_replenish_wizard_resupplies_from_another_warehouse` (`test_warehouse_routing.py`) | Replenishing a product configured to resupply from another warehouse creates a receipt for the right quantity. Rewritten to search for the resulting receipt directly instead of the archived version's fragile notification-URL-parsing approach. |
| `test_pick_ship_from_subloc` | kept | `test_push_rule_triggers_from_a_sublocation_of_its_source` | A push rule still applies when its reacting move lands in a *sublocation* of the rule's own source, not just the exact location. |
| `test_2_steps_delivery_reaches_customer_subloc` | dropped | — | Redundant twin of `test_location_for_forecast_in_push` — same `forecasted_location_id`-propagates-through-a-push-chain mechanic, just a different final-location setup. |
| `test_push_rule_on_move_1` | kept | `test_push_rule_triggers_a_new_move_on_action_done` | The baseline push mechanic itself (a manually-forced `route_ids` on an arbitrary move triggers a push on `_action_done()`) — not covered elsewhere, which only exercises push via the warehouse's own pre-wired `delivery_steps`/`reception_steps` configuration. |
| `test_location_dest_update` | kept | `test_transparent_push_rule_updates_the_move_itself` | A push rule with `auto='transparent'` updates the move's own destination directly instead of creating a new downstream move — a distinct push-rule mode. (Needed a location *not* parented under `self.stock_location`, otherwise the rule matches its own output and recurses forever — caught via a real stack trace during verification.) |
| `test_mtso_mto_adjust_01` | dropped | — | Only exercises the uninteresting/default-outcome branch of `_adjust_procure_method()` (enough stock, nothing changes) — not illustrative of the actual `mts_else_mto` decision logic, which would require the insufficient-stock branch instead. |
| `test_location_for_forecast_in_push` | kept | `test_forecasted_location_propagates_through_a_push_chain` | `forecasted_location_id` set on a pick's move propagates through the push chain to the ship's own final destination. |
| `test_push_rule_moves_source_location` | kept | `test_push_rule_source_location_follows_its_own_rule_not_just_the_original_destination` | A pushed move's source follows the push rule's own `location_src_id` when it's a child of the move's actual destination — demonstrated via a move split across two destination sublocations producing two separately-sourced pushed moves. |

## Cluster: `TestAutoAssign` (6 tests)

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_auto_assign_0` | kept | `test_validating_an_unrelated_move_reassigns_a_waiting_move` (`test_move.py`, `TestStockMove`) | A confirmed-but-unreserved move gets reserved automatically once an *unrelated* receipt/internal-transfer's validation makes stock available — fires from `stock.picking`'s own `_action_done()` (`done_incoming_moves._trigger_assign()`), not from a bare move's `_action_done()` — had to switch from `_in_move()` to `_receipt()` once this was confirmed via source. |
| `test_auto_assign_1` | dropped | — | "MTO doesn't auto-assign from ambient stock elsewhere" is already implicit in `test_validating_pick_creates_and_reserves_ship` (the ship starts `'waiting'` until the pick is actually done) — not enough left to justify a second test once `test_mto_moves_transfer`'s stronger version of this claim was found to be false. |
| `test_auto_assign_reservation_method` | kept (trimmed) | `test_reservation_method_controls_when_scheduler_auto_assigns` (`test_move.py`, `TestStockMove`) | Genuinely unique ground — `'manual'` and `'by_date'` reservation methods aren't demonstrated anywhere else (only the default `'at_confirm'` is, implicitly, throughout the rest of the file). Trimmed from 5 picking-type variants to 3 (manual / by_date-not-due / by_date-due); each copied picking type needed an explicit distinct `sequence_code` — `stock.picking.type.copy()` doesn't give the copy its own sequence by default, so two independent copies collided on picking names until this was caught via a real integrity error. |
| `test_serial_lot_ids` | dropped | — | Redundant with the kept `onchange_lot_ids` tests — same lot_ids-driven line-creation/quantity mechanic on a plain unconfirmed move, a simpler duplicate of ground already covered. |
| `test_do_not_merge_deliveries_with_different_partner` | kept | `test_pushed_delivery_does_not_merge_across_different_partners` (`test_move.py`, `TestStockMoveMultiStep`) | Two picks pushed for different partners never merge into the same ship delivery — `partner_id` is part of what the system checks before attaching a newly-pushed move to an existing picking. |
| `test_description_picking_consistent_with_product_description` | kept (simplified) | `test_description_picking_follows_product_through_a_multistep_chain` (`test_transfer_flow.py`) | `description_picking` (defaulting from the product) carries through correctly to the next transfer in a multi-step reception chain. Simplified to not manually override the receipt's own description (which turned out to get copied verbatim onto the pushed move as a "manual" value, masking the point being tested — caught via a real assertion failure). |

## Cluster: `TestPickShipBackorder` (3 tests)

| Archived test | Decision | New test | Why |
|---|---|---|---|
| `test_pick_assign_and_backorder` | dropped | — | A messy integration test combining several already-individually-covered mechanics (lot splitting, backorder creation); its one distinguishing config (`create_backorder='always'`) isn't actually meaningfully exercised since the setup already needs a backorder anyway regardless of that setting. |
| `test_no_internal_note_as_picking_description` | kept | `test_product_internal_note_is_not_used_as_picking_description` (`test_transfer_flow.py`) | A product's general internal note never leaks into `description_picking` as a fallback — cheap, real, distinct regression guard. |
| `test_store_picking_description` | kept | `test_picking_description_is_only_stored_once_done_or_manually_set` (`test_transfer_flow.py`) | `description_picking_manual` is only persisted once done or manually overridden, otherwise stays computed. Natural pairing with the test above — both landed in a new "Picking/move description" section alongside `test_description_picking_follows_product_through_a_multistep_chain`. |

## Totals

87 archived tests decided: **37 kept/ported** (2 pairs merged into a single
host each — `test_merge_moves_1`+`_2`, `test_empty_moves_validation_1`+`_2` —
so 39 archived tests landed as those 37 new test methods, 2 of them picking
up an extra assertion rather than becoming a separate test), **48 dropped**.
0 left open. 37 new test methods added, matching the per-file deltas:
`test_move.py` +10 (`TestStockMove` +5, `TestStockMoveMultiStep` +5),
`test_transfer_flow.py` +17, `test_warehouse_routing.py` +7,
`test_lot_serial.py` +3. Real DB: full `/stock` tag **157/157 passing, 0
errors** at the end of the pass.

## Follow-up: real MTO-pull-chain coverage for the dropped `TestPickShip` MTO cluster

User pushback after this triage: the `test_mto_to_mts`/`_2`/`_3`,
`test_mto_moves_transfer`, and `test_mto_cancel_move_line` rows above are
still correctly dropped — their specific hand-wired premises genuinely don't
reproduce against real routing, as recorded. But the thing they were
*trying* to protect — a sale-like need triggering a real MTO pull chain,
i.e. a receipt automatically linked to a delivery — deserved a test built
the right way instead: via `stock.rule.run()` (the way `sale_stock` actually
creates a need), not a hand-wired move.

Added two `common.py` helpers: `_create_procurement(product, location,
quantity, **values)` (wraps `stock.rule.Procurement` + `stock.rule.run()`,
defaulting `values['warehouse_id']` to `self.warehouse` — mirrors
`sale_order_line._create_procurements()`'s own call shape) and
`_sell(product, quantity, **values)` (alias defaulting the need's location
to `self.customer_location` — the shape of need a confirmed sale order line
creates). Added one new test,
`test_sale_need_on_mto_resupplied_product_pulls_a_linked_receipt`, in
`test_warehouse_routing.py`'s `TestWarehouseRouting`, right after
`test_replenish_wizard_resupplies_from_another_warehouse` (same
2-warehouse-resupply fixture pattern): a product on `route_warehouse0_mto` +
a resupply-from-another-warehouse route, `self._sell()` for a quantity with
no stock anywhere in the main warehouse pulls a real 3-move chain end to
end (the other warehouse's own delivery → the main warehouse's receipt →
the original delivery, linked by the real pull rules, not hand-wired
`move_dest_ids`), validated step by step, finishing with the original
delivery actually `assigned` from stock that genuinely arrived through the
chain.

Real-DB gotcha hit along the way (see `SKILL.md` for the full account):
`stock.route_warehouse0_mto` ships with `active=False`; writing it onto
`product.route_ids` succeeds at the DB level, but reading the field back
afterward silently drops it (the ORM filters inactive related records on a
normal read), so `_get_rule()` fell through to the warehouse's own default
MTS pull rule and the delivery came back `make_to_stock` instead of
`make_to_order`. Fixed by explicitly setting `route_mto.active = True`
first — the same thing checking a product's "MTO" checkbox does for real,
since the route is shared/global rather than per-product.

This is new coverage added *after* the triage, not a correction of any
verdict in the table above. Real DB: isolated test 0 failed/0 errors; full
`/stock` tag **158/158 passing, 0 errors** (+1 from the 157 baseline).

## Follow-up 2: the MTO cluster's real premise, found after all — the rigid/all-pull delivery configuration

A first re-check of the dropped MTO cluster against the knowledge from
Follow-up 1 concluded "nothing to correct" — **that conclusion was wrong.**
It only considered the *default* delivery-steps configuration (first step
pull, every later step push) and the MTO-pull-to-a-resupply-receipt
configuration from Follow-up 1. User pointed at a third, real configuration:
`archive/test_old_rules.py` (not a `test_move2.py` file — a separate
still-present archived file, kept because "the old rules are still a valid
setup for multi-step routes"), where a warehouse's delivery route is
rewritten so **every** step, not just the first, is a real pull rule. This
is the "rigid process" setup some users still rely on so every document in
a multi-step delivery (pick, pack, ship) is generated upfront, fully linked,
as soon as the need exists — exactly what the archived `test_mto_to_mts`
cluster's hand-wired `create_pick_ship()` was modelling, just built for real
this time instead of hand-wired.

The one non-obvious piece: a rule's own `location_dest_id` stores the whole
route's *ultimate* destination (the customer), not its immediate next hop,
so every step but the first needs its `location_dest_id` narrowed to the
next step's own `location_src_id` too — otherwise every later step collides
with the first at the same lookup key and nothing downstream ever gets
created. Confirmed via a throwaway probe (`test_probe_old_rules.py`, added
to `tests/__init__.py` temporarily, removed once understood) before
touching real test files.

Re-probed all 5 originally-dropped tests against this real all-pull setup.
**4 of 5 reproduce exactly as the archived tests claimed:**
cancelling the pick reverts the ship to `make_to_stock`
(`_action_cancel()`'s non-`propagate_cancel` branch); moving either end of
the link — the pick's own destination, or the ship's own source — before
validating breaks it the same way (`stock_move.write()`'s
`move_to_check_location` handling); and once unblocked, the ship reserves
exactly what the pick delivered, not whatever else was already sitting at
the same output location (Follow-up 1's "falsified empirically" finding for
`test_mto_moves_transfer` was against the wrong, push-based setup).

Ported the 4 as a **new class**, `TestStockMoveMultiStepPull` in
`test_move.py` — sibling to the existing `TestStockMoveMultiStep` (same
"reservation across a real chained multi-step delivery" territory, just the
all-pull "rigid process" variant instead of the default push-based one).
Its `setUpClass` rewrites the shared `cls.warehouse`'s delivery route rules
to all-pull, the same pattern `TestStockMoveMultiStep` already uses for its
own warehouse config. (An earlier draft used a reusable `common.py` helper,
`_make_delivery_fully_pull(warehouse)`, called per test against a few
freshly-created throwaway warehouses instead — User: "Instead of using a
method `_make_delivery_fully_pull` use a new class with a specific setup
`TestStockMoveMultiStepPull`." The helper was removed entirely; `common.py`
gained no new helpers from this follow-up.)

5 tests total: the 4 revived ones, plus
`test_sale_need_creates_the_whole_chain_upfront_linked` making the "both
pick and ship exist upfront, already linked" premise the other 4 build on
explicit in its own right. Full list: `test_sale_need_creates_the_whole_chain_upfront_linked`,
`test_cancelling_the_pick_reverts_the_ship_to_mts`,
`test_moving_the_pick_off_its_destination_reverts_the_ship_to_mts`,
`test_moving_the_ship_off_its_source_reverts_it_to_mts`,
`test_ship_reserves_only_what_the_pick_delivered`.

The 5th dropped test, `test_mto_cancel_move_line`, also reproduces under
this same setup (confirmed via probe: partial pick delivery → backorder →
ship correctly reads `partially_available` with a 5-unit line) but was
deliberately **not** ported — its real lesson is a `_recompute_state()`
nuance (move state reacting to its origins' completion/backorder status)
that isn't actually specific to the pull-vs-push distinction this follow-up
is about. Left as a candidate for a possible separate pass.

`test_move.py` goes from 68 tests (62 `TestStockMove` + 6
`TestStockMoveMultiStep`) to **73 tests** (+5, the new
`TestStockMoveMultiStepPull`). Real DB: isolated `TestStockMoveMultiStepPull`
5/5 passing, 0 errors; full `/stock` tag **163/163 passing, 0 errors** (+5
from the 158 baseline above).

## Follow-up 3: folding dropped tests' residual lessons into existing tests

User noticed how many tests this triage dropped (48) and asked to check
whether any could be folded as an extra assertion onto an existing test
instead of staying dropped outright: "I saw you dropped a lot of tests
since it was an heavy overload for a small gain. Check if you could
include some in existing tests instead." Same spirit as the 2 merges
already done during the original pass (`test_merge_moves_1`+`_2`,
`test_empty_moves_validation_1`+`_2` above).

Went through every dropped row in the tables above looking for a
genuinely-distinct residual lesson with a cheap, non-disruptive host.
**Folded 2:**

- `test_merge_moves_never_attributes` - originally dropped as "a real,
  distinct merge-grouping-key nuance... but a niche feature... judged too
  narrow relative to the setup cost". Folded into the existing
  `test_same_product_moves_in_a_picking_merge_on_confirm`
  (`test_transfer_flow.py`): added a 4th move to that test's own picking -
  same product as the two that already merge, but carrying a no-variant
  product attribute value (`never_product_template_attribute_value_ids`)
  the others don't - plus one more assertion confirming it does *not*
  merge with them either, demonstrating that field is part of the merge
  key too, same as `product_id` itself.
- `test_unreservation_on_qty_decrease` - originally dropped as a "Dup in
  substance of `test_reservation_updates_with_move_quantity`'s 'shrinking
  unreserves in reverse removal-strategy order' lesson". Except that
  test's own docstring claimed exactly that, but its body, as written,
  only ever *grew* `move.quantity` (1→8 across 4 quants/lots/a package) -
  it never actually shrank it, so half of its own claim was never
  exercised. Extended it (`test_move.py`) with one more step: after the
  existing grow-to-8 assertion, shrink the same move back down to 4 and
  assert the two *last*-reserved lines (a single-unit lot line, and a
  packaged-lot line) are the ones that disappear first - reusing the
  exact same fixture already built, not a new one.

**Considered and rejected 2 more**, once checked against the candidate
host's own ending - not actually cheap:

- `test_no_backorder_1`'s residual bit ("cancelling a backorder doesn't
  disturb the ship it had already pushed") needs the *same* backorder pick
  that `test_backorder_pick_without_reference_pushes_its_own_ship`
  (`test_move.py`, `TestStockMoveMultiStep`) goes on to *validate* instead,
  to demonstrate a second ship - cancelling it there would contradict that
  test's own ending rather than extend it, and no other kept test has the
  right push-chain-plus-backorder shape to host it instead.
- `test_mto_moves_return_extra`'s residual bit ("returning more than was
  delivered merges the excess back into existing demand, capped at what
  was actually delivered") - no kept return test in `test_transfer_flow.py`
  had an ending that left room for a second return step without the same
  kind of conflict, and forcing a brand-new test for it would be exactly
  the "small gain, not worth it" problem User was pointing at.

**Not a fold candidate at all**, on reflection: `test_mtso_mto_adjust_01`
(the `mts_else_mto` rule option) - the archived test itself only ever
exercised the *boring* branch (enough stock, nothing interesting happens),
so there's no existing assertion anywhere to extend; the *interesting*
branch (insufficient stock forcing the fallback rule) was simply never
written by anyone. Noted as a possible future gap, not pursued here.

No new test methods added anywhere - `test_transfer_flow.py` (32 tests)
and `test_move.py` (73 tests) keep their exact same counts as before this
follow-up, only 2 existing tests grew by a few lines/assertions each. Real
DB: both touched tests pass in isolation; full `/stock` tag **163/163
passing, 0 errors** (unchanged from the Follow-up 2 baseline, as expected -
no tests added or removed, just two extended).
