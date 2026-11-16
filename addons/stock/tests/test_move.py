# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from odoo import Command
from odoo.exceptions import UserError
from odoo.fields import Date, Datetime
from odoo.tests import Form

from odoo.addons.stock.tests.common import TestStockCommon


class TestStockMove(TestStockCommon):
    """ `stock.move`/`stock.move.line`-level mechanics: reservation, removal
    strategy, UoM conversion, editing a reserved or a done move - without
    going through a full picking flow.
    """

    # Most of this file doesn't need Administrator access - default the test
    # user to a regular Inventory/User, and override with
    # `@users('stock_manager')` (from odoo.tests) on the specific tests that
    # do need it.
    _test_user_groups = ('stock.group_stock_user',)

    # ---- Basic in/out lifecycle ----

    def test_receive(self):
        """ Receiving a product reserves the full quantity on a single move
        line and, once done, moves it out of the supplier location (which can
        go negative) into the destination location. """
        move = self._in_move(self.product, product_uom_qty=5)

        self.assertEqual(len(move.move_line_ids), 1)
        self.assertEqual(move.state, 'done')
        self._check_inventory(self.product, {
            self.supplier_location: -5,
            self.stock_location: 5,
        })

    def test_receive_lot(self):
        """ Receiving a lot-tracked product creates a single move line for the
        full quantity, and assigning it a lot name on receipt creates a quant
        under that lot, with the reception date recorded. """
        move = self._in_move(self.product_lot, lot_names=['lot'], product_uom_qty=5)

        self.assertEqual(len(move.move_line_ids), 1)
        lot = move.move_line_ids.lot_id
        self.assertTrue(lot)
        self._check_inventory(self.product_lot, {self.stock_location: 5}, lot=lot)
        quant = self.env['stock.quant']._gather(self.product_lot, self.stock_location, lot_id=lot)
        self.assertTrue(quant.in_date)

    def test_receive_serial(self):
        """ Receiving several units of a serial-tracked product creates one
        move line per unit, each ending up as its own 1-unit quant once a
        serial name is assigned. """
        move = self._in_move(
            self.product_serial, lot_names=[f'sn{index}' for index in range(5)], product_uom_qty=5)

        self.assertEqual(len(move.move_line_ids), 5)
        for move_line in move.move_line_ids:
            self._check_inventory(self.product_serial, {self.stock_location: 1}, lot=move_line.lot_id)

    def test_deliver(self):
        """ Delivering a product reserves it from stock on a single move line
        and, once done, moves the quant from stock to the customer location. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 5)
        move = self._out_move(self.product, product_uom_qty=5)

        self.assertEqual(len(move.move_line_ids), 1)
        self.assertEqual(move.state, 'done')
        self._check_inventory(self.product, {
            self.stock_location: 0,
            self.customer_location: 5,
        })

    def test_deliver_non_storable(self):
        """ Delivering a non-storable (consumable) product still creates and
        validates a move line, but doesn't touch any quant - consumables aren't
        tracked in stock. """
        product = self._create_product(name='Test Consumable', is_storable=False)
        move = self._out_move(product, product_uom_qty=5)

        self.assertEqual(len(move.move_line_ids), 1)
        self.assertEqual(move.state, 'done')
        self._check_inventory(product, {
            self.stock_location: 0,
            self.customer_location: 0,
        })

    def test_deliver_without_stock(self):
        """ Forcing a delivery through with no stock available at all creates
        a negative quant at the source location, same as a receipt does at
        the supplier location. """
        move = self._out_move(self.product, product_uom_qty=5, validate=False)
        self._validate_move(move, quantity=5)

        self.assertEqual(move.state, 'done')
        self._check_inventory(self.product, {
            self.stock_location: -5,
            self.customer_location: 5,
        })

    def test_receive_with_owner_carries_owner_to_quant(self):
        """ Receiving on behalf of an explicit owner carries that owner
        through to both the supplier's negative quant and the stock
        quant it lands in. """
        owner = self.env['res.partner'].with_user(self.user_stock_manager).create({'name': 'Owner'})
        receipt = self._create_picking(self.picking_type_in, moves=[(self.product, 1)], owner_id=owner.id)
        self._validate_picking(receipt)

        self._check_inventory(self.product, {self.supplier_location: -1}, owner=owner)
        self._check_inventory(self.product, {self.stock_location: 1}, owner=owner)

    # ---- Lot/quant display fields ----

    def test_show_quant_and_lot_fields_depend_on_picking_type_lot_settings(self):
        """ `show_quant`/`show_lots_text`/`show_lots_m2o` depend on the
        picking direction, the product's tracking, and whether the picking
        type allows creating and/or picking existing lots. """
        self.picking_type_in.with_user(self.user_stock_manager).write(
            {'use_create_lots': True, 'use_existing_lots': True})
        incoming_lot_move = self._create_move(self.product_lot, self.supplier_location, self.stock_location, product_uom_qty=5)

        self.picking_type_out.with_user(self.user_stock_manager).write(
            {'use_create_lots': True, 'use_existing_lots': False})
        outgoing_untracked_move = self._create_move(self.product, self.stock_location, self.customer_location, product_uom_qty=1)
        outgoing_lot_move = self._create_move(self.product_lot, self.stock_location, self.customer_location, product_uom_qty=1)

        self.assertRecordValues(incoming_lot_move, [
            {'show_quant': False, 'show_lots_text': False, 'show_lots_m2o': True},
        ])
        self.assertRecordValues(outgoing_untracked_move, [
            {'show_quant': True, 'show_lots_text': False, 'show_lots_m2o': False},
        ])
        self.assertRecordValues(outgoing_lot_move, [
            {'show_quant': False, 'show_lots_text': True, 'show_lots_m2o': False},
        ])

    # ---- Availability / reservation ----

    def test_availability_enough_stock(self):
        """ A move's `availability` reports the full demand when there's
        enough stock to cover it. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 150)
        move = self._out_move(self.product, product_uom_qty=100, validate=False)
        self.assertEqual(move.availability, 100)

    def test_availability_not_enough_stock(self):
        """ A move's `availability` reports only what's actually in stock when
        there isn't enough to cover the full demand. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 50)
        move = self._out_move(self.product, product_uom_qty=100, validate=False)
        self.assertEqual(move.availability, 50)

    def test_reassign_receipt_grows_with_demand(self):
        """ A receipt move always reserves its full demand - confirming it is
        enough, there's no existing stock to check against, so reservation is
        bypassed entirely and happens automatically. Growing the demand
        afterwards keeps it fully reserved too, with no extra step needed. """
        move = self._in_move(self.product, product_uom_qty=1, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')

        move.product_uom_qty = 3

        self.assertEqual(move.state, 'assigned')
        self.assertEqual(move.move_line_ids.quantity, 3)

    def test_reassign_serial_creates_new_lines(self):
        """ Re-running `_action_assign()` after more stock becomes available
        adds new move lines for a serial-tracked product rather than bumping
        the quantity on the lines already reserved - each unit of a serial-
        tracked product always gets its own move line. """
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 2)
        move = self._out_move(self.product_serial, product_uom_qty=4, validate=False)
        move._action_confirm()

        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 4)
        move._action_assign()

        self.assertEqual(len(move.move_line_ids), 4)

    def test_reduce_demand_on_partial_reservation(self):
        """ Reducing demand on a partially reserved move to match what's
        actually available makes it fully reserved. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 3)
        move = self._out_move(self.product, product_uom_qty=5, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'partially_available')

        move.product_uom_qty = 3
        move._action_assign()

        self.assertEqual(move.state, 'assigned')

    def test_overpicking_unreserves_other_move(self):
        """ Validating a move for more than its own reservation can "steal"
        stock reserved by another move for the same product - leaving that
        other move unreserved. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 30)
        move1 = self._out_move(self.product, product_uom_qty=15, validate=False)
        move2 = self._out_move(self.product, product_uom_qty=15, validate=False)
        move1._action_confirm()
        move2._action_confirm()
        self.assertEqual(move1.state, 'assigned')
        self.assertEqual(move2.state, 'assigned')

        self._validate_move(move2, quantity=30)

        self.assertEqual(move1.state, 'confirmed')
        self.assertEqual(move1.move_line_ids.quantity, 0)
        self.assertEqual(move2.state, 'done')
        self._check_inventory(self.product, {
            self.stock_location: 0,
            self.customer_location: 30,
        })

    def test_overpicking_steals_only_the_required_amount(self):
        """ Validating a move for only slightly more than what it could
        freely reserve steals only that extra bit from another move's
        reservation - not all of it, unlike
        `test_overpicking_unreserves_other_move` where the full amount was
        needed. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 4)
        move1 = self._out_move(self.product, product_uom_qty=3, validate=False)
        move1._action_confirm()
        self.assertEqual(move1.quantity, 3)
        move2 = self._out_move(self.product, product_uom_qty=2, validate=False)
        move2._action_confirm()
        self.assertEqual(move2.quantity, 1)

        self._validate_move(move2, quantity=2)

        self.assertEqual(move1.state, 'partially_available')
        self.assertEqual(move1.quantity, 2)
        quant = self.env['stock.quant']._gather(self.product, self.stock_location)
        self.assertEqual(quant.reserved_quantity, 2)

    def test_reservation_priority_follows_deadline_before_scheduled_date(self):
        """ When several moves compete for limited stock, one with a
        `date_deadline` is reserved first, ahead of one with only a later
        scheduled `date` and no deadline at all - a deadline always takes
        priority over scheduling order. """
        today = Datetime.now()
        delivery = self._create_picking(self.picking_type_out, moves=[
            {'product_id': self.product.id, 'product_uom_qty': 4, 'uom_id': self.product.uom_id.id,
             'location_id': self.stock_location.id, 'location_dest_id': self.customer_location.id,
             'date_deadline': today + timedelta(days=1)},
            {'product_id': self.product.id, 'product_uom_qty': 4, 'uom_id': self.product.uom_id.id,
             'location_id': self.stock_location.id, 'location_dest_id': self.customer_location.id,
             'date': today + timedelta(days=10)},
        ])
        delivery.action_confirm()
        move_with_deadline, move_scheduled_later = delivery.move_ids
        self.assertEqual(len(delivery.move_ids), 2, 'Moves should not be merged together')

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 2)
        delivery.action_assign()
        self.assertEqual(move_with_deadline.quantity, 2)
        self.assertEqual(move_scheduled_later.quantity, 0)

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 6)
        delivery.action_assign()
        self.assertEqual(move_with_deadline.quantity, 4)
        self.assertEqual(move_scheduled_later.quantity, 4)

    def test_validating_an_unrelated_move_reassigns_a_waiting_move(self):
        """ A confirmed-but-unreserved move automatically gets reserved once
        an unrelated receipt makes stock available - validating a receipt
        (or internal transfer) picking re-triggers assignment for any other
        waiting move on the same product, not just the scheduler. """
        move = self._out_move(self.product, product_uom_qty=10, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'confirmed')

        self._receipt(moves=[(self.product, 10)])

        self.assertEqual(move.state, 'assigned')

    def test_reservation_method_controls_when_scheduler_auto_assigns(self):
        """ A picking type's `reservation_method` controls whether, and
        when, the scheduler automatically reserves a waiting picking as
        stock becomes available - 'manual' never does (needs an explicit
        `action_assign()`), 'by_date' only once the scheduled date falls
        within `reservation_days_before` days - contrast with the default
        'at_confirm', reserved immediately on confirm, exercised throughout
        the rest of this file. """
        picking_type_manual = self.picking_type_out.with_user(self.user_stock_manager).copy({'sequence_code': 'OUTM'})
        picking_type_manual.reservation_method = 'manual'
        picking_type_by_date_not_due = self.picking_type_out.with_user(self.user_stock_manager).copy(
            {'sequence_code': 'OUTD1'})
        picking_type_by_date_not_due.write({'reservation_method': 'by_date', 'reservation_days_before': 1})
        picking_type_by_date_due = self.picking_type_out.with_user(self.user_stock_manager).copy(
            {'sequence_code': 'OUTD2'})
        picking_type_by_date_due.write({'reservation_method': 'by_date', 'reservation_days_before': 10})

        scheduled_date = Datetime.now() + timedelta(days=5)
        delivery_manual = self._create_picking(
            picking_type_manual, moves=[(self.product, 10)], scheduled_date=scheduled_date)
        delivery_not_due = self._create_picking(
            picking_type_by_date_not_due, moves=[(self.product, 10)], scheduled_date=scheduled_date)
        delivery_due = self._create_picking(
            picking_type_by_date_due, moves=[(self.product, 10)], scheduled_date=scheduled_date)
        (delivery_manual | delivery_not_due | delivery_due).action_confirm()
        self.assertFalse(delivery_manual.move_ids.reservation_date)
        self.assertTrue(delivery_not_due.move_ids.reservation_date > Date.today())
        self.assertTrue(delivery_due.move_ids.reservation_date <= Date.today())

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 30)
        self.env['stock.rule'].run_scheduler()

        self.assertEqual(delivery_manual.move_ids.quantity, 0)
        self.assertEqual(delivery_not_due.move_ids.quantity, 0)
        self.assertEqual(delivery_due.move_ids.quantity, 10)

        delivery_manual.action_assign()
        self.assertEqual(delivery_manual.move_ids.quantity, 10)

    def test_availability_at_date(self):
        """ `product.with_context(to_date=...)` replays done moves
        backward to report the quantity available as of a past date. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        in_move = self._create_move(self.product, self.customer_location, self.stock_location, product_uom_qty=3)
        out_move = self._create_move(self.product, self.stock_location, self.customer_location, product_uom_qty=2)
        self._validate_move(in_move)
        self._validate_move(out_move)

        today = Date.today()
        in_move.date = Date.add(today, days=-7)
        out_move.date = Date.add(today, days=-5)
        product = self.product.with_context(strict=True, location=self.stock_location.id)

        self.assertAlmostEqual(product.with_context(to_date=Date.add(today, days=-8)).qty_available, 10)
        self.assertAlmostEqual(product.with_context(to_date=Date.add(today, days=-6)).qty_available, 13)
        self.assertAlmostEqual(product.with_context(to_date=Date.add(today, days=-4)).qty_available, 11)

    # ---- Use reserved/unreserved move line ----

    def test_validating_move_line_steals_other_moves_reservation(self):
        """ Manually creating a move line for a move that couldn't reserve
        anything, then validating it, can still "steal" stock already
        reserved by another move - which then falls back to `confirmed`. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        move1 = self._out_move(self.product, product_uom_qty=1, validate=False)
        move2 = self._out_move(self.product, product_uom_qty=1, validate=False)
        move1._action_confirm()
        self.assertEqual(move1.state, 'assigned')
        move2._action_confirm()
        self.assertEqual(move2.state, 'confirmed')

        move2.write({'move_line_ids': [Command.create({
            'product_id': self.product.id,
            'uom_id': self.product.uom_id.id,
            'quantity': 1,
            'location_id': move2.location_id.id,
            'location_dest_id': move2.location_dest_id.id,
        })]})
        self._validate_move(move2)

        self.assertEqual(move1.state, 'confirmed')
        self._check_inventory(self.product, {self.stock_location: 0})

    def test_validating_move_line_steals_other_moves_lot_reservation(self):
        """ Same as above, but for a lot-tracked product - the forced move
        line must carry the right lot for the steal to free the correct
        reservation. """
        lot = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 1, lot_id=lot)
        move1 = self._out_move(self.product_lot, product_uom_qty=1, validate=False)
        move2 = self._out_move(self.product_lot, product_uom_qty=1, validate=False)
        move1._action_confirm()
        self.assertEqual(move1.state, 'assigned')
        move2._action_confirm()
        self.assertEqual(move2.state, 'confirmed')

        move2.write({'move_line_ids': [Command.create({
            'product_id': self.product_lot.id,
            'uom_id': self.product_lot.uom_id.id,
            'quantity': 1,
            'lot_id': lot.id,
            'location_id': move2.location_id.id,
            'location_dest_id': move2.location_dest_id.id,
        })]})
        self._validate_move(move2)

        self.assertEqual(move1.state, 'confirmed')
        self._check_inventory(self.product_lot, {self.stock_location: 0}, lot=lot)

    # ---- Availability / reservation (cont'd) ----

    def test_reservation_skips_negative_lot(self):
        """ A negative quant for one lot doesn't block reservation from a
        different, positive lot of the same product - the positive lot is the
        one actually assigned to the move. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_serial.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_serial.id})
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, -1, lot_id=lot1)
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lot2)

        move = self._out_move(self.product_serial, product_uom_qty=1, validate=False)
        move._action_confirm()

        self.assertEqual(move.state, 'assigned')
        self.assertEqual(move.quantity, 1)
        self.assertEqual(move.move_line_ids.lot_id, lot2)

    def test_reservation_respects_uom_rounding(self):
        """ A move in a coarser UoM (a pack of 6) than the quants (units)
        only reserves once there's enough stock to round up to a whole pack -
        no partial reservation across the rounding boundary. """
        # with_user: both of these need rights beyond the class-default
        # stock_user - decimal precision needs base.group_system, and editing
        # a product's allowed UoMs needs product.group_product_manager.
        self.env['decimal.precision'].with_user(self.user_stock_manager).search(
            [('name', '=', 'Product Unit')]).digits = 0
        self.product.with_user(self.user_stock_manager).write({'uom_ids': [Command.link(self.uom_pack_6.id)]})

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 2)
        move = self._out_move(self.product, product_uom_qty=1, uom_id=self.uom_pack_6.id, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'confirmed')

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 2)
        move._action_assign()
        self.assertEqual(move.state, 'confirmed')

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 2)
        move._action_assign()
        self.assertEqual(move.state, 'assigned')

        self._validate_move(move)
        self._check_inventory(self.product, {self.customer_location: 6})

    def test_reservation_respects_uom_rounding_across_quants(self):
        """ A move in a coarser UoM than the quants reserves across however
        many quants it takes to round up to a whole unit of that UoM - each
        move line still carries the quants' own (finer) UoM, not the move's. """
        lots = self.env['stock.lot'].create([
            {'name': f'lot{index}', 'product_id': self.product_serial.id} for index in range(6)
        ])
        for lot in lots:
            self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lot)

        move = self._out_move(self.product_serial, product_uom_qty=1, uom_id=self.uom_pack_6.id, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')
        self.assertEqual(len(move.move_line_ids), 6)
        self.assertEqual(move.move_line_ids.uom_id, self.uom_unit)
        self.assertEqual(move.move_line_ids.lot_id, lots)

        self._validate_move(move)

        self.assertEqual(move.product_uom_qty, 1)
        self.assertEqual(move.uom_id, self.uom_pack_6)
        self.assertEqual(move.state, 'done')
        self._check_inventory(self.product_serial, {self.customer_location: 6})

    def test_reservation_updates_with_move_quantity(self):
        """ Growing or shrinking `move.quantity` recomputes which quants are
        reserved, following the removal strategy (oldest first) across
        several locations, lots, and a package - shrinking releases them
        back in the exact opposite order it grew into them, last reserved
        first freed. """
        shelf_1 = self._create_location('Shelf 1')
        shelf_2 = self._create_location('Shelf 2')
        lot1, lot2, lot3 = self.env['stock.lot'].create([
            {'name': f'lot{index}', 'product_id': self.product_lot.id} for index in range(1, 4)
        ])
        package = self.env['stock.package'].create({'name': 'pack'})
        self.env['stock.quant']._update_available_quantity(self.product_lot, shelf_1, 3, lot_id=lot1)
        self.env['stock.quant']._update_available_quantity(self.product_lot, shelf_2, 3, lot_id=lot2)
        self.env['stock.quant']._update_available_quantity(self.product_lot, shelf_1, 1, lot_id=lot3)
        self.env['stock.quant']._update_available_quantity(
            self.product_lot, shelf_2, 3, lot_id=lot2, package_id=package)

        move = self._out_move(self.product_lot, product_uom_qty=1, validate=False)
        move._action_confirm()
        self.assertRecordValues(move.move_line_ids, [
            {'quantity': 1.0, 'location_id': shelf_1.id, 'lot_id': lot1.id, 'package_id': False},
        ])

        move.quantity = 8
        self.assertRecordValues(move.move_line_ids, [
            {'quantity': 3.0, 'location_id': shelf_1.id, 'lot_id': lot1.id, 'package_id': False},
            {'quantity': 3.0, 'location_id': shelf_2.id, 'lot_id': lot2.id, 'package_id': False},
            {'quantity': 1.0, 'location_id': shelf_1.id, 'lot_id': lot3.id, 'package_id': False},
            {'quantity': 1.0, 'location_id': shelf_2.id, 'lot_id': lot2.id, 'package_id': package.id},
        ])

        move.quantity = 4

        self.assertRecordValues(move.move_line_ids, [
            {'quantity': 3.0, 'location_id': shelf_1.id, 'lot_id': lot1.id, 'package_id': False},
            {'quantity': 1.0, 'location_id': shelf_2.id, 'lot_id': lot2.id, 'package_id': False},
        ])

        move.quantity = 3
        self.assertRecordValues(move.move_line_ids, [
            {'quantity': 3.0, 'location_id': shelf_1.id, 'lot_id': lot1.id, 'package_id': False},
        ])

    # ---- Forecast availability ----

    def test_move_quantity_in_move_uom_forecast_in_product_uom(self):
        """ `move.quantity` is expressed in the move's own UoM, while
        `move.forecast_availability` stays in the product's UoM - same for
        `product.virtual_available`, the product-level forecasted
        quantity. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 36)
        move = self._out_move(self.product, uom_id=self.uom_pack_6.id, product_uom_qty=2, validate=False)
        move._action_confirm()
        self.assertEqual(move.quantity, 2)
        self.assertEqual(move.forecast_availability, 12)
        self.assertEqual(self.product.virtual_available, 24)

    def test_forecast_availability_with_no_stock_between_warehouses(self):
        """ `forecast_availability` and `product.virtual_available` reflect
        the real shortfall for a move to the inter-warehouse transit
        location, with no stock anywhere. """
        transit_location = self.env.company.internal_transit_location_id
        transit_location.with_user(self.user_stock_manager).active = True
        move = self._create_move(self.product, self.stock_location, transit_location, product_uom_qty=1)
        self.assertEqual(move.forecast_availability, -1)
        move._action_confirm()
        self.assertEqual(move.forecast_availability, -1)
        self.assertEqual(self.product.virtual_available, -1)

    # ---- Initial demand ----

    def test_new_move_demand_defaults_to_zero_and_survives_product_change(self):
        """ A fresh move's demand defaults to 0, survives a product
        change, and its UoM follows the new product. """
        move = self._create_move(self.product, self.supplier_location, self.stock_location)
        self.assertEqual(move.state, 'draft')
        self.assertEqual(move.product_uom_qty, 0)

        move.product_uom_qty = 100
        move.product_id = self.product_serial

        self.assertEqual(move.product_uom_qty, 100)

        kg_product = self._create_product(name='Kg Product', uom_id=self.quick_ref('uom.product_uom_kgm').id)
        move.product_id = kg_product

        self.assertEqual(move.uom_id, kg_product.uom_id)

    def test_increasing_reserved_demand_grows_the_move_line_in_place(self):
        """ Growing an already-reserved receipt's demand reassigns
        automatically - the existing move line grows in place, no new
        line created. """
        move = self._in_move(self.product, product_uom_qty=10, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')

        move.product_uom_qty = 15

        self.assertEqual(move.state, 'assigned')
        self.assertEqual(move.product_uom_qty, 15)
        self.assertEqual(len(move.move_line_ids), 1)

    def test_decreasing_reserved_demand_shrinks_the_move_line_in_place(self):
        """ Shrinking an already-reserved receipt's demand keeps it fully
        reserved - the existing move line shrinks in place, no line
        dropped and recreated. """
        move = self._in_move(self.product, product_uom_qty=10, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')

        move.product_uom_qty = 5

        self.assertEqual(move.state, 'assigned')
        self.assertEqual(move.product_uom_qty, 5)
        self.assertEqual(len(move.move_line_ids), 1)

    # ---- Unreserve ----

    def test_unreserve_restores_available_quantity(self):
        """ Unreserving a move frees the quantity it had reserved back to
        available, and puts the move back in the `confirmed` state. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 2)
        move = self._out_move(self.product, product_uom_qty=2, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')
        quant = self.env['stock.quant']._gather(self.product, self.stock_location)
        self.assertEqual(quant.reserved_quantity, 2)
        self._check_inventory(self.product, {self.stock_location: 0})

        move._do_unreserve()

        self.assertEqual(move.state, 'confirmed')
        self.assertEqual(len(move.move_line_ids), 0)
        self.assertEqual(quant.reserved_quantity, 0)
        self._check_inventory(self.product, {self.stock_location: 2})

    def test_unreserve_partial_reservation(self):
        """ Unreserving a partially reserved move (not enough stock to cover
        the full demand) frees back exactly what it had reserved. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 2)
        move = self._out_move(self.product, product_uom_qty=3, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'partially_available')
        quant = self.env['stock.quant']._gather(self.product, self.stock_location)
        self.assertEqual(quant.reserved_quantity, 2)

        move._do_unreserve()

        self.assertEqual(move.state, 'confirmed')
        self.assertEqual(len(move.move_line_ids), 0)
        self.assertEqual(quant.reserved_quantity, 0)
        self._check_inventory(self.product, {self.stock_location: 2})

    def test_unreserve_packaged_quant(self):
        """ Unreserving a move also works when what it reserved is in a
        package. """
        package = self.env['stock.package'].create({'name': 'Package'})
        self.env['stock.quant']._update_available_quantity(
            self.product, self.stock_location, 150, package_id=package)

        move = self._out_move(self.product, product_uom_qty=100, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')
        self._check_inventory(self.product, {self.stock_location: 50}, package=package)

        move._do_unreserve()

        self.assertEqual(move.state, 'confirmed')
        self.assertEqual(len(move.move_line_ids), 0)
        self._check_inventory(self.product, {self.stock_location: 150}, package=package)

    def test_unreserve_across_multiple_quants(self):
        """ Unreserving a move reserved across several quants frees the
        reservation on all of them, not just one. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 3)
        self.env['stock.quant'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_id': self.stock_location.id,
            'quantity': 2,
        })
        quants = self.env['stock.quant']._gather(self.product, self.stock_location)
        self.assertEqual(len(quants), 2)

        move = self._out_move(self.product, product_uom_qty=5, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')

        move._do_unreserve()

        for quant in quants:
            self.assertEqual(quant.reserved_quantity, 0)

    def test_unreserve_with_negative_quant(self):
        """ Reserving against a mix of a negative and a positive quant, then
        unreserving, correctly restores each quant's own reserved quantity. """
        negative_quant = self.env['stock.quant'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_id': self.stock_location.id,
            'quantity': -10,
        })
        positive_quant = self.env['stock.quant'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_id': self.stock_location.id,
            'quantity': 30,
            'reserved_quantity': 10,
        })
        self._check_inventory(self.product, {self.stock_location: 10})

        move = self._out_move(self.product, product_uom_qty=10, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')
        self.assertEqual(negative_quant.reserved_quantity + positive_quant.reserved_quantity, 20)
        self._check_inventory(self.product, {self.stock_location: 0})

        move._do_unreserve()

        self.assertEqual(move.state, 'confirmed')
        self.assertEqual(negative_quant.reserved_quantity + positive_quant.reserved_quantity, 10)
        self._check_inventory(self.product, {self.stock_location: 10})

    # ---- Edit a reserved move line ----

    def test_edit_reservation_follows_location_change(self):
        """ Editing a reserved move line's location to another sub-location
        where stock is available re-targets the reservation there directly. """
        shelf_1 = self._create_location('Shelf 1')
        shelf_2 = self._create_location('Shelf 2')
        self.env['stock.quant']._update_available_quantity(self.product, shelf_1, 1)
        self.env['stock.quant']._update_available_quantity(self.product, shelf_2, 1)

        move = self._out_move(self.product, product_uom_qty=1, validate=False)
        move._action_confirm()
        self._check_inventory(self.product, {shelf_1: 0, shelf_2: 1})

        move.move_line_ids.location_id = shelf_2

        self.assertEqual(move.quantity, 1)
        self._check_inventory(self.product, {shelf_1: 1, shelf_2: 0})

    def test_edit_reservation_follows_lot_change(self):
        """ Editing a reserved move line's lot to another lot that's
        available re-targets the reservation to that lot directly. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_lot.id})
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 1, lot_id=lot1)
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 1, lot_id=lot2)

        move = self._out_move(self.product_lot, product_uom_qty=1, validate=False)
        move._action_confirm()
        self._check_inventory(self.product_lot, {self.stock_location: 0}, lot=lot1)
        self._check_inventory(self.product_lot, {self.stock_location: 1}, lot=lot2)

        move.move_line_ids.lot_id = lot2.id

        self.assertEqual(move.quantity, 1)
        self._check_inventory(self.product_lot, {self.stock_location: 1}, lot=lot1)
        self._check_inventory(self.product_lot, {self.stock_location: 0}, lot=lot2)

    def test_edit_reservation_follows_combined_lot_and_package_change(self):
        """ Editing a reserved move line's lot and package together
        re-targets the reservation to that new combination directly. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_lot.id})
        package = self.env['stock.package'].create({'name': 'Package'})
        self.env['stock.quant']._update_available_quantity(
            self.product_lot, self.stock_location, 1, lot_id=lot1, package_id=package)
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 1, lot_id=lot2)

        move = self._out_move(self.product_lot, product_uom_qty=1, validate=False)
        move._action_confirm()
        self._check_inventory(self.product_lot, {self.stock_location: 0}, lot=lot1, package=package)
        self._check_inventory(self.product_lot, {self.stock_location: 1}, lot=lot2)

        move.move_line_ids.write({'package_id': False, 'lot_id': lot2.id})

        self.assertEqual(move.quantity, 1)
        self._check_inventory(self.product_lot, {self.stock_location: 1}, lot=lot1, package=package)
        self._check_inventory(self.product_lot, {self.stock_location: 0}, lot=lot2)

    def test_edit_reservation_to_unavailable_location_goes_negative(self):
        """ Editing a reserved move line's location to a sub-location with no
        stock at all forces a negative quant there instead of blocking the
        edit. """
        shelf_1 = self._create_location('Shelf 1')
        shelf_2 = self._create_location('Shelf 2')
        self.env['stock.quant']._update_available_quantity(self.product, shelf_1, 1)

        move = self._out_move(self.product, product_uom_qty=1, validate=False)
        move._action_confirm()
        self.assertEqual(move.move_line_ids.state, 'assigned')
        self._check_inventory(self.product, {shelf_1: 0, shelf_2: 0})

        move.move_line_ids.location_id = shelf_2

        self.assertEqual(move.move_line_ids.state, 'assigned')
        self.assertEqual(move.quantity, 1)
        self.assertEqual(
            self.env['stock.quant']._get_available_quantity(self.product, shelf_2, allow_negative=True), -1)
        self._check_inventory(self.product, {shelf_1: 1})

    def test_edit_reservation_assigning_lot_afterwards_keeps_quantity(self):
        """ A tracked product can be reserved before any lot is assigned
        (stock seeded without one). Setting the lot afterwards doesn't change
        the reserved quantity, and validating doesn't create a negative quant
        for that lot - it consumes the generic (untracked) quant instead. """
        lot = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 5)

        move = self._out_move(self.product_lot, product_uom_qty=5, validate=False)
        move._action_confirm()
        move_line = move.move_line_ids
        self.assertEqual(move_line.quantity_product_uom, 5)

        move_line.lot_id = lot
        self.assertEqual(move_line.quantity_product_uom, 5)
        self._validate_move(move)

        self.assertEqual(move.state, 'done')
        self._check_inventory(self.product_lot, {self.stock_location: 0})
        self._check_inventory(self.product_lot, {self.stock_location: 0}, lot=lot)

    def test_edit_reservation_quantity_has_no_maximum(self):
        """ Manually writing more quantity than available on a reserved move
        line is allowed - there's no cap enforced, it just goes negative. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        move = self._out_move(self.product, product_uom_qty=1, validate=False)
        move._action_confirm()

        move.move_line_ids.quantity = 2

        self.assertTrue(move.move_line_ids)
        self.assertEqual(move.move_line_ids.quantity, 2)
        self._check_inventory(self.product, {self.stock_location: -1})

    # ---- Edit a done move line ----

    def test_edit_done_move_line_follows_location_change(self):
        """ Editing a done move line's location to another sub-location
        where stock is available immediately re-syncs the quants there -
        same as editing a reserved line, just after validation instead of
        before. """
        shelf_1 = self._create_location('Shelf 1')
        shelf_2 = self._create_location('Shelf 2')
        self.env['stock.quant']._update_available_quantity(self.product, shelf_1, 1)
        self.env['stock.quant']._update_available_quantity(self.product, shelf_2, 1)

        move = self._out_move(self.product, product_uom_qty=1)
        self._check_inventory(self.product, {shelf_1: 0, shelf_2: 1})

        move.move_line_ids.location_id = shelf_2

        self._check_inventory(self.product, {shelf_1: 1, shelf_2: 0})

    def test_edit_done_move_line_follows_lot_change(self):
        """ Editing a done move line's lot to another lot that's available
        immediately re-syncs the quants, consuming that lot instead. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_lot.id})
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 1, lot_id=lot1)
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 1, lot_id=lot2)

        move = self._out_move(self.product_lot, product_uom_qty=1)
        self._check_inventory(self.product_lot, {self.stock_location: 0}, lot=lot1)
        self._check_inventory(self.product_lot, {self.stock_location: 1}, lot=lot2)

        move.move_line_ids.lot_id = lot2.id

        self._check_inventory(self.product_lot, {self.stock_location: 1}, lot=lot1)
        self._check_inventory(self.product_lot, {self.stock_location: 0}, lot=lot2)

    def test_edit_done_move_line_follows_combined_lot_and_package_change(self):
        """ Editing a done move line's lot and package together re-syncs the
        quants to that new combination directly. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_lot.id})
        package = self.env['stock.package'].with_user(self.user_stock_manager).create({'name': 'Package'})
        self.env['stock.quant']._update_available_quantity(
            self.product_lot, self.stock_location, 1, lot_id=lot1, package_id=package)
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 1, lot_id=lot2)

        move = self._out_move(self.product_lot, product_uom_qty=1)
        self._check_inventory(self.product_lot, {self.stock_location: 0}, lot=lot1, package=package)
        self._check_inventory(self.product_lot, {self.stock_location: 1}, lot=lot2)

        move.move_line_ids.write({'package_id': False, 'lot_id': lot2.id})

        self._check_inventory(self.product_lot, {self.stock_location: 1}, lot=lot1, package=package)
        self._check_inventory(self.product_lot, {self.stock_location: 0}, lot=lot2)

    def test_edit_done_move_line_location_steals_other_moves_reservation(self):
        """ Editing a done move line's source location to a sub-location
        another move has reserved steals that reservation - the other move
        re-reserves itself from wherever stock is actually available,
        including the location just vacated. """
        shelf_1 = self._create_location('Shelf 1')
        shelf_2 = self._create_location('Shelf 2')
        self.env['stock.quant']._update_available_quantity(self.product, shelf_1, 1)
        self.env['stock.quant']._update_available_quantity(self.product, shelf_2, 1)

        move1 = self._out_move(self.product, product_uom_qty=1)

        move2 = self._out_move(self.product, product_uom_qty=1, validate=False)
        move2._action_confirm()
        move2._action_assign()
        self.assertEqual(move2.state, 'assigned')
        self._check_inventory(self.product, {shelf_1: 0, shelf_2: 0})

        move1.move_line_ids.location_id = shelf_2

        self._check_inventory(self.product, {shelf_1: 0, shelf_2: 0})
        self.assertEqual(move2.state, 'assigned')
        self.assertEqual(move2.move_line_ids.location_id, shelf_1)

    def test_edit_done_move_line_quantity_increase_goes_negative(self):
        """ Increasing a done move line's quantity beyond what was actually
        in stock pushes the quant negative instead of blocking the edit. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)

        move = self._out_move(self.product, product_uom_qty=1)
        self._check_inventory(self.product, {self.stock_location: 0})

        move.move_line_ids.quantity = 2

        self._check_inventory(self.product, {self.stock_location: -1})
        self.assertEqual(move.quantity, 2)
        self.assertEqual(move.product_uom_qty, 1)

    def test_edit_done_move_line_quantity_zeroed_restores_availability(self):
        """ Zeroing a done move line's quantity on an outgoing move restores
        the stock it had taken, without touching the move's own demand. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)

        move = self._out_move(self.product, product_uom_qty=1)
        self._check_inventory(self.product, {self.stock_location: 0})

        move.move_line_ids.quantity = 0

        self.assertEqual(move.quantity, 0)
        self.assertEqual(move.product_uom_qty, 1)
        self._check_inventory(self.product, {self.stock_location: 1})

    def test_edit_done_incoming_move_line_quantity_zeroed_undoes_quant(self):
        """ Zeroing a done move line's quantity on an incoming move exactly
        undoes what it had put in stock, landing back at 0 - not negative,
        since there's nothing to "give back" the other way the way an
        outgoing move's source location does. """
        move = self._in_move(self.product, product_uom_qty=10)
        self._check_inventory(self.product, {self.stock_location: 10})

        move.move_line_ids.quantity = 0

        self._check_inventory(self.product, {self.stock_location: 0})
        self.assertEqual(move.product_uom_qty, 10)

    def test_add_move_line_to_done_move_updates_quant(self):
        """ Adding a brand new move line to an already-done move updates the
        quant immediately too - and that new line can be edited just like
        any other. """
        move = self._in_move(self.product, product_uom_qty=10)
        self._check_inventory(self.product, {self.stock_location: 10})

        self.env['stock.move.line'].with_user(self.user_stock_manager).create({
            'move_id': move.id,
            'product_id': move.product_id.id,
            'quantity': 10,
            'uom_id': move.uom_id.id,
            'location_id': move.location_id.id,
            'location_dest_id': move.location_dest_id.id,
        })

        self._check_inventory(self.product, {self.stock_location: 20})

        move.move_line_ids[1].quantity = 5

        self.assertEqual(move.quantity, 15)
        self._check_inventory(self.product, {self.stock_location: 15})

    def test_edit_done_move_line_quantity_and_uom_scale_quant_correctly(self):
        """ Editing a done move line's quantity and UoM both scale the quant
        correctly - and a move's own UoM can no longer be edited once it's
        done. """
        move = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=6)
        move._action_confirm()
        move.move_line_ids.uom_id = self.uom_pack_6
        move.move_line_ids.quantity = 1
        move.picked = True
        move._action_done()
        self._check_inventory(self.product, {self.stock_location: 6})

        move.move_line_ids.quantity = 2
        self._check_inventory(self.product, {self.stock_location: 12})
        self.assertEqual(move.product_uom_qty, 6)

        move.move_line_ids.uom_id = self.uom_unit
        self._check_inventory(self.product, {self.stock_location: 2})
        self.assertEqual(move.product_uom_qty, 6)

        with self.assertRaises(UserError):
            move.uom_id = self.uom_pack_6

    def test_add_tracked_move_lines_to_done_move_assigns_new_lots(self):
        """ Adding move lines with fresh serial numbers to an already-done
        move updates the quants immediately, landing exactly at 0 - not
        negative. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_serial.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_serial.id})
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lot1)
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lot2)

        move = self._out_move(self.product_serial, product_uom_qty=2)
        self._check_inventory(self.product_serial, {self.stock_location: 0})

        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 2)
        lot3 = self.env['stock.lot'].create({'name': 'lot3', 'product_id': self.product_serial.id})
        lot4 = self.env['stock.lot'].create({'name': 'lot4', 'product_id': self.product_serial.id})

        self.env['stock.move.line'].with_user(self.user_stock_manager).create({
            'move_id': move.id,
            'product_id': move.product_id.id,
            'quantity': 1,
            'uom_id': move.uom_id.id,
            'location_id': move.location_id.id,
            'location_dest_id': move.location_dest_id.id,
            'lot_id': lot3.id,
        })
        self.env['stock.move.line'].with_user(self.user_stock_manager).create({
            'move_id': move.id,
            'product_id': move.product_id.id,
            'quantity': 1,
            'uom_id': move.uom_id.id,
            'location_id': move.location_id.id,
            'location_dest_id': move.location_dest_id.id,
            'lot_id': lot4.id,
        })

        self._check_inventory(self.product_serial, {self.stock_location: 0})
        self._check_inventory(self.product_serial, {self.stock_location: 0}, lot=lot1)
        self._check_inventory(self.product_serial, {self.stock_location: 0}, lot=lot2)
        self._check_inventory(self.product_serial, {self.stock_location: 0}, lot=lot3)
        self._check_inventory(self.product_serial, {self.stock_location: 0}, lot=lot4)

    def test_edit_done_move_line_lot_to_unavailable_lot_consumes_untracked_quant(self):
        """ Editing a done move line's lot to one with no matching quant at
        all doesn't go negative under that lot - it falls back to consuming
        the untracked quant instead, the same way a fresh reservation
        would. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_serial.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_serial.id})
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lot1)
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lot2)

        move = self._out_move(self.product_serial, product_uom_qty=2)
        self._check_inventory(self.product_serial, {self.stock_location: 0})

        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1)
        lot3 = self.env['stock.lot'].create({'name': 'lot3', 'product_id': self.product_serial.id})
        move.move_line_ids[1].lot_id = lot3

        self._check_inventory(self.product_serial, {self.stock_location: 1})
        self._check_inventory(self.product_serial, {self.stock_location: 0}, lot=lot1)
        self._check_inventory(self.product_serial, {self.stock_location: 1}, lot=lot2)
        self._check_inventory(self.product_serial, {self.stock_location: 0}, lot=lot3)

    # ---- Move line destination location ----

    def test_move_line_location_defaults_from_its_move_or_its_picking(self):
        """ A move line created with no location specified defaults from
        its own move's locations - or, if it has no move at all, from its
        picking's. """
        child_loc = self._create_location('Child')
        move = self._create_move(self.product, self.stock_location, child_loc, product_uom_qty=1)
        move_line = self.env['stock.move.line'].with_user(self.user_stock_manager).create({'move_id': move.id})
        self.assertEqual(move_line.location_id, self.stock_location)
        self.assertEqual(move_line.location_dest_id, child_loc)

        picking = self._create_picking(self.picking_type_int, location_dest_id=child_loc.id)
        picking_move_line = self.env['stock.move.line'].with_user(self.user_stock_manager).create({
            'picking_id': picking.id,
            'product_id': self.product.id,
            'quantity': 1.0,
        })
        self.assertEqual(picking_move_line.location_id, self.stock_location)
        self.assertEqual(picking_move_line.location_dest_id, child_loc)

    def test_move_line_destination_location_survives_further_edits(self):
        """ Writing the move's own destination location updates its move
        line's destination when the new value is a child location, but not
        when it's a broader ancestor one - and that doesn't get reset by a
        later quantity edit either. Also, a move reserving from a parent
        location can draw from stock sitting in one of its children. """
        self.env.user.with_user(self.user_stock_manager).write(
            {'group_ids': [Command.link(self.quick_ref('stock.group_stock_multi_locations').id)]})
        child_location = self._create_location('Child')

        consumable = self._create_product(name='Consumable', is_storable=False)
        picking = self._create_picking(self.picking_type_int, moves=[(consumable, 2)])
        picking.action_confirm()
        with Form(picking.move_ids, view='stock.view_stock_move_operations') as form:
            with form.move_line_ids.edit(0) as line:
                line.location_dest_id = child_location
                line.quantity = 1
        self.assertEqual(picking.move_line_ids.location_dest_id, child_location)

        waiting_move = self._out_move(self.product, product_uom_qty=3, validate=False)
        waiting_move._action_confirm()
        self.assertEqual(waiting_move.state, 'confirmed')

        move = self._create_move(self.product, self.supplier_location, child_location, product_uom_qty=1)
        move._action_confirm()
        move.location_dest_id = self.stock_location
        self.assertEqual(move.move_line_ids.location_dest_id, child_location)

        other_move = self._in_move(self.product, product_uom_qty=1, validate=False)
        other_move._action_confirm()
        self.assertEqual(other_move.move_line_ids.location_dest_id, self.stock_location)
        other_move.location_dest_id = child_location
        self.assertEqual(other_move.move_line_ids.location_dest_id, child_location)

        move.move_line_ids.quantity = 3
        self._validate_move(move)
        self.assertEqual(move.move_line_ids.quantity, 3)
        self.assertEqual(move.move_line_ids.location_dest_id, child_location)

        waiting_move._action_assign()
        self.assertEqual(waiting_move.state, 'assigned')

    # ---- In-date / removal strategy ----

    def test_in_date_survives_internal_move(self):
        """ Moving a tracked quant to another location keeps its incoming
        date - an internal transfer doesn't reset it. """
        receipt = self._in_move(self.product_lot, lot_names=['lot1'], product_uom_qty=1)
        lot = receipt.move_line_ids.lot_id
        quant = self.env['stock.quant']._gather(self.product_lot, self.stock_location, lot_id=lot, strict=True)
        self.assertTrue(quant.in_date)
        initial_in_date = quant.in_date

        pack_location = self._create_location('Pack')
        move = self._create_move(self.product_lot, self.stock_location, pack_location, product_uom_qty=1)
        self._validate_move(move)

        quant = self.env['stock.quant']._gather(self.product_lot, pack_location, lot_id=lot, strict=True)
        self.assertEqual(quant.in_date, initial_in_date)

    def test_edit_done_move_line_follows_lot_change_keeps_in_dates_correct(self):
        """ The default removal strategy is FIFO (oldest incoming date
        first) - and editing the resulting done line's lot afterward (see
        `test_edit_done_move_line_follows_lot_change` for the same
        mechanism without the in-date angle) swaps the two quants cleanly,
        each keeping its own incoming date. """
        move_lot1 = self._in_move(self.product_lot, lot_names=['lot1'], product_uom_qty=1)
        move_lot2 = self._in_move(self.product_lot, lot_names=['lot2'], product_uom_qty=1)
        lot1 = move_lot1.move_line_ids.lot_id
        lot2 = move_lot2.move_line_ids.lot_id
        quant_lot1 = self.env['stock.quant']._gather(self.product_lot, self.stock_location, lot_id=lot1, strict=True)
        quant_lot1.in_date = Datetime.now() - timedelta(days=5)
        initial_in_date_lot1 = quant_lot1.in_date
        initial_in_date_lot2 = self.env['stock.quant']._gather(
            self.product_lot, self.stock_location, lot_id=lot2, strict=True).in_date

        pack_location = self._create_location('Pack')
        move = self._create_move(self.product_lot, self.stock_location, pack_location, product_uom_qty=1)
        self._validate_move(move)

        quant_lot1_in_pack = self.env['stock.quant']._gather(self.product_lot, pack_location, lot_id=lot1, strict=True)
        self.assertTrue(quant_lot1_in_pack)
        self.assertEqual(quant_lot1_in_pack.in_date, initial_in_date_lot1)
        quant_lot2_untouched = self.env['stock.quant']._gather(
            self.product_lot, self.stock_location, lot_id=lot2, strict=True)
        self.assertEqual(quant_lot2_untouched.quantity, 1)

        move.move_line_ids.lot_id = lot2

        quant_lot1 = self.env['stock.quant']._gather(self.product_lot, self.stock_location, lot_id=lot1, strict=True)
        self.assertEqual(quant_lot1.in_date, initial_in_date_lot1)
        quant_lot2 = self.env['stock.quant']._gather(self.product_lot, pack_location, lot_id=lot2, strict=True)
        self.assertAlmostEqual(quant_lot2.in_date, initial_in_date_lot2, delta=timedelta(seconds=1))

    def test_adding_a_move_line_to_a_done_move_carries_its_in_date(self):
        """ Creating a brand new move line directly on an already-done move
        - as opposed to editing an existing one, see the previous test -
        moves that lot/quantity too, with its own correct incoming date. """
        move_lot1 = self._in_move(self.product_lot, lot_names=['lot1'], product_uom_qty=1)
        move_lot2 = self._in_move(self.product_lot, lot_names=['lot2'], product_uom_qty=1)
        lot1 = move_lot1.move_line_ids.lot_id
        lot2 = move_lot2.move_line_ids.lot_id
        quant_lot1 = self.env['stock.quant']._gather(self.product_lot, self.stock_location, lot_id=lot1, strict=True)
        quant_lot1.in_date = Datetime.now() - timedelta(days=5)
        initial_in_date_lot1 = quant_lot1.in_date
        initial_in_date_lot2 = self.env['stock.quant']._gather(
            self.product_lot, self.stock_location, lot_id=lot2, strict=True).in_date

        pack_location = self._create_location('Pack')
        move = self._create_move(self.product_lot, self.stock_location, pack_location, product_uom_qty=1)
        self._validate_move(move)

        self.env['stock.move.line'].create({
            'move_id': move.id,
            'product_id': move.product_id.id,
            'quantity': 1,
            'uom_id': move.uom_id.id,
            'location_id': move.location_id.id,
            'location_dest_id': move.location_dest_id.id,
            'lot_id': lot2.id,
        })

        quant_lot1 = self.env['stock.quant']._gather(self.product_lot, pack_location, lot_id=lot1, strict=True)
        self.assertEqual(quant_lot1.in_date, initial_in_date_lot1)
        quant_lot2 = self.env['stock.quant']._gather(self.product_lot, pack_location, lot_id=lot2, strict=True)
        self.assertAlmostEqual(quant_lot2.in_date, initial_in_date_lot2, delta=timedelta(seconds=1))

    # ---- UoM conversion ----

    def test_edit_reserved_line_uom_recomputes_quant_reservation(self):
        """ Editing a reserved line's UoM recomputes the quant's reserved
        quantity. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 100)
        quant = self.env['stock.quant']._gather(self.product, self.stock_location)
        move = self._out_move(self.product, product_uom_qty=1, validate=False)
        move._action_confirm()
        self.assertEqual(quant.reserved_quantity, 1)

        move.move_line_ids.write({'quantity': 2, 'uom_id': self.uom_pack_6.id})
        self.assertEqual(quant.reserved_quantity, 12)

        move.move_line_ids.write({'uom_id': self.uom_unit.id})
        self.assertEqual(quant.reserved_quantity, 2)

    def test_decrease_move_quantity_with_line_in_different_uom(self):
        """ Shrinking a move's quantity keeps a line in a different UoM
        in sync. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 12)
        quant = self.env['stock.quant']._gather(self.product, self.stock_location)
        move = self._create_move(
            self.product, self.stock_location, self.customer_location,
            uom_id=self.uom_pack_6.id, product_uom_qty=2)
        move._action_confirm()
        self.assertEqual(quant.reserved_quantity, 12)

        move.move_line_ids.write({'quantity': 12, 'uom_id': self.uom_unit.id})

        move.quantity = 1

        self.assertEqual(len(move.move_line_ids), 1)
        self.assertEqual(move.move_line_ids.uom_id, self.uom_unit)
        self.assertEqual(move.move_line_ids.quantity, 6)
        self.assertEqual(quant.reserved_quantity, 6)

    def test_create_line_from_quant_in_different_uom(self):
        """ Creating a line from a quant reserves it correctly even when
        the move is in a coarser UoM. """
        lot = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        move = self._create_move(
            self.product_lot, self.stock_location, self.customer_location,
            uom_id=self.uom_pack_6.id, product_uom_qty=1)
        move._action_confirm()
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 100, lot_id=lot)
        quant = self.env['stock.quant']._gather(self.product_lot, self.stock_location)

        move_line = self.env['stock.move.line'].create({
            'move_id': move.id,
            'quant_id': quant.id,
        })

        self.assertEqual(move_line.uom_id, self.uom_pack_6)
        self.assertEqual(move_line.quantity, 1)
        self.assertEqual(move_line.quantity_product_uom, 6)
        self.assertEqual(quant.quantity, 100)
        self.assertEqual(quant.reserved_quantity, 6)

    def test_creating_a_second_line_from_quant_id_fills_remaining_demand_and_inherits_picked(self):
        """ Creating a second line from the same quant only auto-fills
        whatever demand the first line didn't already cover, not the full
        demand again. Also, once the move itself has been marked picked, any
        further line added to it - whether an existing one caught by the
        write or a brand new one - is itself automatically picked too. """
        gram_uom = self.quick_ref('uom.product_uom_gram')
        kg_uom = self.quick_ref('uom.product_uom_kgm')
        product = self._create_product(name='Gram Product', uom_id=gram_uom.id)
        quant = self.env['stock.quant'].with_user(self.user_stock_manager).create({
            'product_id': product.id,
            'location_id': self.stock_location.id,
            'quantity': 1000000,
        })
        move = self._create_move(product, self.stock_location, self.customer_location, uom_id=kg_uom.id, product_uom_qty=2)
        move._action_confirm()
        move.move_line_ids.unlink()

        line1 = self.env['stock.move.line'].create({'move_id': move.id})
        line1.quant_id = quant
        self.assertEqual(line1.quantity, 2.0)

        line1.quantity = 1.0
        move.picked = True
        self.assertTrue(line1.picked)

        line2 = self.env['stock.move.line'].create({'move_id': move.id})
        line2.quant_id = quant
        self.assertEqual(line2.quantity, 1.0)
        self.assertTrue(line2.picked)

    def test_forcing_exact_quantity_keeps_rounding_remainder_valid(self):
        """ Forcing a move's quantity to the exact demand, despite a UoM
        rounding discrepancy, doesn't corrupt the quant's reserved
        quantity. """
        gram_uom = self.quick_ref('uom.product_uom_gram')
        oz_uom = self.quick_ref('uom.product_uom_oz')
        oz_product = self._create_product(name='Oz Product', uom_id=oz_uom.id)
        self.env['stock.quant']._update_available_quantity(oz_product, self.stock_location, 10)

        delivery = self._deliver(moves=[(oz_product, 150, gram_uom)], validate=False)
        delivery.action_confirm()
        delivery.action_assign()
        self.assertEqual(delivery.move_ids.quantity, 149.97)  # 150 g -> 5.29 oz -> 149.97 g

        delivery.move_ids.quantity = 150

        self.assertEqual(delivery.move_ids.quantity, 150)
        delivery.move_ids.picked = True
        delivery.button_validate()

        self.assertEqual(delivery.state, 'done')
        self.assertRecordValues(delivery.move_line_ids, [
            {'quantity': 149.97, 'quantity_product_uom': 5.29},
            {'quantity': 0.03, 'quantity_product_uom': 0},
        ])
        quant = self.env['stock.quant']._gather(oz_product, self.stock_location)
        self.assertEqual(quant.reserved_quantity, 0)

    # ---- Mixed lot/serial tracking reservation ----

    def test_reservation_spans_tracked_and_untracked_quants(self):
        """ When both tracked and untracked quants exist for a lot-tracked
        product, reserving a demand spanning both creates one move line per
        quant group. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 2)
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 3, lot_id=lot1)

        move = self._out_move(self.product_lot, product_uom_qty=5, validate=False)
        move._action_confirm()

        self.assertEqual(len(move.move_line_ids), 2)

    def test_reservation_spans_tracked_and_untracked_quants_serial(self):
        """ Serial-tracked version: reserving spans 2 tracked lots + 2
        untracked quants, one move line per unit. Reassigning the untracked
        lines' lots to brand-new lots (not yet backed by any quant) before
        validating doesn't disturb the quants, and validating still lands
        exactly at 0, not negative. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_serial.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_serial.id})
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 2)
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lot1)
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lot2)

        move = self._out_move(self.product_serial, product_uom_qty=4, validate=False)
        move._action_confirm()
        self.assertEqual(len(move.move_line_ids), 4)

        lot3 = self.env['stock.lot'].create({'name': 'lot3', 'product_id': self.product_serial.id})
        lot4 = self.env['stock.lot'].create({'name': 'lot4', 'product_id': self.product_serial.id})
        untracked_lines = move.move_line_ids.filtered(lambda ml: not ml.lot_id)
        untracked_lines[0].lot_id = lot3
        untracked_lines[1].lot_id = lot4

        self._validate_move(move)

        self._check_inventory(self.product_serial, {self.stock_location: 0})

    def test_reservation_line_lot_reassigned_to_unavailable_lot_still_validates_clean(self):
        """ Editing a reserved move line's lot - even twice, to lots with no
        matching quant at all - doesn't change what's reserved; validating
        still consumes the untracked quant it was originally reserved from,
        not a negative quant for either lot. """
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1)
        move = self._out_move(self.product_serial, product_uom_qty=1, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')

        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_serial.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_serial.id})
        move_line = move.move_line_ids
        move_line.lot_id = lot1
        self.assertEqual(move_line.quantity_product_uom, 1)
        move_line.lot_id = lot2
        self.assertEqual(move_line.quantity_product_uom, 1)

        self._validate_move(move)

        self._check_inventory(self.product_serial, {self.stock_location: 0})

    def test_unreserve_after_reassigning_to_unavailable_lot(self):
        """ Reserve from a tracked quant, then edit the line's lot to one not
        present in stock while an untracked quant becomes available
        elsewhere. Reassigning the lot frees the original lot's quant right
        away, before any unreserve happens. Unreserving afterwards correctly
        leaves both quants - the lot and the untracked one - available side
        by side, without error. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_serial.id})
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lot1)

        move = self._out_move(self.product_serial, product_uom_qty=1, validate=False)
        move._action_confirm()
        self.assertEqual(move.quantity, 1)
        self.assertEqual(move.move_line_ids.lot_id, lot1)

        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1)
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_serial.id})
        move.move_line_ids.lot_id = lot2
        self.assertEqual(move.quantity, 1)
        self.assertEqual(move.move_line_ids.lot_id, lot2)
        self._check_inventory(self.product_serial, {self.stock_location: 1}, lot=lot1)

        move._do_unreserve()

        self.assertEqual(move.quantity, 0)
        self.assertFalse(move.move_line_ids)
        quants = self.env['stock.quant']._gather(self.product_serial, self.stock_location)
        lot1_quant = quants.filtered(lambda q: q.lot_id == lot1)
        untracked_quant = quants.filtered(lambda q: not q.lot_id)
        self.assertEqual(lot1_quant.quantity - lot1_quant.reserved_quantity, 1)
        self.assertEqual(untracked_quant.quantity - untracked_quant.reserved_quantity, 1)

    def test_reservation_reassigned_lot_goes_negative_without_affecting_other_quants(self):
        """ Reassigning a reserved line's lot to one with no stock creates a
        negative quant only for that lot - an unrelated large positive quant
        for a different lot, and an unrelated pre-existing negative quant,
        are both left untouched. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_serial.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_serial.id})
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 10, lot_id=lot1)
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1)
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, -1)

        move = self._out_move(self.product_serial, product_uom_qty=1, validate=False)
        move._action_confirm()
        move.move_line_ids.lot_id = lot2

        self._validate_move(move)

        self._check_inventory(self.product_serial, {self.stock_location: 10}, lot=lot1)
        self._check_inventory(self.product_serial, {self.stock_location: -1}, lot=lot2)


