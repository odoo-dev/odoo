from datetime import timedelta

from odoo import fields
from odoo.tests import tagged

from odoo.addons.pos_stock.tests.common import CommonPosStockTest


@tagged('post_install', '-at_install')
class TestSelfOrderLots(CommonPosStockTest):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.stock_location = cls.pos_config_usd.picking_type_id.default_location_src_id
        cls.untracked_product = cls._create_storable('Kiosk Untracked')
        cls.serial_product = cls._create_storable('Kiosk Serial', store_by='serial')
        cls.lot_product = cls._create_storable('Kiosk Lot', store_by='lot')
        cls.env['stock.quant']._update_available_quantity(cls.untracked_product, cls.stock_location, 10)

    @classmethod
    def _create_storable(cls, name, store_by='untracked'):
        return cls.env['product.product'].create({
            'name': name,
            'is_storable': True,
            'store_by': store_by,
            'available_in_pos': True,
            'list_price': 10.0,
        })

    def _add_lot_stock(self, product, lot_name, qty):
        lot = self.env['stock.lot'].create({'name': lot_name, 'product_id': product.id})
        self.env['stock.quant']._update_available_quantity(product, self.stock_location, qty, lot_id=lot)
        return lot

    def _create_paid_order(self, line_data, source='kiosk'):
        order, _refund = self.create_backend_pos_order({
            'order_data': {'source': source},
            'line_data': line_data,
            'payment_data': [{'payment_method_id': self.cash_payment_method.id}],
        })
        return order

    def test_kiosk_mixed_single_picking(self):
        """ Untracked + serial product: one done picking, serial taken from stock. """
        serial = self._add_lot_stock(self.serial_product, 'SN-1', 1)
        order = self._create_paid_order([
            {'product_id': self.untracked_product.id},
            {'product_id': self.serial_product.id},
        ])
        self.assertEqual(len(order.picking_ids), 1)
        self.assertEqual(order.picking_ids.state, 'done')
        self.assertEqual(order.picking_ids.move_line_ids.filtered(lambda ml: ml.product_id == self.serial_product).lot_id, serial)
        serial_line = order.lines.filtered(lambda l: l.product_id == self.serial_product)
        self.assertEqual(serial_line.pack_lot_ids.mapped('lot_name'), ['SN-1'])

    def test_kiosk_lot_only(self):
        lot = self._add_lot_stock(self.lot_product, 'LOT-1', 5)
        order = self._create_paid_order([{'product_id': self.lot_product.id, 'qty': 3}])
        self.assertEqual(len(order.picking_ids), 1)
        self.assertEqual(order.picking_ids.state, 'done')
        self.assertEqual(order.picking_ids.move_line_ids.lot_id, lot)
        self.assertEqual(order.picking_ids.move_line_ids.quantity, 3)
        self.assertEqual(order.lines.pack_lot_ids.lot_name, 'LOT-1')

    def test_kiosk_lot_split_over_lots(self):
        """ No lot covers the line: one line per lot, same total, one picking. """
        lot_a = self._add_lot_stock(self.lot_product, 'LOT-A', 5)
        lot_b = self._add_lot_stock(self.lot_product, 'LOT-B', 4)
        order = self._create_paid_order([{'product_id': self.lot_product.id, 'qty': 6}])
        amount_total = order.amount_total
        self.assertEqual(
            sorted(order.lines.mapped(lambda l: (l.pack_lot_ids.lot_name, l.qty))),
            [('LOT-A', 5), ('LOT-B', 1)],
        )
        self.assertAlmostEqual(sum(order.lines.mapped('price_subtotal_incl')), amount_total)
        self.assertFalse(order.is_edited)
        self.assertEqual(len(order.picking_ids), 1)
        self.assertEqual(order.picking_ids.state, 'done')
        move_lines = order.picking_ids.move_line_ids
        self.assertEqual(sum(move_lines.filtered(lambda ml: ml.lot_id == lot_a).mapped('quantity')), 5)
        self.assertEqual(sum(move_lines.filtered(lambda ml: ml.lot_id == lot_b).mapped('quantity')), 1)

    def test_kiosk_lot_partial_stock(self):
        """ Lots cover only part of the line: the rest gets a line without lot, in a backorder. """
        self._add_lot_stock(self.lot_product, 'LOT-A', 2)
        self._add_lot_stock(self.lot_product, 'LOT-B', 1)
        order = self._create_paid_order([{'product_id': self.lot_product.id, 'qty': 6}])
        self.assertEqual(
            sorted(order.lines.mapped(lambda l: (l.pack_lot_ids.lot_name or '', l.qty))),
            [('', 3), ('LOT-A', 2), ('LOT-B', 1)],
        )
        done_picking = order.picking_ids.filtered(lambda p: p.state == 'done')
        self.assertEqual(sum(done_picking.move_line_ids.mapped('quantity')), 3)
        self.assertEqual(len(order.picking_ids), 2)
        backorder_note = order.message_ids.filtered(lambda m: 'backorder' in m.body)
        self.assertEqual(len(backorder_note), 1)
        self.assertIn('Kiosk Lot', backorder_note.body)

    def test_kiosk_serial_multi_qty_and_lines(self):
        """ One serial per unit, never the same serial twice in the order. """
        for name in ('SN-A', 'SN-B', 'SN-C'):
            self._add_lot_stock(self.serial_product, name, 1)
        order = self._create_paid_order([
            {'product_id': self.serial_product.id, 'qty': 2},
            {'product_id': self.serial_product.id, 'qty': 1},
        ])
        lot_names = order.lines.pack_lot_ids.mapped('lot_name')
        self.assertEqual(sorted(lot_names), ['SN-A', 'SN-B', 'SN-C'])
        self.assertEqual(len(order.picking_ids), 1)
        self.assertEqual(order.picking_ids.state, 'done')

    def test_kiosk_mobile_source(self):
        self._add_lot_stock(self.serial_product, 'SN-M', 1)
        order = self._create_paid_order([{'product_id': self.serial_product.id}], source='mobile')
        self.assertEqual(order.lines.pack_lot_ids.lot_name, 'SN-M')
        self.assertEqual(order.picking_ids.state, 'done')

    def test_kiosk_no_stock_backorder(self):
        """ No serial in stock: unchanged behaviour (done picking + backorder). """
        order = self._create_paid_order([
            {'product_id': self.untracked_product.id},
            {'product_id': self.serial_product.id},
        ])
        self.assertFalse(order.lines.pack_lot_ids)
        self.assertEqual(len(order.picking_ids), 2)

    def test_kiosk_partial_serial_stock(self):
        self._add_lot_stock(self.serial_product, 'SN-P', 1)
        order = self._create_paid_order([{'product_id': self.serial_product.id, 'qty': 2}])
        self.assertEqual(order.lines.pack_lot_ids.lot_name, 'SN-P')
        done_picking = order.picking_ids.filtered(lambda p: p.state == 'done')
        self.assertEqual(done_picking.move_line_ids.lot_id.name, 'SN-P')
        self.assertEqual(len(order.picking_ids), 2)

    def test_pos_order_untouched(self):
        self._add_lot_stock(self.serial_product, 'SN-POS', 1)
        order = self._create_paid_order([{'product_id': self.serial_product.id}], source='pos')
        self.assertFalse(order.lines.pack_lot_ids)

    def test_kiosk_existing_lot_kept(self):
        self._add_lot_stock(self.serial_product, 'SN-1', 1)
        self._add_lot_stock(self.serial_product, 'SN-2', 1)
        order = self._create_paid_order([{
            'product_id': self.serial_product.id,
            'pack_lot_ids': [(0, 0, {'lot_name': 'SN-2'})],
        }])
        self.assertEqual(order.lines.pack_lot_ids.lot_name, 'SN-2')
        self.assertEqual(order.picking_ids.move_line_ids.lot_id.name, 'SN-2')

    def test_kiosk_refund_serial(self):
        serial = self._add_lot_stock(self.serial_product, 'SN-R', 1)
        order, refund = self.create_backend_pos_order({
            'order_data': {'source': 'kiosk'},
            'line_data': [{'product_id': self.serial_product.id}],
            'payment_data': [{'payment_method_id': self.cash_payment_method.id}],
            'refund_data': [{'payment_method_id': self.cash_payment_method.id}],
        })
        self.assertEqual(order.picking_ids.move_line_ids.lot_id, serial)
        self.assertEqual(refund.lines.pack_lot_ids.lot_name, 'SN-R')
        self.assertEqual(refund.picking_ids.move_line_ids.lot_id, serial)
        self.assertEqual(refund.picking_ids.state, 'done')

    def test_kiosk_update_at_closing_distinct_serials(self):
        """ Stock moves at closing: two orders of the session get different serials. """
        self.env.company.point_of_sale_update_stock_quantities = 'closing'
        self._add_lot_stock(self.serial_product, 'SN-X', 1)
        self._add_lot_stock(self.serial_product, 'SN-Y', 1)
        order_1 = self._create_paid_order([{'product_id': self.serial_product.id}])
        order_2 = self._create_paid_order([{'product_id': self.serial_product.id}])
        self.assertTrue(order_1.session_id.update_stock_at_closing)
        self.assertFalse(order_1.picking_ids)
        self.assertEqual(
            sorted((order_1 | order_2).lines.pack_lot_ids.mapped('lot_name')),
            ['SN-X', 'SN-Y'],
        )

    def test_kiosk_update_at_closing_refund_gives_serial_back(self):
        self.env.company.point_of_sale_update_stock_quantities = 'closing'
        self._add_lot_stock(self.serial_product, 'SN-R', 1)
        self.create_backend_pos_order({
            'order_data': {'source': 'kiosk'},
            'line_data': [{'product_id': self.serial_product.id}],
            'payment_data': [{'payment_method_id': self.cash_payment_method.id}],
            'refund_data': [{'payment_method_id': self.cash_payment_method.id}],
        })
        order = self._create_paid_order([{'product_id': self.serial_product.id}])
        self.assertEqual(order.lines.pack_lot_ids.lot_name, 'SN-R')

    def test_kiosk_expired_lot_skipped(self):
        if 'use_expiration_date' not in self.env['product.product']._fields:
            self.skipTest("Needs product_expiry")
        fefo = self.env['product.removal'].search([('method', '=', 'fefo')])
        self.lot_product.categ_id.removal_strategy_id = fefo
        self.lot_product.use_expiration_date = True
        now = fields.Datetime.now()
        for name, days in (('EXPIRED', -3), ('FRESH', 5)):
            lot = self.env['stock.lot'].create({
                'name': name,
                'product_id': self.lot_product.id,
                'expiration_date': now + timedelta(days=days + 1),
                'removal_date': now + timedelta(days=days),
            })
            self.env['stock.quant']._update_available_quantity(self.lot_product, self.stock_location, 5, lot_id=lot)
        order = self._create_paid_order([{'product_id': self.lot_product.id, 'qty': 2}])
        self.assertEqual(order.lines.pack_lot_ids.lot_name, 'FRESH')
