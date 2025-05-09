from odoo.addons.l10n_in.tests.common import L10nInTestInvoicingCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install', 'post_install_l10n')
class TestIgnoreQuantity(L10nInTestInvoicingCommon):

    def test_ignore_quantity(self):
        credit_note = self.init_invoice(
            move_type='out_refund',
            partner=self.partner_a,
            amounts=[100],
            taxes=self.igst_sale_18,
        )
        refund_line = credit_note.invoice_line_ids[0]

        refund_line.ignore_quantity = True
        self.assertRecordValues(refund_line, [{
            'quantity': 0.0,
            'price_unit': 100.0,
            'price_subtotal': 100.0,
            'price_total': 118.0,
            'balance': 100.0,
        }])

        refund_line.ignore_quantity = False
        self.assertRecordValues(refund_line, [{
            'quantity': 0.0,
            'price_unit': 100.0,
            'price_subtotal': 0.0,
            'price_total': 0.0,
            'balance': 0.0,
        }])
