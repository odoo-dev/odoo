# Part of Odoo. See LICENSE file for full copyright and licensing details.

from dateutil.relativedelta import relativedelta

from odoo import Command, fields
from odoo.exceptions import UserError
from odoo.tests import Form

from odoo.addons.stock.tests.common import TestStockCommon


class TestTransferFlow(TestStockCommon):
    """ `stock.picking`-level behavior: confirming, assigning, and validating a
    transfer, chaining pickings together (e.g. pick -> pack -> ship), and
    returns/exchanges.
    """

    _test_user_groups = ('stock.group_stock_user',)

    # ---- Immediate validate ----

    def test_validate_fully_available_picking_processes_directly(self):
        """ Validating a picking whose move is fully reserved just processes
        it directly - no wizard, nothing to ask about. """
        receipt = self._receipt(moves=[(self.product, 10)], validate=False)
        receipt.action_confirm()
        receipt.action_assign()

        action = receipt.button_validate()

        self.assertIs(action, True)
        self.assertEqual(receipt.state, 'done')
        self._check_inventory(self.product, {self.stock_location: 10})

    def test_backorder_wizard_opens_on_partial_availability(self):
        """ Validating a picking whose move is only partially reserved opens
        the backorder wizard; keeping the backorder processes what was
        available and leaves the remainder on a new picking. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 5)
        delivery = self._deliver(moves=[(self.product, 10)], validate=False)
        delivery.action_confirm()
        delivery.action_assign()

        action = delivery.button_validate()

        self.assertEqual(action.get('res_model'), 'stock.backorder.confirmation')
        self._process_backorder_wizard(action)

        self.assertEqual(delivery.move_ids.state, 'done')
        self.assertEqual(delivery.move_ids.quantity, 5)
        self._check_inventory(self.product, {self.stock_location: 0})
        backorder = self.env['stock.picking'].search([('backorder_id', '=', delivery.id)])
        self.assertEqual(len(backorder), 1)
        self.assertEqual(backorder.move_ids.product_uom_qty, 5)

    def test_validate_picking_with_mixed_availability_backorders_both_moves(self):
        """ A picking with two moves - one partially available, one totally
        unavailable - still opens a single backorder wizard for the whole
        picking; keeping it correctly splits the remainder of both moves
        into the backorder. """
        other_product = self._create_product(name='Other Product')
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        destination = self._create_location('Destination')
        transfer = self._create_picking(self.picking_type_int, moves=[
            (self.product, 100), (other_product, 100),
        ], location_dest_id=destination.id)
        transfer.action_confirm()
        transfer.action_assign()
        self.assertEqual(
            transfer.move_ids.filtered(lambda m: m.product_id == self.product).state, 'partially_available')
        self.assertEqual(
            transfer.move_ids.filtered(lambda m: m.product_id == other_product).state, 'confirmed')

        action = transfer.button_validate()
        self._process_backorder_wizard(action)

        backorder = self.env['stock.picking'].search([('backorder_id', '=', transfer.id)])
        self.assertEqual(len(backorder), 1)
        self.assertEqual(
            backorder.move_ids.filtered(lambda m: m.product_id == self.product).product_uom_qty, 99)
        self.assertEqual(
            backorder.move_ids.filtered(lambda m: m.product_id == other_product).product_uom_qty, 100)

    def test_validate_fully_available_lot_tracked_picking_processes_directly(self):
        """ Same as the untracked case - a lot-tracked move that's fully
        reserved validates directly, no wizard, and the lot carries through
        to the move line untouched. """
        lot = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 5, lot_id=lot)
        delivery = self._deliver(moves=[(self.product_lot, 5)], validate=False)
        delivery.action_confirm()
        delivery.action_assign()

        action = delivery.button_validate()

        self.assertIs(action, True)
        self.assertEqual(delivery.move_ids.quantity, 5)
        self.assertEqual(len(delivery.move_ids.move_line_ids), 1)
        self.assertEqual(delivery.move_ids.move_line_ids.lot_id, lot)
        self._check_inventory(self.product_lot, {self.stock_location: 0})

    def test_validate_tracked_receipt_requires_lots_unless_picking_type_waives_it(self):
        """ Validating a receipt of tracked products with no serial numbers
        or lots assigned raises a UserError - unless the picking type
        doesn't require assigning new or existing lots/serials at all, in
        which case the done quantity auto-fulfills instead. """
        self.assertTrue(self.picking_type_in.use_create_lots or self.picking_type_in.use_existing_lots)
        with self.assertRaises(UserError):
            self._receipt(moves=[(self.product_serial, 5)])

        self.picking_type_in.with_user(self.user_stock_manager).write({
            'use_create_lots': False,
            'use_existing_lots': False,
        })

        receipt = self._receipt(moves=[(self.product_serial, 4), (self.product_lot, 20)])

        self.assertEqual(receipt.state, 'done')

    def test_validate_tracked_receipt_blocks_until_lot_assigned_then_backorders(self):
        """ A receipt mixing an untracked and a lot-tracked move can't be
        validated until the tracked move actually has a lot - merely
        marking it picked isn't enough. Once a lot is assigned, validating
        proceeds to the backorder wizard (the untracked move was never
        marked picked, so it's left for a backorder rather than silently
        auto-completed). """
        self.picking_type_in.with_user(self.user_stock_manager).write({
            'use_create_lots': True,
            'use_existing_lots': False,
        })
        receipt = self._receipt(moves=[
            (self.product, 1), (self.product_lot, 1),
        ], validate=False)
        lot_move = receipt.move_ids.filtered(lambda m: m.product_id == self.product_lot)
        receipt.action_confirm()
        receipt.action_assign()

        with self.assertRaises(UserError):
            receipt.button_validate()

        lot_move.picked = True
        with self.assertRaises(UserError):
            receipt.button_validate()

        lot_move.move_line_ids.lot_name = 'lot1'
        action = receipt.button_validate()

        self.assertEqual(action.get('res_model'), 'stock.backorder.confirmation')

    def test_validate_unavailable_picking_raises_error(self):
        """ Validating a picking whose move has nothing reserved at all
        raises a UserError - there's no processed quantity to confirm. """
        with self.assertRaises(UserError):
            self._deliver(moves=[(self.product, 10)])

    def test_validate_picking_with_only_zero_demand_moves(self):
        """ Validating a picking whose moves all have zero demand and
        nothing done raises a UserError - there's nothing to confirm.
        Giving one of them a done quantity instead processes that one
        and cancels the other, with no backorder. """
        other_product = self._create_product(name='Other Product')
        empty_delivery = self._create_picking(self.picking_type_out, moves=[(self.product, 0), (other_product, 0)])
        empty_delivery.action_confirm()
        empty_delivery.action_assign()
        with self.assertRaises(UserError):
            empty_delivery.button_validate()

        delivery = self._create_picking(self.picking_type_out, moves=[(self.product, 0), (other_product, 0)])
        delivery.action_confirm()
        delivery.action_assign()
        move_with_quantity = delivery.move_ids.filtered(lambda m: m.product_id == self.product)
        move_with_quantity.quantity = 1
        move_with_quantity.picked = True

        delivery.button_validate()

        self.assertEqual(move_with_quantity.state, 'done')
        self.assertEqual(
            delivery.move_ids.filtered(lambda m: m.product_id == other_product).state, 'cancel')
        self.assertFalse(self.env['stock.picking'].search([('backorder_id', '=', delivery.id)]))

    def test_cancelling_backorder_cancels_the_unprocessed_move(self):
        """ Cancelling the backorder wizard (rather than keeping it)
        cancels the move that had nothing processed at all - it doesn't
        just skip it. """
        other_product = self._create_product(name='Other Product')
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 2)
        self.env['stock.quant']._update_available_quantity(other_product, self.stock_location, 2)
        delivery = self._create_picking(self.picking_type_out, moves=[(self.product, 2), (other_product, 2)])
        delivery.action_confirm()
        delivery.action_assign()

        move_to_process = delivery.move_ids.filtered(lambda m: m.product_id == self.product)
        move_to_skip = delivery.move_ids.filtered(lambda m: m.product_id == other_product)
        move_to_process.picked = True
        move_to_skip.quantity = 0

        action = delivery.button_validate()
        self._process_backorder_wizard(action, cancel_backorder=True)

        self.assertFalse(self.env['stock.picking'].search([('backorder_id', '=', delivery.id)]))
        self.assertEqual(delivery.state, 'done')
        self.assertEqual(move_to_skip.state, 'cancel')

    def test_validating_an_already_done_picking_is_a_noop(self):
        """ Calling `button_validate()` a second time on an already-done
        picking is a no-op - it doesn't error, and doesn't redo
        anything. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 50)
        delivery = self._deliver(moves=[(self.product, 50)])
        self.assertRecordValues(delivery.move_ids, [{'quantity': 50.0, 'state': 'done'}])

        delivery.button_validate()

        self.assertEqual(delivery.state, 'done')
        self.assertRecordValues(delivery.move_ids, [{'quantity': 50.0, 'state': 'done'}])

    def test_validate_multiple_pickings_at_once(self):
        """ Calling `button_validate()` on a recordset of several pickings
        at once validates all of them. """
        receipt1 = self._receipt(moves=[(self.product, 10)], validate=False)
        receipt1.action_confirm()
        receipt2 = self._receipt(moves=[(self.product, 10)], validate=False)
        receipt2.action_confirm()

        (receipt1 | receipt2).button_validate()

        self.assertEqual(receipt1.state, 'done')
        self.assertEqual(receipt2.state, 'done')

    def test_validate_fully_reserved_tracked_transfer_skips_backorder_wizard(self):
        """ Validating a fully-reserved tracked (lot) transfer processes it
        directly - the backorder wizard is only for genuinely short
        quantities, not just because the product happens to be tracked. """
        self.picking_type_int.with_user(self.user_stock_manager).write({
            'use_create_lots': True,
            'use_existing_lots': True,
        })
        lot = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 10, lot_id=lot)
        destination = self._create_location('Destination')
        transfer = self._create_picking(
            self.picking_type_int, moves=[(self.product_lot, 4)], location_dest_id=destination.id)
        transfer.action_confirm()

        action = transfer.button_validate()

        self.assertIs(action, True)
        self.assertEqual(transfer.state, 'done')

    # ---- Shipping policy ----

    def test_increasing_demand_past_available_stock_ships_partial_asap(self):
        """ With the "as soon as possible" shipping policy, growing a
        delivery's demand past what's currently reserved still leaves it
        ready - some of it can ship right away; the rest needs a manual
        re-assign once more stock is available. Shrinking demand back down
        below what's reserved unreserves the excess and needs a manual
        re-assign too - a delivery (unlike a receipt) never auto-reassigns
        itself on a demand edit, whichever direction it goes. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 12)
        delivery = self._deliver(moves=[(self.product, 10)], validate=False)
        delivery.move_type = 'direct'
        delivery.action_confirm()
        delivery.action_assign()
        self.assertEqual(delivery.state, 'assigned')

        delivery.move_ids.product_uom_qty = 12

        self.assertEqual(delivery.move_ids.state, 'partially_available')
        self.assertEqual(delivery.state, 'assigned')

        delivery.action_assign()

        self.assertEqual(delivery.move_ids.state, 'assigned')
        self.assertEqual(delivery.state, 'assigned')

        delivery.move_ids.product_uom_qty = 6

        self.assertEqual(delivery.move_ids.state, 'confirmed')
        self.assertEqual(delivery.state, 'confirmed')

        delivery.action_assign()

        self.assertEqual(delivery.move_ids.state, 'assigned')
        self.assertEqual(delivery.move_ids.quantity, 6)
        self.assertEqual(delivery.state, 'assigned')

    def test_increasing_demand_past_available_stock_waits_all_at_once(self):
        """ Same scenario, "all at once" shipping policy instead: a
        partially-available move isn't good enough to ship anything, so
        the delivery itself shows as not ready at all - until a manual
        re-assign picks up the rest. Shrinking demand back down below
        what's reserved unreserves the excess and needs a manual
        re-assign too, same as the "as soon as possible" case - the
        shipping policy only changes how a *partial* reservation is
        read, not whether an edit auto-reassigns. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 12)
        delivery = self._deliver(moves=[(self.product, 10)], validate=False)
        delivery.move_type = 'one'
        delivery.action_confirm()
        delivery.action_assign()
        self.assertEqual(delivery.state, 'assigned')

        delivery.move_ids.product_uom_qty = 12

        self.assertEqual(delivery.move_ids.state, 'partially_available')
        self.assertEqual(delivery.state, 'confirmed')

        delivery.action_assign()

        self.assertEqual(delivery.move_ids.state, 'assigned')
        self.assertEqual(delivery.state, 'assigned')

        delivery.move_ids.product_uom_qty = 6

        self.assertEqual(delivery.move_ids.state, 'confirmed')
        self.assertEqual(delivery.state, 'confirmed')

        delivery.action_assign()

        self.assertEqual(delivery.move_ids.state, 'assigned')
        self.assertEqual(delivery.move_ids.quantity, 6)
        self.assertEqual(delivery.state, 'assigned')

    # ---- Scheduling & deadlines ----

    def test_picking_scheduled_date_follows_earliest_move_backorder_inherits_the_rest(self):
        """ A picking's scheduled date is its earliest move's date; a
        backorder created from a partial validation inherits the
        remaining move's own date instead. """
        today = fields.Datetime.today()
        consumable = self._create_product(name='Consumable', is_storable=False)
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        delivery = self._create_picking(self.picking_type_out, moves=[(self.product, 1), (consumable, 1)])
        move_product = delivery.move_ids.filtered(lambda m: m.product_id == self.product)
        move_consumable = delivery.move_ids.filtered(lambda m: m.product_id == consumable)
        move_product.date = today + relativedelta(days=5)
        move_consumable.date = today + relativedelta(days=10)
        self.assertEqual(delivery.scheduled_date, today + relativedelta(days=5))

        self._validate_picking(delivery, quantities={move_product: 1, move_consumable: 0})

        backorder = delivery.backorder_ids
        self.assertEqual(delivery.scheduled_date, today + relativedelta(days=5))
        self.assertEqual(backorder.scheduled_date, today + relativedelta(days=10))

    # ---- Reservation priority across pickings ----

    def test_scrap_unreserves_the_picking_scheduled_furthest_in_the_future(self):
        """ When stock becomes insufficient for several reserved
        deliveries, the one scheduled furthest in the future gives up its
        reservation first - not the one scheduled soonest. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 5)
        today = fields.Datetime.now()
        early_delivery = self._deliver(moves=[(self.product, 2)], validate=False)
        early_delivery.move_ids.date = today
        early_delivery.action_confirm()
        late_delivery = self._deliver(moves=[(self.product, 3)], validate=False)
        late_delivery.move_ids.date = today + relativedelta(days=5)
        late_delivery.action_confirm()
        self.assertEqual(early_delivery.move_ids.state, 'assigned')
        self.assertEqual(late_delivery.move_ids.state, 'assigned')

        self._scrap(self.product, 2)

        self.assertEqual(early_delivery.move_ids.state, 'assigned')
        self.assertEqual(late_delivery.move_ids.state, 'partially_available')

    # ---- Splitting a transfer ----

    def test_move_state_after_split(self):
        """ `action_split_transfer()` splits a partially-reserved move's
        unmet demand off into a backorder, recomputing states on both
        sides. """
        delivery = self._deliver(moves=[(self.product, 10)], validate=False)
        self.assertEqual(delivery.move_ids.forecast_availability, -10)

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        self.env.invalidate_all()
        self.assertEqual(delivery.move_ids.forecast_availability, 10)

        delivery.action_confirm()
        self.assertEqual(delivery.move_ids.state, 'assigned')

        delivery.move_ids.quantity = 4
        self.assertEqual(delivery.move_ids.state, 'partially_available')

        delivery.action_split_transfer()

        self.assertEqual(len(delivery.move_ids), 1)
        self.assertEqual(delivery.move_ids.product_uom_qty, 4)
        self.assertEqual(delivery.move_ids.state, 'assigned')

        backorder = delivery.backorder_ids
        self.assertEqual(backorder.move_ids.product_uom_qty, 6)
        self.assertEqual(backorder.move_ids.quantity, 6)
        self.assertEqual(backorder.move_ids.state, 'assigned')

    # ---- Editing a done picking ----

    def test_adding_a_move_line_to_a_picking_creates_its_move(self):
        """ Creating a `stock.move.line` directly on a picking (no `move_id`
        set) auto-generates the `stock.move` for it - both while the
        picking is still in progress (if no existing move for that product
        can be linked to instead) and once it's already done (always, even
        for a product that already has a move here). """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 2)
        other_product = self._create_product(name='Other Product')
        self.env['stock.quant']._update_available_quantity(other_product, self.stock_location, 1)
        delivery = self._deliver(moves=[(self.product, 1)], validate=False)
        delivery.action_confirm()
        self.assertEqual(len(delivery.move_ids), 1)

        self.env['stock.move.line'].create({
            'picking_id': delivery.id,
            'product_id': other_product.id,
            'uom_id': other_product.uom_id.id,
            'quantity': 1,
            'location_id': self.stock_location.id,
            'location_dest_id': self.customer_location.id,
        })

        self.assertEqual(len(delivery.move_ids), 2)
        added_before_done = delivery.move_ids.filtered(lambda m: m.product_id == other_product)
        self.assertNotEqual(added_before_done.state, 'done')

        self._validate_picking(delivery, confirm=False)

        self.assertEqual(delivery.state, 'done')

        self.env['stock.move.line'].create({
            'picking_id': delivery.id,
            'product_id': self.product.id,
            'uom_id': self.product.uom_id.id,
            'quantity': 1,
            'location_id': self.stock_location.id,
            'location_dest_id': self.customer_location.id,
        })

        self.assertEqual(len(delivery.move_ids), 3)
        added_after_done = delivery.move_ids.filtered(lambda m: m.product_id == self.product)
        self.assertEqual(len(added_after_done), 2)
        self.assertTrue(all(move.state == 'done' for move in added_after_done))

    def test_picking_location_change_propagates_to_its_moves(self):
        """ Editing a picking's own source/destination location updates
        the moves it already holds to match. """
        new_location = self._create_location('New Source')
        new_destination = self._create_location('New Destination')
        picking = self._create_picking(self.picking_type_int, moves=[(self.product, 3)])

        picking.write({'location_id': new_location.id, 'location_dest_id': new_destination.id})

        self.assertRecordValues(picking.move_ids, [
            {'location_id': new_location.id, 'location_dest_id': new_destination.id},
        ])

    # ---- Merging moves ----

    def test_same_product_moves_in_a_picking_merge_on_confirm(self):
        """ Several moves for the same product, locations, and picking
        type merge into one on confirm, summing their demand and
        combining their origin - a move for a different product stays
        separate, and so does one carrying a no-variant attribute value the
        others don't: that's part of the merge key too, same as the
        product itself. """
        other_product = self._create_product(name='Other Product')
        attribute = self.env['product.attribute'].with_user(self.user_stock_manager).create({
            'name': 'Engraving', 'create_variant': 'no_variant',
        })
        attribute_value = self.env['product.attribute.value'].with_user(self.user_stock_manager).create({
            'name': 'Custom', 'attribute_id': attribute.id,
        })
        attribute_line = self.env['product.template.attribute.line'].with_user(self.user_stock_manager).create({
            'attribute_id': attribute.id,
            'product_tmpl_id': self.product.product_tmpl_id.id,
            'value_ids': [Command.link(attribute_value.id)],
        })
        never_value = attribute_line.product_template_value_ids
        picking = self._create_picking(self.picking_type_in, moves=[
            {'product_id': self.product.id, 'product_uom_qty': 3, 'uom_id': self.product.uom_id.id,
             'location_id': self.supplier_location.id, 'location_dest_id': self.stock_location.id, 'origin': 'MPS'},
            {'product_id': self.product.id, 'product_uom_qty': 5, 'uom_id': self.product.uom_id.id,
             'location_id': self.supplier_location.id, 'location_dest_id': self.stock_location.id, 'origin': 'PO0001'},
            {'product_id': other_product.id, 'product_uom_qty': 5, 'uom_id': other_product.uom_id.id,
             'location_id': self.supplier_location.id, 'location_dest_id': self.stock_location.id},
            {'product_id': self.product.id, 'product_uom_qty': 1, 'uom_id': self.product.uom_id.id,
             'location_id': self.supplier_location.id, 'location_dest_id': self.stock_location.id,
             'never_product_template_attribute_value_ids': [Command.link(never_value.id)]},
        ])

        picking.action_confirm()

        self.assertEqual(len(picking.move_ids), 3)
        merged_move = picking.move_ids.filtered(
            lambda m: m.product_id == self.product and not m.never_product_template_attribute_value_ids)
        self.assertEqual(merged_move.product_uom_qty, 8)
        self.assertIn('MPS', merged_move.origin)
        self.assertIn('PO0001', merged_move.origin)
        self.assertEqual(picking.move_ids.filtered(lambda m: m.product_id == other_product).product_uom_qty, 5)
        engraved_move = picking.move_ids.filtered(lambda m: m.never_product_template_attribute_value_ids)
        self.assertEqual(engraved_move.product_uom_qty, 1)

    def test_move_added_after_confirm_does_not_merge_with_existing_move(self):
        """ A move added directly to an already-confirmed picking doesn't
        retroactively merge with an existing move of the same product -
        merging only happens at confirm time. """
        delivery = self._deliver(moves=[(self.product, 5)], validate=False)
        delivery.action_confirm()

        delivery.write({'move_ids': [Command.create({
            'product_id': self.product.id,
            'product_uom_qty': 0,
            'uom_id': self.product.uom_id.id,
            'location_id': delivery.location_id.id,
            'location_dest_id': delivery.location_dest_id.id,
        })]})

        self.assertEqual(len(delivery.move_ids), 2)

    def test_merge_move_mto_mts_does_not_merge(self):
        """ Two moves for the same product in the same picking, one
        make-to-order and one make-to-stock, never merge - the procure
        method is part of what makes two moves "the same" for merging
        purposes. """
        ship = self._create_picking(self.picking_type_out, moves=[(self.product, 3)])
        ship.move_ids.procure_method = 'make_to_order'
        self.env['stock.move'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'product_uom_qty': 3,
            'uom_id': self.product.uom_id.id,
            'picking_id': ship.id,
            'location_id': ship.location_id.id,
            'location_dest_id': ship.location_dest_id.id,
            'procure_method': 'make_to_stock',
        })

        ship.action_confirm()

        self.assertEqual(len(ship.move_ids), 2)

    # ---- Returns ----

    def test_mto_partial_return_unreserves_the_downstream_ship(self):
        """ Returning only part of what a pick delivered un-reserves the
        downstream ship by exactly that much - it was only ever reserved
        because the pick delivered it in the first place. """
        self.warehouse.with_user(self.user_stock_manager).write({'delivery_steps': 'pick_ship'})
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        pick = self._create_picking(self.warehouse.pick_type_id, moves=[(self.product, 10)])
        self._validate_picking(pick)
        ship = pick.move_ids.move_dest_ids.picking_id
        self.assertEqual(ship.state, 'assigned')

        return_pick = pick._create_return()
        return_pick.move_ids.product_uom_qty = 2.0
        self._validate_picking(return_pick)

        self.assertEqual(ship.state, 'confirmed')

    def test_returning_each_leg_of_a_chain_separately_links_the_returns(self):
        """ Returning the pick and the ship of a chain *independently*
        (not as one combined return) still links the two return pickings
        together the same way the originals were - the ship's return
        becomes the pick's return's own origin. """
        self.warehouse.with_user(self.user_stock_manager).write({'delivery_steps': 'pick_ship'})
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        pick = self._create_picking(self.warehouse.pick_type_id, moves=[(self.product, 10)])
        self._validate_picking(pick)
        ship = pick.move_ids.move_dest_ids.picking_id
        self._validate_picking(ship)

        return_pick = pick._create_return()
        return_ship = ship._create_return()

        self.assertIn(return_ship.move_ids.id, return_pick.move_ids.move_orig_ids.ids)
        self.assertIn(return_pick.move_ids.id, return_ship.move_ids.move_dest_ids.ids)

    def test_return_all_computes_remaining_quantity_after_partial_return(self):
        """ `action_return_all()` computes exactly what's left to return
        for every product, after an earlier return already took back
        part of one of them. """
        other_product = self._create_product(name='Other Product')
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        self.env['stock.quant']._update_available_quantity(other_product, self.stock_location, 11)
        delivery = self._deliver(moves=[(self.product, 10), (other_product, 11)])

        return_pick = delivery._create_return()
        return_pick.move_ids.filtered(lambda m: m.product_id == other_product).product_uom_qty = 5.0
        return_pick.move_ids = return_pick.move_ids.filtered(lambda m: m.product_uom_qty > 0)
        self._validate_picking(return_pick)

        return_leftovers = delivery._create_return()
        return_leftovers.action_return_all()

        self.assertRecordValues(return_leftovers.move_ids.sorted('product_uom_qty'), [
            {'product_id': other_product.id, 'product_uom_qty': 6},
            {'product_id': self.product.id, 'product_uom_qty': 10},
        ])

    def test_return_to_a_different_location_than_the_original_source(self):
        """ Returning part of a delivery to its original source location,
        and the rest to a different location entirely (even one in
        another warehouse), correctly splits the quantity and lands each
        part in the right place. """
        return_warehouse = self.env['stock.warehouse'].with_user(self.user_stock_manager).create(
            {'name': 'Return Warehouse', 'code': 'RW'})
        return_location = self._create_location('Return', parent_location=return_warehouse.view_location_id)
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        delivery = self._deliver(moves=[(self.product, 10)])

        return_to_source = delivery._create_return()
        return_to_source.move_ids.product_uom_qty = 5.0
        self._validate_picking(return_to_source)

        return_elsewhere = delivery._create_return()
        return_elsewhere.location_dest_id = return_location
        return_elsewhere.move_ids.product_uom_qty = 5.0
        self._validate_picking(return_elsewhere)

        self._check_inventory(self.product, {self.stock_location: 5, return_location: 5})

    def test_return_suggests_the_lots_actually_taken_by_the_picking(self):
        """ `_create_return()` suggests exactly the lot (and quantity) the
        picking actually took - following FIFO, not just any lot of the
        product. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_lot.id})
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 4, lot_id=lot1)
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 4, lot_id=lot2)
        self._deliver(moves=[(self.product_lot, 4)])
        delivery = self._deliver(moves=[(self.product_lot, 4)])
        self.assertRecordValues(delivery.move_line_ids, [{'lot_id': lot2.id, 'quantity': 4.0}])

        return_pick = delivery._create_return()
        return_pick.move_ids.product_uom_qty = 4.0
        return_pick.action_assign()

        self.assertRecordValues(return_pick.move_line_ids, [{'lot_id': lot2.id, 'quantity': 4.0}])

    # ---- Picking/move description ----

    def test_description_picking_follows_product_through_a_multistep_chain(self):
        """ A move's `description_picking` (defaulting from the product's
        own description) carries through correctly to the next transfer
        in a multi-step reception chain, not just the one it's created
        on. """
        self.warehouse.with_user(self.user_stock_manager).write({'reception_steps': 'two_steps'})
        self.product.with_user(self.user_stock_manager).product_tmpl_id.description_picking = 'transfer'
        receipt = self._create_picking(self.picking_type_in, moves=[(self.product, 1)])
        self._validate_picking(receipt)

        next_picking = receipt._get_next_transfers()
        self.assertEqual(next_picking.move_ids.description_picking, 'transfer')

    def test_product_internal_note_is_not_used_as_picking_description(self):
        """ A product's general internal note never leaks into
        `description_picking` as a fallback - the two fields are
        unrelated. """
        self.product.with_user(self.user_stock_manager).description = 'THIS SHOULD NEVER APPEAR ON A PICKING'
        picking = self._create_picking(self.picking_type_in, moves=[(self.product, 1)])

        self.assertEqual(picking.move_ids.description_picking, self.product.display_name)

    def test_picking_description_is_only_stored_once_done_or_manually_set(self):
        """ `description_picking_manual` only gets persisted once the
        picking is actually done, or when it was manually overridden - a
        plain default value stays computed (not stored) until then. """
        self.product.with_user(self.user_stock_manager).product_tmpl_id.description_pickingout = 'DELIVERY'
        delivery = self._create_picking(self.picking_type_out, moves=[
            (self.product, 1),
            {
                'product_id': self.product.id,
                'product_uom_qty': 1,
                'uom_id': self.product.uom_id.id,
                'location_id': self.stock_location.id,
                'location_dest_id': self.customer_location.id,
                'description_picking': 'EXTRA DELIVERY',
            },
        ])

        self.assertFalse(delivery.move_ids[0].description_picking_manual)
        self.assertEqual(delivery.move_ids[1].description_picking_manual, 'EXTRA DELIVERY')

        delivery.action_confirm()
        self.assertFalse(delivery.move_ids[0].description_picking_manual)

        delivery.move_ids.quantity = 1
        delivery.button_validate()

        self.assertEqual(delivery.move_ids[0].description_picking_manual, 'DELIVERY')
        self.assertEqual(delivery.move_ids[1].description_picking_manual, 'EXTRA DELIVERY')

    # ---- Default locations from operation type / contact ----

    def test_picking_destination_from_operation_type_and_contact(self):
        """ Check which destination a delivery gets when both its
        operation type and its contact define one - the contact's own
        stock location wins over the operation type's generic default,
        except for a sibling-company contact (a transit location), and a
        contact with no stock location of its own falls back to the
        operation type's default. """
        customer_stock, customer_location, transit_location = self.env['stock.location'].with_user(
            self.user_stock_manager).create([
            {'name': 'Customer stock', 'usage': 'customer', 'location_id': self.customer_location.id},
            {'name': 'Customer location', 'usage': 'customer', 'location_id': self.customer_location.id},
            {'name': 'Inter-warehouse transit', 'usage': 'transit', 'location_id': self.stock_location.id},
        ])
        custom_delivery_type = self.env['stock.picking.type'].with_user(self.user_stock_manager).create({
            'name': 'Deliver Super Customer',
            'code': 'outgoing',
            'sequence_code': 'DSC',
            'warehouse_id': self.warehouse.id,
            'default_location_src_id': self.warehouse.lot_stock_id.id,
            'default_location_dest_id': customer_stock.id,
        })
        delivery_type = self.picking_type_out
        customer, sibling_company = self.env['res.partner'].with_user(self.user_stock_manager).create([
            {'name': 'Customer', 'property_stock_customer': customer_location.id},
            {'name': 'Sibling company', 'property_stock_customer': transit_location.id},
        ])
        customer_without_location = self.env['res.partner'].with_user(self.user_stock_manager).create(
            {'name': 'Customer without location'})
        for picking_type, contact, expected_location in [
            (delivery_type, customer, customer_location),
            (delivery_type, sibling_company, transit_location),
            (custom_delivery_type, customer_without_location, customer_stock),
            (custom_delivery_type, customer, customer_location),
        ]:
            with self.subTest(operation_type=picking_type.name, contact=contact.name):
                picking_form = Form(self.env['stock.picking'].with_context(default_picking_type_id=picking_type.id))
                picking_form.partner_id = contact
                self.assertEqual(picking_form.save().location_dest_id, expected_location)

    def test_picking_source_from_operation_type_and_contact(self):
        """ Same check, mirrored for a receipt's source location. """
        vendor_stock, vendor_location, transit_location = self.env['stock.location'].with_user(
            self.user_stock_manager).create([
            {'name': 'Vendor stock', 'usage': 'supplier', 'location_id': self.supplier_location.id},
            {'name': 'Vendor location', 'usage': 'supplier', 'location_id': self.supplier_location.id},
            {'name': 'Inter-warehouse transit', 'usage': 'transit', 'location_id': self.stock_location.id},
        ])
        custom_receipt_type = self.env['stock.picking.type'].with_user(self.user_stock_manager).create({
            'name': 'Receive Super Vendor',
            'code': 'incoming',
            'sequence_code': 'RSV',
            'warehouse_id': self.warehouse.id,
            'default_location_src_id': vendor_stock.id,
            'default_location_dest_id': self.warehouse.lot_stock_id.id,
        })
        receipt_type = self.picking_type_in
        vendor, sibling_company = self.env['res.partner'].with_user(self.user_stock_manager).create([
            {'name': 'Vendor', 'property_stock_supplier': vendor_location.id},
            {'name': 'Sibling company', 'property_stock_supplier': transit_location.id},
        ])
        vendor_without_location = self.env['res.partner'].with_user(self.user_stock_manager).create(
            {'name': 'Vendor without location'})
        for picking_type, contact, expected_location in [
            (receipt_type, vendor, vendor_location),
            (receipt_type, sibling_company, transit_location),
            (custom_receipt_type, vendor_without_location, vendor_stock),
            (custom_receipt_type, vendor, vendor_location),
        ]:
            with self.subTest(operation_type=picking_type.name, contact=contact.name):
                picking_form = Form(self.env['stock.picking'].with_context(default_picking_type_id=picking_type.id))
                picking_form.partner_id = contact
                self.assertEqual(picking_form.save().location_id, expected_location)
