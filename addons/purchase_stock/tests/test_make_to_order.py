# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestForecastMakeToOrder(TransactionCase):
    """ The "Make to Order" alert of the forecasted report: a delivery lacking stock
    is purchased on order, linked to the delivery. """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.warehouse = cls.env['stock.warehouse'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.vendor = cls.env['res.partner'].create({'name': 'Vendor'})
        cls.customer = cls.env['res.partner'].create({'name': 'Customer'})
        cls.product = cls.env['product.product'].create({
            'name': 'Desk',
            'is_storable': True,
            'seller_ids': [(0, 0, {'partner_id': cls.vendor.id, 'price': 10})],
        })
        cls.report = cls.env['stock.forecasted_product_product']

    def _create_delivery(self, quantity):
        picking = self.env['stock.picking'].create({
            'picking_type_id': self.warehouse.out_type_id.id,
            'partner_id': self.customer.id,
            'move_ids': [(0, 0, {
                'product_id': self.product.id,
                'product_uom_qty': quantity,
                'location_id': self.warehouse.lot_stock_id.id,
                'location_dest_id': self.env.ref('stock.stock_location_customers').id,
            })],
        })
        picking.action_confirm()
        return picking.move_ids

    def _shortages(self, move):
        report = self.report.with_context(move_to_match_ids=move.ids, warehouse_id=self.warehouse.id)
        return report._get_report_data(product_ids=self.product.ids)['make_to_order']

    def _make_to_order(self, move):
        shortage = self._shortages(move)[0]
        return self.report.action_make_to_order(shortage['move_id'], shortage['quantity'])

    def test_purchase_missing_quantity(self):
        self.env['stock.quant']._update_available_quantity(self.product, self.warehouse.lot_stock_id, 3)
        move = self._create_delivery(10)
        self.assertEqual(move.quantity, 3)

        shortages = self._shortages(move)
        self.assertEqual(len(shortages), 1)
        self.assertEqual(shortages[0]['quantity'], 7)
        self.assertTrue(shortages[0]['route'])

        self._make_to_order(move)
        # the reserved part stays in the move, the missing one is ordered for the delivery
        self.assertEqual(move.product_uom_qty, 3)
        self.assertEqual(move.state, 'assigned')
        mto_move = move.picking_id.move_ids - move
        self.assertEqual(mto_move.product_uom_qty, 7)
        self.assertEqual(mto_move.procure_method, 'make_to_order')
        po_line = mto_move.created_purchase_line_ids
        self.assertEqual(po_line.product_qty, 7)
        self.assertEqual(po_line.partner_id, self.vendor)

        # already ordered: nothing to order anymore
        self.assertFalse(self._shortages(move | mto_move))

        # receiving the purchase delivers the customer
        po_line.order_id.button_confirm()
        receipt = po_line.order_id.picking_ids
        receipt.button_validate()
        self.assertEqual(mto_move.state, 'assigned')

    def test_purchase_whole_move(self):
        move = self._create_delivery(5)
        self._make_to_order(move)
        self.assertEqual(move.procure_method, 'make_to_order')
        self.assertEqual(move.created_purchase_line_ids.product_qty, 5)
        self.assertEqual(move.state, 'waiting')
        self.assertFalse(self._shortages(move))

    def test_nothing_missing(self):
        self.env['stock.quant']._update_available_quantity(self.product, self.warehouse.lot_stock_id, 10)
        move = self._create_delivery(4)
        self.assertFalse(self._shortages(move))

    def test_purchase_two_steps_delivery(self):
        """ With pick + ship, the pick takes the products from stock (the ship is
        pushed when it is done): its missing quantity is ordered on order. """
        self.warehouse.delivery_steps = 'pick_ship'
        self.env['stock.quant']._update_available_quantity(self.product, self.warehouse.lot_stock_id, 2)
        customers = self.env.ref('stock.stock_location_customers')
        self.env['stock.rule'].run([self.env['stock.rule'].Procurement(
            self.product, 6, self.product.uom_id, customers, 'test', 'SO-TEST', self.env.company,
            {'warehouse_id': self.warehouse},
        )])
        pick = self.env['stock.move'].search([('product_id', '=', self.product.id)])
        self.assertEqual(pick.forecasted_location_id, customers)

        shortages = self._shortages(pick)
        self.assertEqual(shortages[0]['quantity'], 4)

        self._make_to_order(pick)
        self.assertEqual(pick.product_uom_qty, 2)
        mto_pick = pick.picking_id.move_ids - pick
        self.assertEqual(mto_pick.procure_method, 'make_to_order')
        self.assertEqual(mto_pick.forecasted_location_id, customers)
        self.assertEqual(mto_pick.created_purchase_line_ids.product_qty, 4)
        self.assertFalse(self._shortages(pick | mto_pick))
