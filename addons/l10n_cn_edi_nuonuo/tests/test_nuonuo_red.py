# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import date, datetime

from odoo.exceptions import UserError
from odoo.tests import tagged

from .common import L10nCnEdiNuonuoTestCommon, MockResponse

SAVE = 'nuonuo.OpeMplatform.saveInvoiceRedConfirm'
QUERY = 'nuonuo.OpeMplatform.queryInvoiceRedConfirm'
REFRESH = 'nuonuo.OpeMplatform.refreshInvoiceRedConfirm'
CONFIRM = 'nuonuo.OpeMplatform.confirm'
REVOKE = 'nuonuo.OpeMplatform.confirmInfoCancel'
QUERY_INVOICE = 'nuonuo.OpeMplatform.queryInvoiceResult'
BLUE_FAPIAO_NO = '20882609251614194530'
OK = {'code': 'E0000', 'describe': '请求成功'}


def red_form(**values):
    """A queryInvoiceRedConfirm record, shaped like the live ones of 2026-09-25."""
    return {
        'billId': 'RED-1',
        'billNo': '990000007566113377',
        'billUuid': 'nuouuid545926b2d144475ba653d90',
        'billStatus': '02',
        'billMessage': '',
        'applySource': 0,
        'taxExcludedAmount': '-100.00',
        'taxAmount': '-13.00',
        'blueElecInvoiceNumber': BLUE_FAPIAO_NO,
        'redReason': '1',
        'invoiceSerialNum': None,
        'redInvoiceNumber': None,
        **values,
    }


