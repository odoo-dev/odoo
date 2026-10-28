from datetime import datetime

from odoo.exceptions import ValidationError
from odoo.tests import tagged

from .common import TestInPosBase


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestB2CInvoiceNumber(TestInPosBase):
    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.year = datetime.now().strftime('%y')
        cls.partner_consumer = cls.env['res.partner'].create({
            'name': "Consumer",
            'l10n_in_gst_treatment': 'consumer',
        })
        cls.partner_a.l10n_in_gst_treatment = 'regular'

    def _create_b2c_order(self, qty=1.0, **kwargs):
        return self._create_order({
            'pos_order_lines_ui_args': [(self.product_a, qty)],
            'payments': [(self.bank_pm1, 105.0 * qty)],
            **kwargs,
        })

    def test_default_prefixes(self):
        self.assertEqual(self.config.l10n_in_b2c_invoice_prefix, f"P{self.config.id}/%(y)s/")
        self.assertEqual(self.config.l10n_in_b2c_refund_prefix, f"PR{self.config.id}/%(y)s/")

    def test_b2c_orders_numbering(self):
        with self.with_pos_session():
            order_without_customer = self._create_b2c_order()
            order_consumer = self._create_b2c_order(customer=self.partner_consumer)
            order_b2b = self._create_b2c_order(customer=self.partner_a)
            order_invoiced_consumer = self._create_b2c_order(customer=self.partner_consumer, is_invoiced=True)
            refund = self._create_b2c_order(qty=-1.0)

        prefix = f"P{self.config.id}/{self.year}/"
        refund_prefix = f"PR{self.config.id}/{self.year}/"
        self.assertRecordValues(
            order_without_customer | order_consumer | order_b2b | order_invoiced_consumer | refund,
            [
                {'l10n_in_b2c_invoice_number': f"{prefix}{'1'.zfill(min(9, 16 - len(prefix)))}"},
                {'l10n_in_b2c_invoice_number': f"{prefix}{'2'.zfill(min(9, 16 - len(prefix)))}"},
                {'l10n_in_b2c_invoice_number': False},
                {'l10n_in_b2c_invoice_number': False},
                {'l10n_in_b2c_invoice_number': f"{refund_prefix}{'1'.zfill(min(9, 16 - len(refund_prefix)))}"},
            ],
        )

    def test_custom_prefix(self):
        self.config.l10n_in_b2c_invoice_prefix = "INV/%(y)s/"
        self.assertEqual(self.config.l10n_in_b2c_invoice_seq_id.padding, 9)
        with self.with_pos_session():
            order = self._create_b2c_order()
        self.assertEqual(order.l10n_in_b2c_invoice_number, f"INV/{self.year}/000000001")

    def test_invalid_prefix(self):
        with self.assertRaises(ValidationError):
            self.config.l10n_in_b2c_invoice_prefix = "POS-RESTAURANT/%(year)s/"
        with self.assertRaises(ValidationError):
            self.config.l10n_in_b2c_invoice_prefix = "P 1/"

    def test_b2c_receipt(self):
        self.env.company.point_of_sale_use_ticket_qr_code = True
        with self.with_pos_session():
            order = self._create_b2c_order()
            html = order.order_receipt_generate_html()
        self.assertIn("Receipt", html)
        self.assertIn(order.l10n_in_b2c_invoice_number, html)
        self.assertNotIn("Need an invoice?", html)

    def test_b2c_document_summary(self):
        with self.with_pos_session():
            orders = self._create_b2c_order() | self._create_b2c_order() | self._create_b2c_order()
            refund = self._create_b2c_order(qty=-1.0)
            self._create_b2c_order(customer=self.partner_a)

        today = orders[0].account_move.date
        summary = self.env['account.move']._l10n_in_get_extra_document_summary(self.env.company, today, today)
        self.assertEqual(sorted(summary, key=lambda s: s['nature_of_document']), [
            {
                'nature_of_document': '1',
                'serial_from': orders[0].l10n_in_b2c_invoice_number,
                'serial_to': orders[2].l10n_in_b2c_invoice_number,
                'total_issued': 3,
                'total_cancelled': 0,
            },
            {
                'nature_of_document': '5',
                'serial_from': refund.l10n_in_b2c_invoice_number,
                'serial_to': refund.l10n_in_b2c_invoice_number,
                'total_issued': 1,
                'total_cancelled': 0,
            },
        ])
