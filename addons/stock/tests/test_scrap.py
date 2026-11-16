# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command

from odoo.addons.stock.tests.common import TestStockCommon


class TestScrap(TestStockCommon):
    """ `stock.move.is_scrap`/`action_scrap()` behavior: impact on quants,
    interaction with reserved move lines and UoM-aware reservation, the
    insufficient-quantity warning wizard, and serial-number availability
    checks.
    """

    _test_user_groups = ('stock.group_stock_user',)

    def test_scrap_reduces_quant(self):
        """ Scrapping a storable product creates a done move to the scrap
        destination and removes it from the source location's quant. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)

        scrap = self._scrap(self.product, 1)

        self.assertEqual(scrap.state, 'done')
        self.assertEqual(scrap.quantity, 1)
        self.assertEqual(scrap.location_dest_id, self.scrap_location)
        self._check_inventory(self.product, {self.stock_location: 0})

    def test_scrap_consumable_routes_through_inventory_destination(self):
        """ Scrapping a consumable touches no quant (consumables aren't
        tracked in stock to begin with) - but the scrap move's own
        destination is still treated as an inventory-type location, even
        when the chosen location's own usage is plain 'internal'. """
        consumable = self._create_product(name='Consumable', is_storable=False)
        alternate_location = self._create_location('Alternate Location')

        scrap = self._scrap(consumable, 1, dst_location=alternate_location)

        self.assertEqual(scrap.state, 'done')
        self.assertEqual(alternate_location.usage, 'internal')
        self.assertEqual(scrap.location_dest_usage, 'inventory')
        self._check_inventory(consumable, {self.stock_location: 0})

    def test_scrap_deletes_reserved_move_line(self):
        """ Scrapping the product a move line had reserved deletes that
        line and reverts the move back to confirmed - it can no longer
        fulfill its reservation. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        move = self._out_move(self.product, product_uom_qty=1, validate=False)
        move._action_confirm()
        self.assertEqual(move.state, 'assigned')
        self.assertEqual(len(move.move_line_ids), 1)

        self._scrap(self.product, 1)

        self.assertEqual(move.state, 'confirmed')
        self.assertEqual(len(move.move_line_ids), 0)

    def test_scrap_from_a_picking_adds_a_second_move(self):
        """ Scrapping linked to a picking adds the scrap as a second move
        on that picking, alongside the original - it doesn't touch or
        replace it, and the picking still validates normally afterward
        with its own reserved quantity untouched. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        delivery = self._deliver(moves=[(self.product, 9)], validate=False)
        delivery.action_confirm()
        self.assertEqual(delivery.move_ids.quantity, 9)

        scrap = self._scrap(self.product, 1, picking_id=delivery.id)

        all_moves = self.env['stock.move'].search([('picking_id', '=', delivery.id)])
        self.assertEqual(len(all_moves), 2)
        self.assertIn(scrap, all_moves)
        self.assertEqual(scrap.quantity, 1)

        self._validate_picking(delivery, confirm=False, assign=False)

        self.assertEqual(delivery.state, 'done')
        self.assertEqual(delivery.move_ids.quantity, 9)
        self._check_inventory(self.product, {self.customer_location: 9})

    def test_scrap_updates_uom_aware_reservation(self):
        """ Scrapping some of a product reserved by a move in a coarser UoM
        recomputes that move's own (UoM-converted) reserved quantity. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 11)
        move = self._create_move(
            self.product, self.stock_location, self.customer_location,
            uom_id=self.uom_pack_6.id, product_uom_qty=3)
        move._action_confirm()
        self.assertAlmostEqual(move.quantity, 11 / 6, places=2)

        scrap = self._scrap(self.product, 5)

        self.assertEqual(scrap.state, 'done')
        self.assertAlmostEqual(move.quantity, 1.0, places=2)

    def test_scrap_more_than_available_triggers_insufficient_qty_warning(self):
        """ Scrapping more than what's actually available opens the
        insufficient-quantity wizard; confirming anyway forces a negative
        quant, scaled correctly for the scrap's own UoM. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        scrap = self._create_scrap(self.product, 1, uom_id=self.uom_pack_6.id)

        warning = scrap.action_scrap()

        self.assertEqual(warning.get('res_model'), 'stock.warn.insufficient.qty.scrap')
        wizard = self.env['stock.warn.insufficient.qty.scrap'].with_context(warning['context']).create({})
        wizard.action_done()

        self.assertEqual(scrap.state, 'done')
        self.assertEqual(scrap.quantity, 1)
        self.assertEqual(scrap.uom_id, self.uom_pack_6)
        self._check_inventory(self.product, {self.stock_location: -5})

    def test_scrap_serial_number_warns_if_unavailable_at_source(self):
        """ Picking a serial number for a scrap warns if that serial isn't
        actually available at the scrap's own source location - calling
        `onchange()` directly rather than through a Form, since what's under
        test is the warning's own content and Form only logs it, it doesn't
        hand it back for an assertion. """
        lot = self.env['stock.lot'].create({'name': 'serial1', 'product_id': self.product_serial.id})
        shelf_1 = self._create_location('Shelf 1')
        shelf_2 = self._create_location('Shelf 2')
        self.env['stock.quant']._update_available_quantity(self.product_serial, shelf_1, 1, lot_id=lot)
        scrap = self._create_scrap(self.product_serial, 0, src_location=shelf_2)

        warning = scrap.onchange({'lot_ids': [Command.link(lot.id)]}, ['lot_ids'], {'lot_ids': {'context': {}}})

        self.assertIn('Unavailable Serial numbers', warning.get('warning', {}).get('message', ''))

    def test_scrap_move_back_to_stock_restores_quant_cleanly(self):
        """ Moving a reserved quantity's source to the scrap location (as
        if un-scrapping it back to stock) merges cleanly into the existing
        quant there - nothing but the quantity changes, no garbage quant
        left behind at the scrap location. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        self.env['stock.quant']._update_available_quantity(self.product, self.scrap_location, 10)
        move = self._create_move(self.product, self.stock_location, self.stock_location, product_uom_qty=10)
        move._action_confirm()
        self.assertEqual(move.quantity, 10)

        move.move_line_ids.location_id = self.scrap_location
        self._validate_move(move)

        self.assertEqual(move.state, 'done')
        quant = self.env['stock.quant']._gather(self.product, self.stock_location, strict=True)
        quant_scrap = self.env['stock.quant']._gather(self.product, self.scrap_location)
        self.assertEqual(quant.quantity, 20)
        self.assertFalse(quant_scrap.reserved_quantity)
        self.assertFalse(quant_scrap.quantity)

    def test_scrap_insufficient_qty_in_sublocation_triggers_warning(self):
        """ If a product is only available in a sublocation, scrapping
        from the parent location still triggers the insufficient-quantity
        warning - scrap doesn't search sublocations the way reservation
        does. """
        shelf_1 = self._create_location('Shelf 1')
        self.env['stock.quant']._update_available_quantity(self.product, shelf_1, 10)
        scrap = self._create_scrap(self.product, 5)

        warning = scrap.action_scrap()

        self.assertEqual(warning.get('res_model'), 'stock.warn.insufficient.qty.scrap')
