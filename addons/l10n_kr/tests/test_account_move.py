# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged

MISMATCH = 'l10n_kr_issuance_type_mismatch'
MIXED = 'l10n_kr_mixed_tax_nature'


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nKrAccountMove(AccountTestInvoicingCommon):

    @classmethod
    @AccountTestInvoicingCommon.setup_country('kr')
    def setUpClass(cls):
        super().setUpClass()

    def _get_kr_alerts(self, move_type, issuance_type, tax_xmlids):
        ChartTemplate = self.env['account.chart.template']
        invoice = self._create_invoice(
            move_type=move_type,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100.0, tax_ids=ChartTemplate.ref(xmlid))
                for xmlid in tax_xmlids
            ],
        )
        invoice.l10n_kr_issuance_type = issuance_type
        return {key for key in invoice.alerts or {} if key in (MISMATCH, MIXED)}

    def _assert_alerts(self, move_type, cases):
        for issuance_type, tax_xmlids, expected in cases:
            with self.subTest(move_type=move_type, issuance_type=issuance_type, taxes=tax_xmlids):
                self.assertEqual(self._get_kr_alerts(move_type, issuance_type, tax_xmlids), expected)

    def test_customer_invoice_issuance_type_alerts(self):
        self._assert_alerts('out_invoice', [
            # VAT 10%
            ('tax_invoice', ['l10n_kr_Sales_10'], set()),
            ('tax_exempt_invoice', ['l10n_kr_Sales_10'], {MISMATCH}),
            ('card_payment', ['l10n_kr_Sales_10'], set()),
            # VAT 0%
            ('tax_invoice', ['l10n_kr_Sales_0'], set()),
            ('tax_exempt_invoice', ['l10n_kr_Sales_0'], {MISMATCH}),
            ('purchaser_tax_invoice', ['l10n_kr_Sales_0'], {MISMATCH}),
            ('other', ['l10n_kr_Sales_0'], set()),
            # Tax Exempt
            ('tax_exempt_invoice', ['l10n_kr_Sales_tf'], set()),
            ('tax_invoice', ['l10n_kr_Sales_tf'], {MISMATCH}),
            ('purchaser_tax_invoice', ['l10n_kr_Sales_tf'], {MISMATCH}),
            ('cash_receipt', ['l10n_kr_Sales_tf'], set()),
            # Mixed taxable / tax-exempt
            ('tax_invoice', ['l10n_kr_Sales_10', 'l10n_kr_Sales_tf'], {MIXED}),
            ('tax_exempt_invoice', ['l10n_kr_Sales_0', 'l10n_kr_Sales_tf'], {MIXED}),
            ('purchaser_tax_invoice', ['l10n_kr_Sales_10', 'l10n_kr_Sales_tf'], {MIXED}),
            ('card_payment', ['l10n_kr_Sales_10', 'l10n_kr_Sales_tf'], set()),
        ])

    def test_vendor_bill_issuance_type_alerts(self):
        self._assert_alerts('in_invoice', [
            # VAT 10%
            ('tax_invoice', ['l10n_kr_Purchase_10'], set()),
            ('tax_exempt_invoice', ['l10n_kr_Purchase_10'], {MISMATCH}),
            # VAT 0%
            ('tax_invoice', ['l10n_kr_Purchase_0'], set()),
            ('tax_exempt_invoice', ['l10n_kr_Purchase_0'], {MISMATCH}),
            ('purchaser_tax_invoice', ['l10n_kr_Purchase_0'], {MISMATCH}),
            ('card_payment', ['l10n_kr_Purchase_0'], {MISMATCH}),
            ('cash_receipt', ['l10n_kr_Purchase_0'], {MISMATCH}),
            ('other', ['l10n_kr_Purchase_0'], {MISMATCH}),
            # Tax Exempt
            ('tax_exempt_invoice', ['l10n_kr_Purchase_tf'], set()),
            ('tax_invoice', ['l10n_kr_Purchase_tf'], {MISMATCH}),
            ('purchaser_tax_invoice', ['l10n_kr_Purchase_tf'], {MISMATCH}),
            # VAT DP
            ('tax_exempt_invoice', ['l10n_kr_Purchase_4_dp'], set()),
            ('tax_invoice', ['l10n_kr_Purchase_4_dp'], {MISMATCH}),
            ('purchaser_tax_invoice', ['l10n_kr_Purchase_4_dp'], {MISMATCH}),
            # VAT RP
            ('other', ['l10n_kr_Purchase_3_dp'], set()),
            ('tax_invoice', ['l10n_kr_Purchase_3_dp'], {MISMATCH}),
            ('tax_exempt_invoice', ['l10n_kr_Purchase_3_dp'], {MISMATCH}),
            ('purchaser_tax_invoice', ['l10n_kr_Purchase_3_dp'], {MISMATCH}),
            # 10% IM is a group tax: its VAT 10% child tax drives the rules
            ('tax_invoice', ['l10n_kr_Purchase_10_im'], set()),
            ('tax_exempt_invoice', ['l10n_kr_Purchase_10_im'], {MISMATCH}),
            ('tax_invoice', ['l10n_kr_Purchase_10_im', 'l10n_kr_Purchase_tf'], {MIXED}),
            # Mixed taxable / tax-exempt
            ('tax_invoice', ['l10n_kr_Purchase_10', 'l10n_kr_Purchase_tf'], {MIXED}),
            ('tax_exempt_invoice', ['l10n_kr_Purchase_0', 'l10n_kr_Purchase_tf'], {MIXED}),
            ('cash_receipt', ['l10n_kr_Purchase_10', 'l10n_kr_Purchase_tf'], set()),
        ])

    def test_credit_notes_and_receipts_follow_invoice_rules(self):
        for move_type in ('out_refund', 'out_receipt'):
            self._assert_alerts(move_type, [
                ('tax_invoice', ['l10n_kr_Sales_10'], set()),
                ('tax_invoice', ['l10n_kr_Sales_tf'], {MISMATCH}),
                ('tax_invoice', ['l10n_kr_Sales_10', 'l10n_kr_Sales_tf'], {MIXED}),
            ])
        for move_type in ('in_refund', 'in_receipt'):
            self._assert_alerts(move_type, [
                ('tax_invoice', ['l10n_kr_Purchase_0'], set()),
                ('card_payment', ['l10n_kr_Purchase_0'], {MISMATCH}),
                ('tax_invoice', ['l10n_kr_Purchase_0', 'l10n_kr_Purchase_tf'], {MIXED}),
            ])

    def test_no_alert_without_issuance_type(self):
        self.assertFalse(self._get_kr_alerts('out_invoice', False, ['l10n_kr_Sales_tf']))