class TestStockMoveMultiStep(TestStockCommon):
    """ Reservation across a real chained multi-step delivery (pick -> ship),
    driven by the warehouse's own routing (push rules) - creating only the
    pick, same as a real user would, and letting the ship step get created
    automatically when the pick is validated, rather than hand-wiring
    `move_orig_ids`/`move_dest_ids` ourselves. """
    _test_user_groups = ('stock.group_stock_user',)

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.warehouse.with_user(cls.user_stock_manager).write({
            'delivery_steps': 'pick_ship',
            'reception_steps': 'two_steps',
        })
        cls.picking_type_pick = cls.warehouse.pick_type_id
        cls.output_location = cls.warehouse.wh_output_stock_loc_id
        cls.input_location = cls.warehouse.wh_input_stock_loc_id

    # ---- Ship creation & reservation ----

    def test_validating_pick_creates_and_reserves_ship(self):
        """ Validating the pick automatically creates the ship picking (push
        rule) and reserves it from what the pick delivered. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)

        pick = self._create_picking(self.picking_type_pick, moves=[(self.product, 1)])
        self._validate_picking(pick)

        ship = pick.move_ids.move_dest_ids.picking_id
        self.assertTrue(ship)
        self.assertEqual(ship.picking_type_id, self.picking_type_out)
        self.assertEqual(ship.state, 'assigned')
        move_line = ship.move_ids.move_line_ids
        self.assertEqual(len(move_line), 1)
        self.assertEqual(move_line.location_id, self.output_location)
        self.assertEqual(move_line.location_dest_id, self.customer_location)

    def test_validating_pick_creates_and_reserves_ship_lot(self):
        """ Same as above, but the lot assigned on the pick carries through
        automatically to the ship's reservation. """
        lot = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 1, lot_id=lot)

        pick = self._create_picking(self.picking_type_pick, moves=[(self.product_lot, 1)])
        self._validate_picking(pick)

        ship = pick.move_ids.move_dest_ids.picking_id
        self.assertEqual(ship.state, 'assigned')
        self.assertEqual(ship.move_ids.move_line_ids.lot_id, lot)

    # ---- Backorder push: merge vs. separate ship ----

    def test_backorder_pick_without_reference_pushes_its_own_ship(self):
        """ A pick with no originating reference (no sale order / procurement
        group behind it) that can only partially deliver its demand creates
        a backorder pick for the rest - each one pushes (and reserves) its
        own ship picking independently, since push has no shared document to
        match an existing picking against. Contrast with
        `test_backorder_pick_merges_into_existing_ship` below. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)

        pick = self._create_picking(self.picking_type_pick, moves=[(self.product, 2)])
        pick.action_confirm()
        pick.action_assign()
        action = pick.button_validate()
        self._process_backorder_wizard(action)
        self.assertEqual(pick.state, 'done')
        backorder_pick = self.env['stock.picking'].search([('backorder_id', '=', pick.id)])
        self.assertEqual(backorder_pick.state, 'confirmed')

        first_ship = pick.move_ids.move_dest_ids.picking_id
        self.assertEqual(first_ship.state, 'assigned')
        self.assertEqual(first_ship.move_ids.product_uom_qty, 1)

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        backorder_pick.action_assign()
        backorder_pick.button_validate()
        self.assertEqual(backorder_pick.state, 'done')

        second_ship = backorder_pick.move_ids.move_dest_ids.picking_id
        self.assertNotEqual(second_ship, first_ship)
        self.assertEqual(second_ship.state, 'assigned')
        self.assertEqual(second_ship.move_ids.product_uom_qty, 1)

    def test_backorder_pick_merges_into_existing_ship(self):
        """ Same scenario as `test_backorder_pick_without_reference_pushes_its_own_ship`,
        but both picks share the same originating reference (here a bare
        `stock.reference` - in practice the same sale order, via
        `sale_stock`). The backorder's push now merges into the SAME ship
        picking the first push already created - one combined delivery, not
        two - and the two pushed moves merge into a single, now fully
        reserved move. """
        reference = self.env['stock.reference'].create({'name': 'SO001'})
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)

        pick = self._create_picking(self.picking_type_pick, moves=[{
            'product_id': self.product.id,
            'product_uom_qty': 2,
            'uom_id': self.product.uom_id.id,
            'reference_ids': [Command.link(reference.id)],
        }])
        pick.action_confirm()
        pick.action_assign()
        action = pick.button_validate()
        self._process_backorder_wizard(action)
        self.assertEqual(pick.state, 'done')
        backorder_pick = self.env['stock.picking'].search([('backorder_id', '=', pick.id)])
        self.assertEqual(backorder_pick.state, 'confirmed')

        ship = pick.move_ids.move_dest_ids.picking_id
        self.assertEqual(ship.state, 'assigned')
        self.assertEqual(ship.move_ids.product_uom_qty, 1)

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        backorder_pick.action_assign()
        backorder_pick.button_validate()
        self.assertEqual(backorder_pick.state, 'done')

        self.assertEqual(backorder_pick.move_ids.move_dest_ids.picking_id, ship)
        self.assertEqual(len(ship.move_ids), 1)
        self.assertEqual(ship.move_ids.product_uom_qty, 2)
        self.assertEqual(ship.move_ids.quantity, 2)
        self.assertEqual(ship.state, 'assigned')

    def test_pushed_delivery_does_not_merge_across_different_partners(self):
        """ Two picks pushed one after another, for different partners,
        never merge into the same ship delivery - only same-partner pushes
        can combine (see `test_backorder_pick_merges_into_existing_ship`,
        where sharing a reference lets them merge). """
        partner_1, partner_2 = self.env['res.partner'].with_user(self.user_stock_manager).create(
            [{'name': 'Partner 1'}, {'name': 'Partner 2'}])
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 5)
        pick_1 = self._create_picking(self.picking_type_pick, moves=[(self.product, 2)], partner_id=partner_1.id)
        self._validate_picking(pick_1)
        pick_2 = self._create_picking(self.picking_type_pick, moves=[(self.product, 3)], partner_id=partner_2.id)
        self._validate_picking(pick_2)

        ship_1 = pick_1.move_ids.move_dest_ids.picking_id
        ship_2 = pick_2.move_ids.move_dest_ids.picking_id
        self.assertNotEqual(ship_1, ship_2)
        self.assertEqual(ship_1.partner_id, partner_1)
        self.assertEqual(ship_2.partner_id, partner_2)

    # ---- Editing a done pick updates its ship ----

    def test_editing_done_pick_quantity_updates_ships_reservation(self):
        """ Editing a done pick's move line quantity re-syncs the not-yet-
        done ship's own reservation live, following it down as it
        shrinks. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        pick = self._create_picking(self.picking_type_pick, moves=[(self.product, 10)])
        self._validate_picking(pick)
        ship = pick.move_ids.move_dest_ids.picking_id
        self.assertEqual(ship.move_ids.quantity, 10)

        pick.move_ids.move_line_ids.quantity = 5

        self.assertEqual(pick.move_ids.quantity, 5)
        self.assertEqual(ship.move_ids.product_uom_qty, 10)
        self.assertEqual(ship.move_ids.quantity, 5)
        self.assertEqual(ship.move_ids.state, 'partially_available')

    def test_editing_done_pick_lot_updates_ships_reservation(self):
        """ Same as above, but editing a done pick line's lot instead -
        the ship's reservation follows onto the new lot directly. """
        lot1 = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        lot2 = self.env['stock.lot'].create({'name': 'lot2', 'product_id': self.product_lot.id})
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 10, lot_id=lot1)
        pick = self._create_picking(self.picking_type_pick, moves=[(self.product_lot, 10)])
        self._validate_picking(pick)
        ship = pick.move_ids.move_dest_ids.picking_id
        self.assertEqual(ship.move_ids.move_line_ids.lot_id, lot1)

        pick.move_ids.move_line_ids.lot_id = lot2

        self.assertEqual(ship.move_ids.move_line_ids.lot_id, lot2)

    # ---- Reception chaining & merge ----

    def test_multistep_reception_merges_moves_sharing_a_reference(self):
        """ Two separate receipts for the same product, sharing the same
        stock reference (e.g. the same purchase order), push into ONE
        merged picking at the next reception step - not two - and that
        merged move correctly keeps both receipts as its origin. """
        self.warehouse.with_user(self.user_stock_manager).write({'reception_steps': 'three_steps'})
        reference = self.env['stock.reference'].create({'name': 'PO0001'})
        receipt_1 = self._create_picking(self.picking_type_in, moves=[{
            'product_id': self.product.id,
            'product_uom_qty': 5,
            'uom_id': self.product.uom_id.id,
            'location_id': self.supplier_location.id,
            'location_dest_id': self.warehouse.wh_input_stock_loc_id.id,
            'reference_ids': [Command.link(reference.id)],
        }])
        receipt_2 = self._create_picking(self.picking_type_in, moves=[{
            'product_id': self.product.id,
            'product_uom_qty': 3,
            'uom_id': self.product.uom_id.id,
            'location_id': self.supplier_location.id,
            'location_dest_id': self.warehouse.wh_input_stock_loc_id.id,
            'reference_ids': [Command.link(reference.id)],
        }])
        self._validate_picking(receipt_1 | receipt_2)

        input_move = receipt_1.move_ids.move_dest_ids
        self.assertTrue(input_move)
        self.assertEqual(receipt_2.move_ids.move_dest_ids, input_move)
        self.assertEqual(set(input_move.move_orig_ids.ids), set((receipt_1 | receipt_2).move_ids.ids))

    def test_multistep_reception_does_not_merge_moves_without_a_shared_reference(self):
        """ Same scenario, but with no stock reference at all - the two
        receipts' next steps stay on separate pickings instead. """
        self.warehouse.with_user(self.user_stock_manager).write({'reception_steps': 'three_steps'})
        receipt_1 = self._create_picking(self.picking_type_in, moves=[(self.product, 5)])
        receipt_2 = self._create_picking(self.picking_type_in, moves=[(self.product, 3)])
        self._validate_picking(receipt_1 | receipt_2)

        self.assertNotEqual(receipt_1._get_next_transfers(), receipt_2._get_next_transfers())

    # ---- Demand changes propagating through the push ----

    def test_ship_reservation_reduced_by_prior_shortage(self):
        """ A push-generated ship still only reserves what's actually net
        available at the output location - an earlier, unrelated delivery
        forced through with no stock there eats into what the pick just
        delivered, even though the pick itself fully satisfied its own
        demand. """
        forced_ship = self._create_picking(self.picking_type_out, moves=[(self.product, 1)])
        self._validate_picking(forced_ship, quantities={forced_ship.move_ids: 1})
        self._check_inventory(self.product, {self.output_location: -1})

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 2)
        pick = self._create_picking(self.picking_type_pick, moves=[(self.product, 2)])
        self._validate_picking(pick)
        self.assertEqual(pick.state, 'done')

        ship = pick.move_ids.move_dest_ids.picking_id
        self.assertEqual(len(ship.move_ids.move_line_ids), 1)
        self.assertAlmostEqual(ship.move_ids.quantity, 1)
        self.assertEqual(ship.move_ids.state, 'partially_available')

    def test_receiving_more_than_demanded_updates_pushed_move_demand(self):
        """ Receiving more than the receipt's own demand updates the
        downstream pushed move's own demand to match what was actually
        delivered, not capped at the original demand. """
        receipt = self._create_picking(self.picking_type_in, moves=[(self.product, 1)])
        self._validate_picking(receipt, quantities={receipt.move_ids: 9})
        self.assertEqual(receipt.state, 'done')

        pushed_move = receipt.move_ids.move_dest_ids
        self.assertEqual(pushed_move.product_uom_qty, 9)


