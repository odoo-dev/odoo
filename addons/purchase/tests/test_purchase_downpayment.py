from odoo.addons.purchase.tests.test_purchase_invoice import TestPurchaseToInvoiceCommon
from odoo.tests import tagged


@tagged('-at_install', 'post_install')
class TestPurchaseDownpayment(TestPurchaseToInvoiceCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

    def test_downpayment_basic(self):
        po = self.init_purchase(confirm=False, products=[self.product_order])
        po.order_line.product_qty = 10.0
        po.button_confirm()

        dp_bill = self.init_invoice('in_invoice', amounts=[69.00], post=True)

        match_lines = self.env['purchase.bill.line.match'].search([('partner_id', '=', self.partner_a.id)])
        action = match_lines.action_add_to_po()

        wizard = self.env['bill.to.po.wizard'].with_context({**action['context'], 'active_ids': match_lines.ids}).create({})
        wizard.action_add_downpayment()

        po_dp_section_line = po.order_line.filtered(lambda l: l.display_type == 'line_section' and l.is_downpayment)
        self.assertEqual(len(po_dp_section_line), 1)
        po_dp_line = po.order_line.filtered(lambda l: l.display_type != 'line_section' and l.is_downpayment)
        self.assertEqual(po_dp_line.name, 'Down Payment (ref: %s)' % dp_bill.invoice_line_ids.display_name)
        self.assertEqual(po_dp_line.sequence, po_dp_section_line.sequence + 1)

        # This is not the normal flow, but we test the deduction of the downpayment
        action_view_bill = po.action_create_invoice()
        final_bill = self.env['account.move'].browse(action_view_bill['res_id'])

        self.assertRecordValues(final_bill.invoice_line_ids, [
            # pylint: disable=C0326
            {'product_id': self.product_order.id, 'display_type': 'product',      'quantity': 10, 'is_downpayment': False, 'balance': 10.0 * self.product_order.standard_price},
            {'product_id': False,                 'display_type': 'line_section', 'quantity': 0,  'is_downpayment': True,  'balance': 0.0},
            {'product_id': False,                 'display_type': 'product',      'quantity': -1, 'is_downpayment': True,  'balance': -69.0},
        ])