def listing(*forms):
    return {'code': 'E0000', 'describe': '调用成功', 'result': {'total': len(forms), 'list': list(forms)}}


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestNuonuoRed(L10nCnEdiNuonuoTestCommon):

    def setUp(self):
        super().setUp()
        self.downloads['https://nuonuo.test/red.pdf'] = b'%PDF red'
        self.downloads['https://nuonuo.test/red.ofd'] = b'PK red'

    def _answer_forms(self, *bodies):
        """Answer queryInvoiceRedConfirm with each body in turn, repeating the last one."""
        self._answer(QUERY, *bodies)

    def _credit_note(self, reason='02'):
        invoice = self.init_invoice('out_invoice', partner=self.partner_a, products=self.product_a, taxes=self.tax_sale_a)
        invoice.action_post()
        invoice.write({'l10n_cn_edi_state': 'issued', 'l10n_cn_edi_fapiao_no': BLUE_FAPIAO_NO})
        wizard = self.env['account.move.reversal'].with_context(active_ids=invoice.ids, active_model='account.move').create({
            'journal_id': invoice.journal_id.id,
            'reason': 'placeholder',
            'l10n_cn_edi_red_form_reason': reason,
        })
        wizard.reverse_moves()
        return wizard.new_move_ids

    # ------------------------------------------------------------------
    # Seller side
    # ------------------------------------------------------------------

    def test_full_red_form_is_applied_for(self):
        credit_note = self._credit_note(reason='01')
        self._answer(SAVE, OK)
        self._answer_forms(listing(red_form(billStatus='02')))

        credit_note.action_l10n_cn_edi_request_red_form()

        payload = self._requests_for(SAVE)[0]['payload']
        self.assertEqual(payload['billId'], credit_note.l10n_cn_edi_serial_no)
        self.assertEqual(payload['blueElecInvoiceNumber'], BLUE_FAPIAO_NO)
        self.assertEqual(payload['blueInvoiceLine'], 'pc')
        self.assertEqual(payload['applySource'], '0')
        self.assertEqual(payload['sellerTaxNo'], self.company.vat)
        # 01 开票有误 is Nuonuo's 2.
        self.assertEqual(payload['redReason'], '2')
        self.assertNotIn('detail', payload, "A full reversal sends no lines")
        self.assertEqual(self._requests_for(QUERY)[0]['payload'], {'identity': '0', 'billId': payload['billId']})
        self.assertRecordValues(credit_note.l10n_cn_edi_document_ids, [{
            'state': 'red_form_pending',
            'bureau_state': '02',
            'red_form_uuid': 'RED-1',
            'red_form_number': '990000007566113377',
        }])

    def test_red_fapiao_issued_without_confirmation(self):
        credit_note = self._credit_note()
        self._answer(SAVE, OK)
        self._answer_forms(listing(red_form(
            billStatus='01',
            redInvoiceNumber='20882609251614554424',
            invoiceSerialNum='26092516145524147049',
        )))
        self._answer(QUERY_INVOICE, {'code': 'E0000', 'result': [{
            'status': '2',
            'allElectronicInvoiceNumber': '20882609251614554424',
            'invoiceTime': 1790324095000,
            'pdfUrl': 'https://nuonuo.test/red.pdf',
            'ofdUrl': 'https://nuonuo.test/red.ofd',
        }]})

        credit_note.action_l10n_cn_edi_request_red_form()

        self.assertEqual(self._requests_for(QUERY_INVOICE)[0]['payload']['serialNos'], ['26092516145524147049'])
        self.assertRecordValues(credit_note, [{
            'l10n_cn_edi_state': 'issued',
            'l10n_cn_edi_fapiao_no': '20882609251614554424',
            'l10n_cn_edi_fapiao_date': datetime(2026, 9, 25, 8, 14, 55),
        }])
        self.assertEqual(credit_note.l10n_cn_edi_fapiao_ofd_id.raw.content, b'PK red')

    def test_form_still_applying_is_polled(self):
        credit_note = self._credit_note()
        self._answer(SAVE, OK)
        self._answer_forms(listing(red_form(billStatus='15')))
        credit_note.action_l10n_cn_edi_request_red_form()
        doc = credit_note.l10n_cn_edi_document_ids
        self.assertRecordValues(doc, [{'state': 'red_form_pending', 'bureau_state': False}])

        self._answer_forms(listing(red_form(billStatus='16', billMessage='该发票已全额冲红')))
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

        self.assertRecordValues(doc, [{'state': 'failed', 'error_message': '该发票已全额冲红'}])

    def test_pending_form_is_refreshed_from_the_bureau(self):
        credit_note = self._credit_note()
        self._answer(SAVE, OK)
        self._answer_forms(listing(red_form(billStatus='02')))
        credit_note.action_l10n_cn_edi_request_red_form()

        self._answer(REFRESH, OK)
        self._answer_forms(listing(red_form(billStatus='02')), listing(red_form(billStatus='04', redInvoiceNumber='20882609251614554424')))
        doc = credit_note.l10n_cn_edi_document_ids
        doc._l10n_cn_edi_apply_red_form_result(self.company._l10n_cn_edi_get_client().query_red_form(doc))

        refresh = self._requests_for(REFRESH)[0]['payload']
        self.assertEqual((refresh['identity'], refresh['billUuid']), ('0', 'nuouuid545926b2d144475ba653d90'))
        self.assertEqual(credit_note.l10n_cn_edi_state, 'issued')

    def test_resubmitted_red_form_is_read_back(self):
        credit_note = self._credit_note()
        self._answer(SAVE, {'code': 'E9999', 'describe': '申请号重复'})
        self._answer_forms(listing(red_form(billStatus='02')))

        credit_note.action_l10n_cn_edi_request_red_form()

        self.assertEqual(credit_note.l10n_cn_edi_document_ids.state, 'red_form_pending')

    def test_refused_red_form_reports_nuonuo(self):
        credit_note = self._credit_note()
        self._answer(SAVE, {'code': 'E9103', 'describe': '该发票不能重复冲红'})
        self._answer_forms(listing())

        credit_note.action_l10n_cn_edi_request_red_form()

        self.assertRecordValues(credit_note.l10n_cn_edi_document_ids, [{'state': 'failed'}])
        self.assertIn('E9103', credit_note.l10n_cn_edi_document_ids.error_message)

    def test_revoking_goes_to_confirm_info_cancel(self):
        credit_note = self._credit_note()
        self._answer(SAVE, OK)
        self._answer_forms(listing(red_form(billStatus='02')))
        credit_note.action_l10n_cn_edi_request_red_form()
        self._answer(REVOKE, OK)

        credit_note.action_l10n_cn_edi_cancel_red_form()

        payload = self._requests_for(REVOKE)[0]['payload']
        self.assertEqual((payload['billId'], payload['identity']), ('RED-1', '0'))

    # ------------------------------------------------------------------
    # Buyer side
    # ------------------------------------------------------------------

    def test_inbound_red_forms_are_downloaded_then_listed(self):
        bill = self.init_invoice('in_invoice', partner=self.partner_a, products=self.product_a, taxes=self.tax_purchase_a)
        bill.action_post()
        bill.l10n_cn_edi_fapiao_no = BLUE_FAPIAO_NO
        self._answer(REFRESH, OK)
        self._answer_forms(
            listing(
                red_form(billId='IN-1'),
                red_form(billId='IN-2', applySource=1),  # raised by us as the buyer: not a request to us
            ),
            listing(red_form(billId='OWN-1')),  # seller side, but raised by us
        )

        forms = self.company._l10n_cn_edi_get_client().list_inbound_red_forms(date(2026, 9, 1), date(2026, 9, 25))

        refreshes = [request['payload'] for request in self._requests_for(REFRESH)]
        self.assertEqual([refresh['identity'] for refresh in refreshes], ['1', '0'])
        self.assertEqual((refreshes[0]['startTime'], refreshes[0]['endTime']), ('2026-09-01', '2026-09-25'))
        queries = [request['payload'] for request in self._requests_for(QUERY)]
        self.assertEqual([(query['identity'], query.get('billStatus')) for query in queries], [('1', None), ('0', '03')])
        self.assertEqual(forms, [{
            'uuid': 'IN-1',
            'number': '990000007566113377',
            'bureau_state': '02',
            'red_fapiao_no': False,
            'original_fapiao_no': BLUE_FAPIAO_NO,
            'amount_untaxed': -100.0,
            'amount_tax': -13.0,
            # Nuonuo's 1 is 02 销货退回.
            'reason': '02',
        }])

        self._answer_forms(listing(red_form(billId='IN-1')), listing())
        self.env['l10n_cn_edi.document']._l10n_cn_edi_import_inbound_red_forms(self.company, date(2026, 9, 1), date(2026, 9, 25))
        self._answer(CONFIRM, OK)
        bill.action_l10n_cn_edi_approve_inbound_red_form()

        payload = self._requests_for(CONFIRM)[0]['payload']
        self.assertEqual((payload['billId'], payload['identity'], payload['confirmAgreement']), ('IN-1', '1', '1'))

    def test_inbound_listing_follows_the_pages(self):
        self._answer(REFRESH, OK)
        full_page = {'code': 'E0000', 'result': {'total': 51, 'list': [red_form(billId=f'IN-{n}') for n in range(50)]}}
        self._answer_forms(
            full_page,
            {'code': 'E0000', 'result': {'total': 51, 'list': [red_form(billId='IN-50')]}},
            listing(),
        )

        forms = self.company._l10n_cn_edi_get_client().list_inbound_red_forms(date(2026, 9, 1), date(2026, 9, 25))

        self.assertEqual(len(forms), 51)
        self.assertEqual([request['payload']['pageNo'] for request in self._requests_for(QUERY)], ['1', '2', '1'])

    def test_customer_raised_form_is_listed(self):
        self._answer(REFRESH, OK)
        self._answer_forms(listing(), listing(red_form(billId='CUST-1', billStatus='03', applySource=1)))

        forms = self.company._l10n_cn_edi_get_client().list_inbound_red_forms(date(2026, 9, 1), date(2026, 9, 25))

        self.assertEqual([(form['uuid'], form['bureau_state']) for form in forms], [('CUST-1', '03')])

    def test_failed_confirmation_is_reported(self):
        bill = self.init_invoice('in_invoice', partner=self.partner_a, products=self.product_a, taxes=self.tax_purchase_a)
        bill.action_post()
        self.env['l10n_cn_edi.document'].create({'move_id': bill.id, 'state': 'red_form_pending', 'red_form_uuid': 'IN-1'})
        self.nuonuo.handlers[CONFIRM] = MockResponse({'code': 'E9999', 'describe': '确认单已超时'})

        with self.assertRaisesRegex(UserError, '确认单已超时'):
            bill.action_l10n_cn_edi_reject_inbound_red_form()