class TestStockMoveMultiStepPull(TestStockCommon):
    """ Reservation across a real chained multi-step delivery (pick -> ship),
    with every step a genuine pull rule instead of the default (first step
    pull, every later step push) - the "rigid process" setup some users
    still rely on instead (see `archive/test_old_rules.py`) so every
    document is generated upfront, fully linked, as soon as the need
    exists, rather than the next step only appearing lazily once the one
    before it is done. """
    _test_user_groups = ('stock.group_stock_user',)

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.warehouse.with_user(cls.user_stock_manager).delivery_steps = 'pick_ship'
        # Every rule's own `location_dest_id` otherwise stores the whole
        # route's ultimate destination (the customer), not its immediate
        # next hop, so they'd all collide on the same location - narrow
        # each rule but the last to the next rule's own source first, then
        # convert every rule but the first to a real pull.
        rules = cls.warehouse.delivery_route_id.rule_ids.sorted('sequence').with_user(cls.user_stock_manager)
        for rule, next_rule in zip(rules, rules[1:]):
            rule.location_dest_id = next_rule.location_src_id
        rules[1:].action = 'pull'
        cls.picking_type_pick = cls.warehouse.pick_type_id
        cls.output_location = cls.warehouse.wh_output_stock_loc_id

    def test_sale_need_creates_the_whole_chain_upfront_linked(self):
        """ Unlike the default (push) setup, where the ship picking only
        appears once the pick is actually validated, a fully-pull chain
        creates pick *and* ship upfront, already linked - the ship waiting
        on the pick, which is the only step actually make-to-stock. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)

        self._sell(self.product, 10)

        pick = self.env['stock.move'].search([('picking_type_id', '=', self.picking_type_pick.id)])
        ship = self.env['stock.move'].search([('picking_type_id', '=', self.picking_type_out.id)])
        self.assertEqual(pick.procure_method, 'make_to_stock')
        self.assertEqual(pick.state, 'assigned')
        self.assertEqual(ship.procure_method, 'make_to_order')
        self.assertEqual(ship.state, 'waiting')
        self.assertEqual(ship.move_orig_ids, pick)

    def test_cancelling_the_pick_reverts_the_ship_to_mts(self):
        """ Cancelling the pick correctly reverts the ship it was feeding
        back to make-to-stock, instead of cancelling the whole chain with
        it. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        self._sell(self.product, 10)
        pick = self.env['stock.move'].search([('picking_type_id', '=', self.picking_type_pick.id)])
        ship = self.env['stock.move'].search([('picking_type_id', '=', self.picking_type_out.id)])

        pick.picking_id.action_cancel()

        self.assertEqual(ship.procure_method, 'make_to_stock')
        self.assertEqual(ship.state, 'confirmed')

    def test_moving_the_pick_off_its_destination_reverts_the_ship_to_mts(self):
        """ The link only holds as long as the pick's own destination and
        the ship's own source still physically line up - moving the pick's
        destination away before validating it breaks the link and reverts
        the ship to make-to-stock. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        self._sell(self.product, 10)
        pick = self.env['stock.move'].search([('picking_type_id', '=', self.picking_type_pick.id)])
        ship = self.env['stock.move'].search([('picking_type_id', '=', self.picking_type_out.id)])
        elsewhere = self._create_location('Elsewhere')

        pick.location_dest_id = elsewhere
        pick.picked = True
        pick.picking_id.button_validate()

        self.assertEqual(ship.procure_method, 'make_to_stock')
        self.assertEqual(ship.state, 'confirmed')

    def test_moving_the_ship_off_its_source_reverts_it_to_mts(self):
        """ Same as above, moving the other end instead - the ship's own
        source, away from the pick's destination. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        self._sell(self.product, 10)
        pick = self.env['stock.move'].search([('picking_type_id', '=', self.picking_type_pick.id)])
        ship = self.env['stock.move'].search([('picking_type_id', '=', self.picking_type_out.id)])
        elsewhere = self._create_location('Elsewhere')

        ship.location_id = elsewhere
        pick.picked = True
        pick.picking_id.button_validate()

        self.assertEqual(ship.procure_method, 'make_to_stock')
        self.assertEqual(ship.state, 'confirmed')

    def test_ship_reserves_only_what_the_pick_delivered(self):
        """ Once the ship is unblocked by the pick's own completion, it
        reserves exactly the quantity the pick delivered - not any other
        stock that happens to already be sitting at the output location
        too. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        self.env['stock.quant']._update_available_quantity(self.product, self.output_location, 5)
        self._sell(self.product, 10)
        pick = self.env['stock.move'].search([('picking_type_id', '=', self.picking_type_pick.id)])
        ship = self.env['stock.move'].search([('picking_type_id', '=', self.picking_type_out.id)])
        self.assertEqual(ship.state, 'waiting')

        pick.quantity = 10
        pick.picked = True
        pick.picking_id._action_done()

        self.assertEqual(ship.state, 'assigned')
        self.assertEqual(ship.quantity, 10)
        output_quant = self.env['stock.quant']._gather(self.product, self.output_location)
        self.assertEqual(output_quant.quantity, 15)
        self.assertEqual(output_quant.reserved_quantity, 10)
