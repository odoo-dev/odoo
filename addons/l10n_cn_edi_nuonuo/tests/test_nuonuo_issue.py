# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import datetime

from freezegun import freeze_time

from odoo.tests import tagged

from .common import L10nCnEdiNuonuoTestCommon

ISSUE = 'nuonuo.OpeMplatform.requestBillingNew'
QUERY = 'nuonuo.OpeMplatform.queryInvoiceResult'
RETRY = 'nuonuo.OpeMplatform.reInvoice'
ACCEPTED = {'code': 'E0000', 'describe': '开票提交成功', 'result': {'invoiceSerialNum': '20160108165823395151'}}
PENDING = {'code': 'E0000', 'result': [{'status': '20', 'statusMsg': '开票中'}]}
ISSUED = {'code': 'E0000', 'result': [{
    'status': '2',
    'statusMsg': '开票完成（最终状态）',
    'allElectronicInvoiceNumber': '26332000000123456789',
    'invoiceTime': 1790121600000,  # 2026-09-23 00:00:00 UTC
    'qrCode': 'qr-payload',
    'pdfUrl': 'https://nuonuo.test/fapiao.pdf',
    'serialNo': '20160108165823395151',
}]}


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestNuonuoIssue(L10nCnEdiNuonuoTestCommon):

    def setUp(self):
        super().setUp()
        self.downloads['https://nuonuo.test/fapiao.pdf'] = b'%PDF-1.4 fapiao'

    def _post_invoice(self, lines=None, taxes=None):
        invoice = self.init_invoice(
            'out_invoice',
            partner=self.partner_a,
            products=self.product_a if lines is None else None,
            taxes=taxes or self.tax_sale_a,
        )
        if lines:
            invoice.invoice_line_ids = [(0, 0, line) for line in lines]
        invoice.action_post()
        return invoice

    # ------------------------------------------------------------------
    # Mapping
    # ------------------------------------------------------------------

    def test_order_carries_the_invoice(self):
        invoice = self._post_invoice()
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, ISSUED)

        self._issue(invoice)

        order = self._requests_for(ISSUE)[0]['payload']['order']
        self.assertEqual(order['orderNo'], invoice.l10n_cn_edi_serial_no)
        self.assertEqual(order['invoiceType'], '1')
        self.assertEqual(order['invoiceLine'], 'pc')
        self.assertEqual(order['salerTaxNum'], self.company.vat)
        self.assertEqual(order['buyerTaxNum'], '91330106MA2B2ABCDN')
        self.assertEqual(order['extensionNumber'], '923')
        self.assertEqual(order['pushMode'], '-1')
        line = order['invoiceDetail'][0]
        self.assertEqual(line['goodsCode'], '1090511030000000000')
        self.assertEqual(line['invoiceLineProperty'], '0')
        self.assertEqual(
            (line['taxExcludedAmount'], line['tax'], line['taxIncludedAmount']),
            (f"{invoice.amount_untaxed:.2f}", f"{invoice.amount_tax:.2f}", f"{invoice.amount_total:.2f}"),
        )

    def test_special_fapiao_uses_the_special_invoice_line(self):
        invoice = self._post_invoice()
        invoice.l10n_cn_edi_invoice_type_code = '01'
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, ISSUED)

        self._issue(invoice)

        self.assertEqual(self._requests_for(ISSUE)[0]['payload']['order']['invoiceLine'], 'bs')

    def test_price_basis_follows_the_odoo_tax(self):
        tax_included = self.tax_sale_a.copy({'name': 'VAT 13% incl.', 'price_include_override': 'tax_included'})
        invoice = self._post_invoice(lines=[{
            'product_id': self.product_a.id,
            'price_unit': 113.0,
            'quantity': 2.0,
            'tax_ids': [(6, 0, tax_included.ids)],
        }])
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, ISSUED)

        self._issue(invoice)

        line = self._requests_for(ISSUE)[0]['payload']['order']['invoiceDetail'][0]
        self.assertEqual(line['withTaxFlag'], '1')
        self.assertEqual(line['price'], '113')
        self.assertEqual(line['num'], '2')
        self.assertEqual(line['taxIncludedAmount'], f"{invoice.amount_total:.2f}")

    def test_discount_line_follows_its_line_without_quantity(self):
        invoice = self._post_invoice(lines=[
            {'product_id': self.product_a.id, 'price_unit': 600.0, 'quantity': 1.0, 'tax_ids': [(6, 0, self.tax_sale_a.ids)]},
            {'name': 'Global Discount', 'price_unit': -60.0, 'quantity': 1.0, 'tax_ids': [(6, 0, self.tax_sale_a.ids)]},
        ])
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, ISSUED)

        self._issue(invoice)

        discounted, discount = self._requests_for(ISSUE)[0]['payload']['order']['invoiceDetail']
        self.assertEqual((discounted['invoiceLineProperty'], discount['invoiceLineProperty']), ('2', '1'))
        self.assertEqual(discount['goodsName'], discounted['goodsName'])
        self.assertEqual(discount['taxRate'], discounted['taxRate'])
        self.assertNotIn('num', discount)
        self.assertEqual(discount['taxExcludedAmount'], '-60.00')

    def test_tax_policy_marks_use_the_bureau_codes(self):
        self.tax_sale_a.write({'l10n_cn_vat_special_policy': 'simplified_5', 'l10n_cn_free_tax_mark': '3'})
        invoice = self._post_invoice()
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, ISSUED)

        self._issue(invoice)

        line = self._requests_for(ISSUE)[0]['payload']['order']['invoiceDetail'][0]
        # 09 按5%简易征收, as in Nuonuo's own 停车费 example.
        self.assertEqual((line['favouredPolicyFlag'], line['zeroRateFlag']), ('09', '3'))

    # ------------------------------------------------------------------
    # Outcomes
    # ------------------------------------------------------------------

    def test_issued_within_the_short_wait(self):
        invoice = self._post_invoice()
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, PENDING, ISSUED)

        self.assertIsNone(self._issue(invoice))

        self.assertRecordValues(invoice, [{
            'l10n_cn_edi_state': 'issued',
            'l10n_cn_edi_fapiao_no': '26332000000123456789',
            'l10n_cn_edi_fapiao_date': datetime(2026, 9, 23, 0, 0),
            'l10n_cn_edi_qr_code': 'qr-payload',
        }])
        self.assertEqual(invoice.l10n_cn_edi_fapiao_pdf_id.raw.content, b'%PDF-1.4 fapiao')
        self.assertIn(invoice.l10n_cn_edi_fapiao_pdf_id, self.env['account.move.send']._get_invoice_extra_attachments(invoice))

    def test_slow_fapiao_is_picked_up_by_the_cron(self):
        invoice = self._post_invoice()
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, PENDING)

        self._issue(invoice)
        self.assertEqual(invoice.l10n_cn_edi_state, 'sent')

        self._answer(QUERY, ISSUED)
        self.env['account.move']._cron_l10n_cn_edi_poll_invoices()

        self.assertEqual(invoice.l10n_cn_edi_state, 'issued')
        self.assertEqual(invoice.l10n_cn_edi_fapiao_no, '26332000000123456789')

    def test_resubmitting_an_accepted_order_fetches_it(self):
        invoice = self._post_invoice()
        self._answer(ISSUE, {'code': 'E9106', 'describe': '订单编号或流水号不能重复'})
        self._answer(QUERY, ISSUED)

        self.assertIsNone(self._issue(invoice))
        self.assertEqual(invoice.l10n_cn_edi_state, 'issued')

    def test_refused_fapiao_is_failed_with_the_reason(self):
        invoice = self._post_invoice()
        self._answer(ISSUE, {'code': 'E9105', 'describe': '折扣行的商品名称必须和被折扣行相同'})

        error = self._issue(invoice)

        self.assertIn('E9105', error)
        self.assertEqual(invoice.l10n_cn_edi_state, 'failed')
        self.assertFalse(self._requests_for(QUERY))

    def test_failed_issuance_reports_the_bureau_reason(self):
        invoice = self._post_invoice()
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, {'code': 'E0000', 'result': [{'status': '22', 'failCause': '购方税号有误'}]})

        self.assertEqual(self._issue(invoice), '购方税号有误')
        self.assertEqual(invoice.l10n_cn_edi_state, 'failed')

    def test_seal_failure_is_retried(self):
        invoice = self._post_invoice()
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, {'code': 'E0000', 'result': [{'status': '24', 'serialNo': '20160108165823395151'}]})
        self._answer(RETRY, {'code': 'E0000'})

        self._issue(invoice)

        self.assertEqual(invoice.l10n_cn_edi_state, 'sent')
        retry = self._requests_for(RETRY)[0]['payload']
        self.assertEqual(retry, {'fpqqlsh': '20160108165823395151', 'orderno': invoice.l10n_cn_edi_serial_no})

    def test_seal_retries_used_up_keep_the_order(self):
        invoice = self._post_invoice()
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, {'code': 'E0000', 'result': [{'status': '24', 'serialNo': '20160108165823395151'}]})
        self._answer(RETRY, {'code': 'E9613', 'describe': '同一流水号(订单号)单日最多重试20次'})

        self.assertIn("retries are used up", self._issue(invoice))

        self.assertEqual(invoice.l10n_cn_edi_state, 'failed')
        self.assertEqual(self._requests_for(RETRY)[0]['payload']['orderno'], invoice.l10n_cn_edi_serial_no)

    def test_failed_issuance_frees_the_order_number(self):
        invoice = self._post_invoice()
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, {'code': 'E0000', 'result': [{'status': '22', 'failCause': '购方税号有误'}]})
        with freeze_time('2026-09-25 02:00:00'):
            self._issue(invoice)
        first_order = self._requests_for(ISSUE)[0]['payload']['order']['orderNo']

        self._answer(QUERY, ISSUED)
        with freeze_time('2026-09-25 02:05:00'):
            self._issue(invoice)

        self.assertNotEqual(self._requests_for(ISSUE)[1]['payload']['order']['orderNo'], first_order)
        self.assertEqual(invoice.l10n_cn_edi_state, 'issued')

    def test_order_unknown_to_nuonuo_is_failed_by_the_cron(self):
        invoice = self._post_invoice()
        invoice.write({'l10n_cn_edi_state': 'sent', 'l10n_cn_edi_serial_no': 'BLUE_LOST'})

        self.env['account.move']._cron_l10n_cn_edi_poll_invoices()

        self.assertEqual(invoice.l10n_cn_edi_state, 'failed')

    def test_missing_pdf_does_not_undo_the_fapiao(self):
        invoice = self._post_invoice()
        del self.downloads['https://nuonuo.test/fapiao.pdf']
        self._answer(ISSUE, ACCEPTED)
        self._answer(QUERY, ISSUED)

        self._issue(invoice)

        self.assertEqual(invoice.l10n_cn_edi_state, 'issued')
        self.assertFalse(invoice.l10n_cn_edi_fapiao_pdf_id)
