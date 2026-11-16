# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command
from odoo.exceptions import UserError

from odoo.addons.stock.tests.common import TestStockCommon


class TestLotSerial(TestStockCommon):
    """ Lot and serial number tracking, including serial number generation.
    """

    _test_user_groups = ('stock.group_stock_user',)

    def test_duplicate_serial_number_warns_and_auto_corrects_location(self):
        """ Assigning a serial number already in use elsewhere warns, both at
        the move-line and the move level - and assigning an existing lot by
        id (not just by name) auto-corrects the line's source location to
        where that lot's quant actually is. """
        pack_location = self._create_location('Pack')
        lot1 = self.env['stock.lot'].create({'name': 'serial1', 'product_id': self.product_serial.id})
        self.env['stock.quant']._update_available_quantity(self.product_serial, pack_location, 1, lot_id=lot1)

        move = self._create_move(self.product_serial, self.supplier_location, self.stock_location, product_uom_qty=1)
        move_line = self.env['stock.move.line'].create({
            'move_id': move.id,
            'product_id': move.product_id.id,
            'quantity': 1,
            'uom_id': move.uom_id.id,
            'location_id': move.location_id.id,
            'location_dest_id': move.location_dest_id.id,
            'lot_name': lot1.name,
        })

        warning = move_line._onchange_serial_number()
        self.assertTrue(warning)

        move_line.write({'lot_name': False, 'lot_id': lot1.id})
        warning = move_line._onchange_serial_number()
        self.assertTrue(warning)
        self.assertEqual(move_line.location_id, pack_location)

        move_line.write({'lot_name': False, 'lot_id': False})
        warning = move.onchange({'lot_ids': [Command.link(lot1.id)]}, ['lot_ids'], {'lot_ids': {'context': {}}})
        self.assertIn('Unavailable Serial numbers', warning.get('warning', {}).get('message', ''))

    def test_setting_move_lot_ids_guesses_each_lines_location_and_package(self):
        """ Setting serial numbers directly on the move creates one line per
        serial, each guessing its source location (and package) from where
        that serial's quant actually sits - falling back to the move's own
        source location when a serial is somewhere unexpected. """
        shelf = self._create_location('Shelf')
        lots = self.env['stock.lot'].create([
            {'name': name, 'product_id': self.product_serial.id} for name in ['sn01', 'sn02', 'sn03']
        ])
        package = self.env['stock.package'].create({'name': 'Pack A'})

        self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lots[0])
        self.env['stock.quant']._update_available_quantity(self.product_serial, shelf, 1, lot_id=lots[1], package_id=package)
        # Outside the move's source location's own hierarchy entirely - not
        # reachable, so the line falls back to the move's own source.
        self.env['stock.quant']._update_available_quantity(self.product_serial, self.scrap_location, 1, lot_id=lots[2])

        move = self._create_move(self.product_serial, self.stock_location, self.customer_location, product_uom_qty=3)
        move._action_confirm()
        move.lot_ids = lots

        self.assertRecordValues(move.move_line_ids, [
            {'location_id': self.stock_location.id, 'lot_id': lots[0].id, 'package_id': False},
            {'location_id': shelf.id, 'lot_id': lots[1].id, 'package_id': package.id},
            {'location_id': self.stock_location.id, 'lot_id': lots[2].id, 'package_id': False},
        ])

    def test_tracked_move_quantity_and_lot_ids_combined_write(self):
        """ Writing `quantity` and `lot_ids` together on a tracked move keeps
        `move.quantity` in sync with the resulting `move.move_line_ids` -
        otherwise the picking could validate to 'done' with a positive
        quantity but no line and no serial number recorded at all (phantom
        delivery, broken traceability). Growing the quantity back up
        re-autopopulates lines, for whichever lots are specified or the next
        available ones otherwise. """
        lots = self.env['stock.lot'].create([
            {'name': 'SN-%d' % index, 'product_id': self.product_serial.id} for index in range(1, 7)
        ])
        for lot in lots:
            self.env['stock.quant']._update_available_quantity(self.product_serial, self.stock_location, 1, lot_id=lot)

        move = self._out_move(self.product_serial, product_uom_qty=6, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')
        self.assertEqual(len(move.move_line_ids), 6)

        # The exact write the form sends when the user types "1" in the
        # Quantity column AND clears every lot in the Serial Numbers widget
        # on the same form save.
        move.write({'quantity': 1.0, 'lot_ids': [Command.set([])]})
        self.assertFalse(move.move_line_ids)
        self.assertEqual(move.quantity, 0.0)

        move.write({'quantity': 2.0, 'lot_ids': [Command.set((lots[1] | lots[2]).ids)]})
        self.assertRecordValues(move.move_line_ids, [
            {'lot_id': lots[1].id},
            {'lot_id': lots[2].id},
        ])

        move.quantity = 3.0
        self.assertEqual(len(move.move_line_ids), 3)

    def test_creating_a_lot_from_a_picking_that_disallows_it_raises(self):
        """ A picking type with `use_create_lots=False, use_existing_lots=True`
        can't create a brand new lot from the picking's own context - it
        can only pick an existing one. """
        self.picking_type_out.with_user(self.user_stock_manager).write(
            {'use_create_lots': False, 'use_existing_lots': True})
        delivery = self._create_picking(self.picking_type_out, moves=[(self.product_lot, 2)])

        with self.assertRaises(UserError):
            self.env['stock.lot'].with_context(active_picking_id=delivery.id).create({
                'name': 'lot1', 'product_id': self.product_lot.id,
            })

        lot = self.env['stock.lot'].create({'name': 'lot1', 'product_id': self.product_lot.id})
        delivery.action_confirm()
        delivery.move_ids.quantity = 2
        delivery.move_line_ids.lot_id = lot
        delivery.move_ids.picked = True
        delivery.button_validate()

        self.assertEqual(delivery.state, 'done')

    def test_onchange_lot_ids_without_reservation(self):
        """ Setting `lot_ids` on an unreserved move's Form (receiving
        into stock, nothing to reserve against) keeps an existing move
        line with a still-valid lot untouched, drops a line whose lot
        gets removed, and adds a new line for every newly-added lot -
        recomputing the move's own quantity to match, since nothing is
        reserved yet to cap it. """
        serials = self.env['stock.lot'].create([
            {'name': f'Serial {i + 1}', 'product_id': self.product_serial.id} for i in range(5)
        ])
        move = self._create_move(self.product_serial, self.supplier_location, self.stock_location, product_uom_qty=3)
        move._action_confirm()

        move.lot_ids = serials[:2]
        # The original demand (3) still covers it: 2 explicit serials plus
        # one untracked line for the remainder.
        self.assertEqual(move.quantity, 3)
        self.assertRecordValues(move.move_line_ids, [
            {'quantity': 1.0, 'lot_id': serials[0].id},
            {'quantity': 1.0, 'lot_id': serials[1].id},
            {'quantity': 1.0, 'lot_id': False},
        ])

        # Removes serial 2 but keeps serial 1 and adds serials 3 -> 5: 4
        # distinct serials now exceed the original demand of 3, so the
        # quantity grows to fit them all - no room left for an untracked
        # remainder line.
        move.lot_ids = serials[0] + serials[2:]
        self.assertEqual(move.quantity, 4)
        self.assertRecordValues(move.move_line_ids, [
            {'quantity': 1.0, 'lot_id': serials[0].id},
            {'quantity': 1.0, 'lot_id': serials[2].id},
            {'quantity': 1.0, 'lot_id': serials[3].id},
            {'quantity': 1.0, 'lot_id': serials[4].id},
        ])

    def test_onchange_lot_ids_with_reservation(self):
        """ Setting `lot_ids` on an already-reserved delivery's Form
        recomputes the move's quantity to match what's actually
        available for each chosen lot - maxing out at what's really in
        stock, and falling back to a minimum of 1 unit when a chosen lot
        has no quant at all. """
        lots = self.env['stock.lot'].create([
            {'name': f'Lot {i + 1}', 'product_id': self.product_lot.id} for i in range(4)
        ])
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 10, lot_id=lots[0])
        self.env['stock.quant']._update_available_quantity(self.product_lot, self.stock_location, 3, lot_id=lots[1])
        move = self._out_move(self.product_lot, product_uom_qty=10, validate=False)
        move._action_confirm()
        self.assertEqual(move.quantity, 10)

        # Only lot1 has enough stock to cover the whole demand.
        move.lot_ids = lots[0]
        self.assertEqual(move.quantity, 10)
        self.assertRecordValues(move.move_line_ids, [{'lot_id': lots[0].id, 'quantity': 10.0}])

        # lot2 only has 3 available, lot3/lot4 have none at all - each
        # still gets at least 1 unit reserved.
        move.lot_ids = lots[1] + lots[2] + lots[3]
        self.assertEqual(move.quantity, 5)
        self.assertRecordValues(move.move_line_ids, [
            {'lot_id': lots[1].id, 'quantity': 3.0},
            {'lot_id': lots[2].id, 'quantity': 1.0},
            {'lot_id': lots[3].id, 'quantity': 1.0},
        ])
