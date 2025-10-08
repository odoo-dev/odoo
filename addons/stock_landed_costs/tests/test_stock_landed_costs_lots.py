# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.stock_account.tests.test_lot_valuation import TestLotValuation
from odoo.tests import tagged, Form
from odoo import Command


@tagged('post_install', '-at_install')
class TestStockLandedCostsLots(TestLotValuation):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.stock_valuation_account = cls.env['account.account'].create({
            'name': 'Stock Valuation',
            'code': 'STVAL',
            'account_type': 'asset_current',
            'reconcile': True,
        })
        cls.expense_account = cls.env['account.account'].create({
            'name': 'Expense Account',
            'code': 'EXP',
            'account_type': 'expense',
            'reconcile': True,
        })
        cls.productlc1 = cls.env['product.product'].create({
            'name': 'product1',
            'type': 'service',
            'landed_cost_ok': True,
            'categ_id': cls.env.ref('product.product_category_goods').id,
            'property_account_expense_id': cls.expense_account.id,
        })
        cls.productlc1.categ_id.write({
            'property_stock_valuation_account_id': cls.stock_valuation_account.id,
        })
        cls.stock_valuation_account.account_stock_expense_id = cls.expense_account
        cls.vendor1 = cls.env['res.partner'].create({'name': 'vendor1'})

    def test_stock_landed_costs_lots(self):
        self.product1.product_tmpl_id.categ_id.property_valuation = 'real_time'
        po_form = Form(self.env['purchase.order'])
        po_form.partner_id = self.vendor1
        with po_form.order_line.new() as po_line:
            po_line.product_id = self.product1
            po_line.product_qty = 15
            po_line.price_unit = 10
            po_line.tax_ids.clear()
        po = po_form.save()
        po.button_confirm()
        picking_1 = po.picking_ids

        product2 = self.env['product.product'].create({
            'name': 'product2',
            'is_storable': True,
            'tracking': 'lot',
            'lot_valuated': True,
            'categ_id': self.env.ref('product.product_category_goods').id,
            'property_account_expense_id': self.expense_account.id,
        })
        po_form = Form(self.env['purchase.order'])
        po_form.partner_id = self.vendor1
        with po_form.order_line.new() as po_line:
            po_line.product_id = product2
            po_line.product_qty = 10
            po_line.price_unit = 11
            po_line.tax_ids.clear()
        po = po_form.save()
        po.button_confirm()
        picking_2 = po.picking_ids

        # Confirm and assign picking
        (picking_1 | picking_2).action_confirm()
        picking_1.move_ids.move_line_ids = [Command.clear()] + [Command.create({
            'product_id': self.product1.id,
            'lot_name': lot_name,
            'quantity': 5,
            'location_id': self.supplier_location.id,
            'location_dest_id': self.stock_location.id,
        }) for lot_name in ['LClotA1', 'LClotA2', 'LClotA3']]
        picking_2.move_ids.move_line_ids = [Command.clear()] + [Command.create({
            'product_id': product2.id,
            'lot_name': lot_name,
            'quantity': 5,
            'location_id': self.supplier_location.id,
            'location_dest_id': self.stock_location.id,
        }) for lot_name in ['LClotB1', 'LClotB2']]
        (picking_1 | picking_2).move_ids.picked = True
        (picking_1 | picking_2).button_validate()

        lc_form = Form(self.env['stock.landed.cost'])
        lc_form.picking_ids = (picking_1 | picking_2)
        with lc_form.cost_lines.new() as cost_line:
            cost_line.product_id = self.productlc1
            cost_line.price_unit = 6
        lc = lc_form.save()
        lc.compute_landed_cost()
        lc.button_validate()

        # I check that the landed cost is now "Closed" and that it has an accounting entry
        self.assertEqual(lc.state, "done")
        self.assertTrue(lc.account_move_id)
        self.assertEqual(len(lc.account_move_id.line_ids), 4)

        lc_value = sum(lc.account_move_id.line_ids.filtered(lambda aml: aml.account_id.name.startswith('Expenses')).mapped('debit'))
        product_value = abs(self.productlc1.total_value)
        self.assertEqual(lc_value, product_value)
        lot = self.env['stock.lot'].search([('name', 'ilike', 'LClot')])
        lot_product_a = lot.filtered(lambda l: l.product_id == self.product1)
        lot_product_b = lot - lot_product_a
        self.assertRecordValues(lot_product_a, [
            {'product_id': self.product1.id, 'product_qty': 5.0, 'total_value': 51.0},
            {'product_id': self.product1.id, 'product_qty': 5.0, 'total_value': 51.0},
            {'product_id': self.product1.id, 'product_qty': 5.0, 'total_value': 51.0},
        ])
        self.assertRecordValues(lot_product_b, [
            {'product_id': product2.id, 'product_qty': 5.0, 'total_value': 56.5},
            {'product_id': product2.id, 'product_qty': 5.0, 'total_value': 56.5},
        ])

        for l, price in zip(lot_product_a, [10.2, 10.2, 10.2]):
            self.assertEqual(l.standard_price, price)
        for l, price in zip(lot_product_b, [11.3, 11.3]):
            self.assertEqual(l.standard_price, price)
        self._make_out_move(self.product1, 9, lot_ids=[lot_product_a[0], lot_product_a[1], lot_product_a[2]])
        self.assertRecordValues(lot_product_a, [
            {'product_id': self.product1.id, 'product_qty': 2.0, 'total_value': 20.4},
            {'product_id': self.product1.id, 'product_qty': 2.0, 'total_value': 20.4},
            {'product_id': self.product1.id, 'product_qty': 2.0, 'total_value': 20.4},
        ])
        self._make_out_move(product2, 4, lot_ids=[lot_product_b[0], lot_product_b[1]])
        self.assertRecordValues(lot_product_b, [
            {'product_id': product2.id, 'product_qty': 3.0, 'total_value': 33.9},
            {'product_id': product2.id, 'product_qty': 3.0, 'total_value': 33.9},
        ])

    def test_landed_cost_when_partially_sold(self):
        """
        check that the landed costs split correctly between lot/ serial numbers
        when some lot/serial number are empty (no share of the landed cost for those)
        or when some have a portion of their quantity already sold (check that it uses the
        remaining quantity)
        """
        product1 = self.env['product.product'].create({
            'name': 'product2',
            'is_storable': True,
            'tracking': 'lot',
            'lot_valuated': True,
            'categ_id': self.env.ref('product.product_category_goods').id,
            'property_account_expense_id': self.expense_account.id,
        })
        product1.categ_id.property_cost_method = 'fifo'
        po_form = Form(self.env['purchase.order'])
        po_form.partner_id = self.vendor1
        with po_form.order_line.new() as po_line:
            po_line.product_id = product1
            po_line.product_qty = 5
            po_line.price_unit = 10000
            po_line.tax_ids.clear()
        po = po_form.save()
        po.button_confirm()
        picking_1 = po.picking_ids
        # split in lots
        picking_1.move_ids.move_line_ids = [Command.clear()] + [Command.create({
            'product_id': product1.id,
            'lot_name': lot_name,
            'quantity': lot_quantity,
            'location_id': self.supplier_location.id,
            'location_dest_id': self.stock_location.id,
        }) for (lot_name, lot_quantity) in [('L1', 1), ('L2', 2), ('L3', 1), ('L4', 1)]]
        picking_1.move_ids.picked = True
        picking_1.button_validate()
        # deliver 2 products
        (lot1, lot2, lot3, lot4) = picking_1.move_ids.move_line_ids.mapped('lot_id').sorted('id')
        self.assertRecordValues((lot1 | lot2 | lot3 | lot4), [
            {'product_qty': 1.0, 'total_value': 10000.0},
            {'product_qty': 2.0, 'total_value': 20000.0},
            {'product_qty': 1.0, 'total_value': 10000.0},
            {'product_qty': 1.0, 'total_value': 10000.0},
        ])
        self._make_out_move(product1, quantity=2, lot_ids=[lot1, lot2])

        # add the landed cost
        lc_form = Form(self.env['stock.landed.cost'])
        lc_form.picking_ids = picking_1
        with lc_form.cost_lines.new() as cost_line:
            cost_line.product_id = self.productlc1
            cost_line.price_unit = 5000
        lc = lc_form.save()
        lc.compute_landed_cost()
        lc.button_validate()

        self.assertRecordValues((lot1 | lot2 | lot3 | lot4), [
            {'product_qty': 0.0, 'total_value': 0.0},
            {'product_qty': 1.0, 'total_value': 11000.0},
            {'product_qty': 1.0, 'total_value': 11000.0},
            {'product_qty': 1.0, 'total_value': 11000.0},
        ])
