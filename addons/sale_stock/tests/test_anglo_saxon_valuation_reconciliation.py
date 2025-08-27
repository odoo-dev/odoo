# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.stock_account.tests.test_anglo_saxon_valuation_reconciliation_common import ValuationReconciliationTestCommon
from odoo.tests import Form, tagged


class TestValuationReconciliationCommon(ValuationReconciliationTestCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.other_currency = cls.setup_other_currency('EUR')

        # Set the invoice_policy to delivery to have an accurate COGS entry.
        cls.test_product_delivery.invoice_policy = 'delivery'

    def _create_sale(self, product, date, quantity=1.0):
        order = self.env['sale.order'].sudo().create({
            'partner_id': self.partner_a.id,
            'currency_id': self.other_currency.id,
            'order_line': [
                (0, 0, {
                    'name': product.name,
                    'product_id': product.id,
                    'product_uom_qty': quantity,
                    'product_uom_id': product.uom_id.id,
                    'price_unit': 66.0,
                })],
            'date_order': date,
        })
        order.action_confirm()
        return order

    def _create_invoice_for_so(self, sale_order, product, date, quantity=1.0):
        rslt = self.env['account.move'].create({
            'partner_id': self.partner_a.id,
            'currency_id': self.other_currency.id,
            'move_type': 'out_invoice',
            'invoice_date': date,
            'invoice_line_ids': [(0, 0, {
                'name': 'test line',
                'account_id': self.company_data['default_account_revenue'].id,
                'price_unit': 66.0,
                'quantity': quantity,
                'discount': 0.0,
                'product_id': product.id,
                'sale_line_ids': [(6, 0, sale_order.order_line.ids)],
            })],
        })

        sale_order.invoice_ids += rslt
        return rslt

    def _set_initial_stock_for_product(self, product):
        move1 = self.env['stock.move'].create({
            'location_id': self.env.ref('stock.stock_location_suppliers').id,
            'location_dest_id': self.company_data['default_warehouse'].lot_stock_id.id,
            'product_id': product.id,
            'product_uom': product.uom_id.id,
            'product_uom_qty': 11,
            'price_unit': 13,
        })
        move1._action_confirm()
        move1._action_assign()
        move1.move_line_ids.write({'quantity': 11, 'picked': True})
        move1._action_done()


@tagged('post_install', '-at_install')
class TestValuationReconciliation(TestValuationReconciliationCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        uom_unit = cls.env.ref('uom.product_uom_unit')

        cls.test_product_delivery_2 = cls.env['product.product'].create({
            'name': 'Test product template invoiced on delivery 2',
            'standard_price': 42.0,
            'type': 'consu',
            'categ_id': cls.stock_account_product_categ.id,
            'uom_id': uom_unit.id,
        })

    def test_shipment_invoice(self):
        """ Tests the case into which we send the goods to the customer before
        making the invoice
        """
        test_product = self.test_product_delivery
        self._set_initial_stock_for_product(test_product)

        sale_order = self._create_sale(test_product, '2108-01-01')
        self._process_pickings(sale_order.picking_ids)

        invoice = self._create_invoice_for_so(sale_order, test_product, '2018-02-12')
        invoice.action_post()
        self.assertRecordValues(invoice.line_ids, [
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 33.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_tax_sale'].id, 'credit': 4.95, 'debit': 0.0},
            {'account_id': self.company_data['default_account_receivable'].id, 'credit': 0.0, 'debit': 37.95},
            {'account_id': self.company_data['default_account_stock_valuation'].id, 'credit': 42.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_expense'].id, 'credit': 0.0, 'debit': 42.0},
        ])

    def test_invoice_shipment(self):
        """ Tests the case into which we make the invoice first, and then send
        the goods to our customer.
        """
        test_product = self.test_product_delivery
        #since the invoice come first, the COGS will use the standard price on product
        self.test_product_delivery.standard_price = 13
        self._set_initial_stock_for_product(test_product)

        sale_order = self._create_sale(test_product, '2018-01-01')

        invoice = self._create_invoice_for_so(sale_order, test_product, '2018-02-03')
        invoice.action_post()

        self._process_pickings(sale_order.picking_ids)

        picking = self.env['stock.picking'].search([('sale_id', '=', sale_order.id)])
        self.assertRecordValues(invoice.line_ids, [
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 33.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_tax_sale'].id, 'credit': 4.95, 'debit': 0.0},
            {'account_id': self.company_data['default_account_receivable'].id, 'credit': 0.0, 'debit': 37.95},
            {'account_id': self.company_data['default_account_stock_valuation'].id, 'credit': 13.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_expense'].id, 'credit': 0.0, 'debit': 13.0},
        ])

        #return the goods and refund the invoice
        stock_return_picking_form = Form(self.env['stock.return.picking']
            .with_context(active_ids=picking.ids, active_id=picking.ids[0],
            active_model='stock.picking'))
        stock_return_picking = stock_return_picking_form.save()
        stock_return_picking.product_return_moves.quantity = 1.0
        stock_return_picking_action = stock_return_picking.action_create_returns()
        return_pick = self.env['stock.picking'].browse(stock_return_picking_action['res_id'])
        return_pick.action_assign()
        return_pick.move_ids.write({'quantity': 1, 'picked': True})
        return_pick._action_done()
        refund_invoice_wiz = self.env['account.move.reversal'].with_context(active_model='account.move', active_ids=[invoice.id]).create({
            'reason': 'test_invoice_shipment_refund',
            'journal_id': invoice.journal_id.id,
        })
        new_invoice = self.env['account.move'].browse(refund_invoice_wiz.modify_moves()['res_id'])
        self.assertEqual(invoice.payment_state, 'reversed', "Invoice should be in 'reversed' state.")
        self.assertEqual(invoice.reversal_move_ids.payment_state, 'paid', "Refund should be in 'paid' state.")
        self.assertEqual(new_invoice.state, 'draft', "New invoice should be in 'draft' state.")
        self.assertRecordValues(invoice.reversal_move_ids.line_ids, [
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 0.0, 'debit': 33.0},
            {'account_id': self.company_data['default_account_receivable'].id, 'credit': 37.95, 'debit': 0.0},
            {'account_id': self.company_data['default_account_stock_valuation'].id, 'credit': 0.0, 'debit': 13.0},
            {'account_id': self.company_data['default_account_expense'].id, 'credit': 13.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_tax_sale'].id, 'credit': 0.0, 'debit': 4.95},
        ])

    def test_multiple_shipments_invoices(self):
        """ Tests the case into which we deliver part of the goods first, then 2 invoices at different rates, and finally the remaining quantities
        """
        test_product = self.test_product_delivery
        self._set_initial_stock_for_product(test_product)

        sale_order = self._create_sale(test_product, '2018-01-01', quantity=5)

        self._process_pickings(sale_order.picking_ids, quantity=2.0)
        invoice = self._create_invoice_for_so(sale_order, test_product, '2018-02-03', quantity=3)
        invoice.action_post()
        self.assertRecordValues(invoice.line_ids, [
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 99.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_tax_sale'].id, 'credit': 14.85, 'debit': 0.0},
            {'account_id': self.company_data['default_account_receivable'].id, 'credit': 0.0, 'debit': 113.85},
            {'account_id': self.company_data['default_account_stock_valuation'].id, 'credit': 252.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_expense'].id, 'credit': 0.0, 'debit': 252.0},
        ])

        invoice2 = self._create_invoice_for_so(sale_order, test_product, '2018-03-12', quantity=2)
        invoice2.action_post()

        self.assertRecordValues(invoice2.line_ids, [
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 66.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_tax_sale'].id, 'credit': 9.9, 'debit': 0.0},
            {'account_id': self.company_data['default_account_receivable'].id, 'credit': 0.0, 'debit': 75.90},
            {'account_id': self.company_data['default_account_stock_valuation'].id, 'credit': 168.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_expense'].id, 'credit': 0.0, 'debit': 168.0},
        ])
        self._process_pickings(sale_order.picking_ids.filtered(lambda x: x.state != 'done'), quantity=3.0)
        self.assertRecordValues(invoice2.line_ids, [
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 66.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_tax_sale'].id, 'credit': 9.9, 'debit': 0.0},
            {'account_id': self.company_data['default_account_receivable'].id, 'credit': 0.0, 'debit': 75.90},
            {'account_id': self.company_data['default_account_stock_valuation'].id, 'credit': 168.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_expense'].id, 'credit': 0.0, 'debit': 168.0},
        ])

    def test_fifo_multiple_products(self):
        """ Test Automatic Inventory Valuation with FIFO costs method, 2 products,
            This tests a more complex use case with anglo-saxon accounting.
        """
        wh = self.env['stock.warehouse'].search([
            ('company_id', '=', self.env.company.id),
        ])
        stock_loc = wh.lot_stock_id
        in_type = wh.in_type_id
        product_1, product_2, = tuple(self.env['product.product'].create([{
            'name': f'P{i}',
            'list_price': 10 * i,
            'standard_price': 10 * i,
            'is_storable': True,
            'categ_id': self.env.ref('product.product_category_goods').id,
        } for i in range(1, 3)]))
        product_1.categ_id.property_valuation = 'real_time'
        product_1.categ_id.property_cost_method = 'fifo'
        categ_2 = product_1.categ_id.copy()
        product_2.categ_id = categ_2
        so = self.env['sale.order'].sudo().create({
            'partner_id': self.partner_a.id,
            'currency_id': self.other_currency.id,
            'order_line': [
                (0, 0, {
                    'name': product.name,
                    'product_id': product.id,
                    'product_uom_qty': 2,
                    'product_uom_id': product.uom_id.id,
                    'price_unit': 10.0,
                }) for product in 2 * [product_1] + [product_2]],
            'date_order': '2021-01-01',
        })
        so.action_confirm()
        so.picking_ids.move_ids.quantity = 2
        so.picking_ids.move_ids.picked = True
        so.picking_ids._action_done()
        self.assertEqual(so.picking_ids.state, 'done')
        inv = self.env['account.move'].create({
            'partner_id': self.partner_a.id,
            'currency_id': self.other_currency.id,
            'move_type': 'out_invoice',
            'invoice_date': '2021-01-10',
            'invoice_line_ids': [(0, 0, {
                'name': 'test line',
                'price_unit': 10.0,
                'quantity': 2,
                'discount': 0.0,
                'product_id': line.product_id.id,
                'sale_line_ids': [(6, 0, line.ids)],
            }) for line in so.order_line],
        })

        so.invoice_ids += inv
        inv.action_post()
        self.assertRecordValues(inv.line_ids, [
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 10.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 10.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 10.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_tax_sale'].id, 'credit': 4.5, 'debit': 0.0},
            {'account_id': self.company_data['default_account_receivable'].id, 'credit': 0.0, 'debit': 34.5},
        ])

        # Create in_moves for P1/P2 such that the first move compensates the out moves
        in_moves = self.env['stock.move'].create([{
            'description_picking': '%s-%s' % (str(quantity), str(product)),  # to not merge the moves
            'product_id': product.id,
            'location_id': self.env.ref('stock.stock_location_suppliers').id,
            'location_dest_id': stock_loc.id,
            'product_uom': self.env.ref('uom.product_uom_unit').id,
            'product_uom_qty': quantity,
            'price_unit': product.standard_price + 1,
            'picking_type_id': in_type.id,
        } for product, quantity in zip(
            [product_1, product_2],
            [2.0, 2.0]
        )])
        in_moves._action_confirm()
        for move in in_moves:
            move.quantity = move.product_uom_qty
            move.picked = True
        in_moves._action_done()
        bill = self.env['account.move'].create({
            'currency_id': self.other_currency.id,
            'move_type': 'in_invoice',
            'invoice_date': '2021-01-10',
            'invoice_line_ids': [(0, 0, {
                'name': 'bill line',
                'account_id': self.company_data['default_account_expense'].id,
                'price_unit': 10.0,
                'quantity': 2,
                'discount': 0.0,
                'product_id': product.id,
            }) for product in [product_1, product_2]],
        })
        self.assertEqual(product_1.total_value, 0)
        self.assertEqual(product_1.qty_available, -2)
        self.assertEqual(product_2.total_value, 0)
        self.assertEqual(product_2.qty_available, 0)
        self.assertRecordValues(bill.line_ids, [
            {'account_id': self.company_data['default_account_expense'].id, 'credit': 0.0, 'debit': 10.0},
            {'account_id': self.company_data['default_account_expense'].id, 'credit': 0.0, 'debit': 10.0},
            {'account_id': self.company_data['default_account_tax_purchase'].id, 'credit': 0.0, 'debit': 3.0},
            {'account_id': self.company_data['default_account_payable'].id, 'credit': 23.0, 'debit': 0.0},
        ])

    def test_anglo_saxon_valuation_reconciliation(self):

        """This test checks anglo saxon accounting flow works well with invoice/credit note."""
        self.env.company.anglo_saxon_accounting = True

        products = [self.test_product_delivery, self.test_product_delivery_2]

        sale_order = self.env['sale.order'].sudo().create({
            'name': "sale order product 2",
            'company_id': self.env.company.id,
            'partner_id': self.partner_a.id
        })

        # Create invoice on which the test will be run
        move_form = Form(self.env["account.move"].with_context(default_move_type="out_invoice"))
        move_form.partner_id = self.partner_a
        move_form.currency_id = self.currency
        with move_form.invoice_line_ids.new() as line_form:
            line_form.product_id = products[0]
            line_form.price_unit = products[0].standard_price
            line_form.quantity = 1
            line_form.tax_ids.clear()
        with move_form.invoice_line_ids.new() as line_form:
            line_form.product_id = products[1]
            line_form.price_unit = products[1].standard_price
            line_form.quantity = 1
            line_form.tax_ids.clear()
        invoice_1 = move_form.save()

        # Create invoice 2
        move_form = Form(self.env["account.move"].with_context(default_move_type="out_refund"))
        move_form.partner_id = self.partner_a
        move_form.currency_id = self.currency
        with move_form.invoice_line_ids.new() as line_form:
            line_form.product_id = products[1]
            line_form.price_unit = products[1].standard_price
            line_form.quantity = 1
            line_form.tax_ids.clear()
        invoice_2 = move_form.save()

        # Create invoice 3
        move_form = Form(self.env["account.move"].with_context(default_move_type="out_refund"))
        move_form.partner_id = self.partner_a
        move_form.currency_id = self.currency
        with move_form.invoice_line_ids.new() as line_form:
            line_form.product_id = products[0]
            line_form.price_unit = products[0].standard_price
            line_form.quantity = 1
            line_form.tax_ids.clear()
        invoice_3 = move_form.save()

        # Creating stock moves and associated sale order lines
        stock_location = self.env['stock.warehouse'].search([
            ('company_id', '=', self.env.company.id),
        ], limit=1).lot_stock_id

        out_picking = self.env['stock.picking'].create({
            'location_id': stock_location.id,
            'location_dest_id': self.ref('stock.stock_location_customers'),
            'picking_type_id': stock_location.warehouse_id.out_type_id.id,
            'sale_id': sale_order.id
        })

        sm_1 = self.env['stock.move'].create({
            'product_id': products[0].id,
            'product_uom_qty': 1,
            'product_uom': products[0].uom_id.id,
            'location_id': out_picking.location_id.id,
            'location_dest_id': out_picking.location_dest_id.id,
            'picking_id': out_picking.id,
            'state': 'done'
        })

        sale_order_line_1 = self.env['sale.order.line'].sudo().create({
            'product_id': products[0].id,
            'order_id': sale_order.id,
            'move_ids': sm_1
        })

        sm_2 = self.env['stock.move'].create({
            'product_id': products[1].id,
            'product_uom_qty': 1,
            'product_uom': products[1].uom_id.id,
            'location_id': out_picking.location_id.id,
            'location_dest_id': out_picking.location_dest_id.id,
            'picking_id': out_picking.id,
            'state': 'done'
        })

        sale_order_line_2 = self.env['sale.order.line'].sudo().create({
            'product_id': products[1].id,
            'order_id': sale_order.id,
            'move_ids': sm_2
        })

        sale_order.action_confirm()
        invoice_2.invoice_line_ids.sale_line_ids = sale_order_line_1
        invoice_2.action_post()

        invoice_3.invoice_line_ids.sale_line_ids = sale_order_line_2
        invoice_3.action_post()
        invoice_1.invoice_line_ids[0].sale_line_ids = sale_order_line_1
        invoice_1.invoice_line_ids[1].sale_line_ids = sale_order_line_2

        invoice_1.action_post()
        self.assertEqual(invoice_1.state, 'posted')

        self.assertRecordValues(invoice_1.line_ids, [
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 42.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 42.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_receivable'].id, 'credit': 0.0, 'debit': 84.0},
            {'account_id': self.company_data['default_account_stock_valuation'].id, 'credit': 42.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_expense'].id, 'credit': 0.0, 'debit': 42.0},
        ])
        self.assertRecordValues(invoice_2.line_ids, [
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 0.0, 'debit': 42.0},
            {'account_id': self.company_data['default_account_receivable'].id, 'credit': 42.0, 'debit': 0.0},
        ])
        self.assertRecordValues(invoice_3.line_ids, [
            {'account_id': self.company_data['default_account_revenue'].id, 'credit': 0.0, 'debit': 42.0},
            {'account_id': self.company_data['default_account_receivable'].id, 'credit': 42.0, 'debit': 0.0},
            {'account_id': self.company_data['default_account_stock_valuation'].id, 'credit': 0.0, 'debit': 42.0},
            {'account_id': self.company_data['default_account_expense'].id, 'credit': 42.0, 'debit': 0.0},
        ])
