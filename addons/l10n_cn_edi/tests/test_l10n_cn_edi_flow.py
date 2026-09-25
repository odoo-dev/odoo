# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import datetime
from unittest.mock import patch

from odoo.exceptions import UserError
from odoo.tests import tagged

from .common import L10nCnEdiTestCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nCnEdiFlow(L10nCnEdiTestCommon):

    def setUp(self):
        super().setUp()
        # The cron polls every pending form it knows, inbound ones included.
        self.responses['query_red_form'] = {'bureau_state': '02'}

    # ------------------------------------------------------------------
    # Blue fapiao
    # ------------------------------------------------------------------

    def test_offline_issue_does_not_mark_failed(self):
        invoice = self._create_posted_invoice()
        self.responses['ensure_ready'] = UserError("Offline: DNS failure")

        error = self._issue(invoice)

        self.assertEqual(error, "Offline: DNS failure")
        self.assertEqual(invoice.l10n_cn_edi_state, 'not_sent')
        self.assertFalse(invoice.l10n_cn_edi_serial_no)
        self.assertNotIn('issue_invoice', [method for method, _args in self.client.calls])

    def test_issue_records_the_fapiao(self):
        invoice = self._create_posted_invoice()
        self.responses['issue_invoice'] = {
            'state': 'issued',
            'fapiao_no': '24442000000071309399',
            'fapiao_date': datetime(2026, 9, 23, 2, 0),
            'qr_code': 'qr-payload',
        }

        self.assertIsNone(self._issue(invoice))

        self.assertRecordValues(invoice, [{
            'l10n_cn_edi_state': 'issued',
            'l10n_cn_edi_fapiao_no': '24442000000071309399',
            'l10n_cn_edi_fapiao_date': datetime(2026, 9, 23, 2, 0),
            'l10n_cn_edi_qr_code': 'qr-payload',
        }])
        values = self.client.calls[-1][1][0]
        self.assertEqual(values['serial_no'], invoice.l10n_cn_edi_serial_no)
        self.assertEqual(values['buyer_name'], self.partner_a.name)

    def test_issue_retry_reuses_the_serial_number(self):
        invoice = self._create_posted_invoice()
        self.responses['issue_invoice'] = UserError("Timeout")
        self._issue(invoice)
        first_serial = invoice.l10n_cn_edi_serial_no

        self.responses['issue_invoice'] = {'state': 'sent'}
        self._issue(invoice)

        self.assertEqual(invoice.l10n_cn_edi_state, 'sent')
        self.assertEqual(self.client.calls[-1][1][0]['serial_no'], first_serial)

    def test_issue_failure_is_recorded(self):
        invoice = self._create_posted_invoice()
        self.responses['issue_invoice'] = {'state': 'failed', 'error': "Buyer tax number is invalid"}

        self.assertEqual(self._issue(invoice), "Buyer tax number is invalid")
        self.assertEqual(invoice.l10n_cn_edi_state, 'failed')

    def test_batch_is_submitted_before_waiting_once(self):
        invoices = self._create_posted_invoice() + self._create_posted_invoice()
        self.client.result_delays = (3, 5)
        self.responses['issue_invoice'] = {'state': 'sent'}
        self.responses['query_invoice'] = {'state': 'issued', 'fapiao_no': '24442000000071309399'}

        errors = self.env['account.move.send']._l10n_cn_edi_issue_invoices(invoices)

        self.assertFalse(errors)
        self.assertEqual(
            [method for method, _args in self.client.calls],
            ['ensure_ready', 'get_session_state', 'issue_invoice', 'issue_invoice', 'wait', 'query_invoice', 'query_invoice'],
        )
        self.assertEqual(invoices.mapped('l10n_cn_edi_state'), ['issued', 'issued'])

    def test_still_pending_fapiao_is_left_to_the_cron(self):
        invoice = self._create_posted_invoice()
        self.client.result_delays = (3, 5)
        self.responses['issue_invoice'] = {'state': 'sent'}
        self.responses['query_invoice'] = {'state': 'sent'}

        self.assertIsNone(self._issue(invoice))

        self.assertEqual(invoice.l10n_cn_edi_state, 'sent')
        self.assertEqual([args for method, args in self.client.calls if method == 'wait'], [(3,), (5,)])
        self.assertTrue(all(args[1] for method, args in self.client.calls if method == 'query_invoice'))

    def test_only_a_dead_order_gets_a_new_serial(self):
        invoice = self._create_posted_invoice()
        self.responses['issue_invoice'] = {'state': 'failed', 'error': "Unknown order"}
        self._issue(invoice)
        self.assertTrue(invoice.l10n_cn_edi_serial_no)

        self.responses['issue_invoice'] = {'state': 'failed', 'error': "Buyer tax number is invalid", 'new_serial': True}
        self._issue(invoice)
        self.assertFalse(invoice.l10n_cn_edi_serial_no)

    def test_lapsed_session_holds_the_batch_for_login(self):
        invoices = self._create_posted_invoice() + self._create_posted_invoice()
        self.responses['get_session_state'] = 'verify'

        errors = self.env['account.move.send']._l10n_cn_edi_issue_invoices(invoices)

        self.assertEqual(set(errors), set(invoices))
        self.assertIn("实名认证", errors[invoices[0]])
        self.assertEqual(invoices.mapped('l10n_cn_edi_state'), ['waiting_login', 'waiting_login'])
        self.assertEqual([method for method, _args in self.client.calls], ['ensure_ready', 'get_session_state'])
        self.assertTrue(self.env['account.move.send']._is_cn_edi_applicable(invoices[0]))

    def test_login_is_the_provider_s(self):
        invoice = self._create_posted_invoice()
        invoice.l10n_cn_edi_state = 'waiting_login'
        with patch.object(self.env.registry['res.company'], '_l10n_cn_edi_action_login', return_value={'type': 'login'}) as login:
            self.assertEqual(invoice.action_l10n_cn_edi_login(), {'type': 'login'})
        self.assertEqual(login.call_args.args, (invoice,))

    def test_send_print_uses_the_e_fapiao_extra_edi(self):
        invoice = self._create_posted_invoice()
        send_model = self.env['account.move.send']
        all_extra_edis = send_model._get_all_extra_edis()
        self.assertIn('cn_edi', all_extra_edis)
        self.assertTrue(all_extra_edis['cn_edi']['is_applicable'](invoice))

        invoices_data = {invoice: {'extra_edis': {'cn_edi'}}}
        with patch.object(invoice.__class__, '_l10n_cn_edi_submit_invoice', return_value="Provider error"):
            send_model._call_web_service_before_invoice_pdf_render(invoices_data)

        self.assertIn("Provider error", invoices_data[invoice]['error']['errors'])

    def test_proportional_global_discount(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [
                (0, 0, {'product_id': self.product_a.id, 'price_unit': 600.0, 'quantity': 1.0}),
                (0, 0, {'product_id': self.product_b.id, 'price_unit': 900.0, 'quantity': 2.0}),
                (0, 0, {'name': 'Global Discount', 'price_unit': -240.0, 'quantity': 1.0}),
            ],
        })
        lines = invoice._l10n_cn_edi_prepare_lines()

        self.assertEqual([line['nature'] for line in lines], ['2', '1', '2', '1'])
        self.assertEqual([line['line_no'] for line in lines], [1, 2, 3, 4])
        self.assertAlmostEqual(lines[1]['amount_untaxed'], -60.0)
        self.assertAlmostEqual(lines[3]['amount_untaxed'], -180.0)

    # ------------------------------------------------------------------
    # Red forms, seller side
    # ------------------------------------------------------------------

    def test_reversal_wizard_propagates_red_form_reason(self):
        credit_note = self._reverse(self._create_posted_invoice())

        self.assertEqual(credit_note.move_type, 'out_refund')
        self.assertEqual(credit_note.l10n_cn_edi_red_form_reason, '02')

    def test_red_form_required_only_for_draft_refund_of_issued_invoice(self):
        self.assertFalse(self._reverse(self._create_posted_invoice()).l10n_cn_edi_red_form_required)
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))

        self.assertEqual(credit_note.state, 'draft')
        self.assertTrue(credit_note.l10n_cn_edi_red_form_required)

    def test_red_form_request_sends_the_chosen_reason(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'), reason='02')
        self.responses['request_red_form'] = {'uuid': 'uuid-1', 'number': 'no-1', 'bureau_state': '02'}

        credit_note.action_l10n_cn_edi_request_red_form()

        values = self.client.calls[-1][1][0]
        self.assertEqual(values['reason'], '02')
        self.assertEqual(values['original_fapiao_no'], '24442000000071309399')
        self.assertTrue(all(line['amount_untaxed'] < 0 for line in values['lines']))
        self.assertEqual(credit_note.l10n_cn_edi_red_form_reason, '02')

    def test_red_form_pending_to_confirmed_lifecycle(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['request_red_form'] = {'uuid': 'uuid-1', 'number': 'no-1', 'bureau_state': '02'}

        credit_note.action_l10n_cn_edi_request_red_form()

        doc = credit_note.l10n_cn_edi_document_ids
        self.assertRecordValues(doc, [{'state': 'red_form_pending', 'bureau_state': '02', 'red_form_uuid': 'uuid-1'}])
        self.assertEqual(credit_note.l10n_cn_edi_red_form_status, 'red_form_pending')

        self.responses['query_red_form'] = {
            'number': 'no-1',
            'bureau_state': '04',
            'red_fapiao_no': 'red-fapiao-789',
            'red_fapiao_date': datetime(2026, 9, 23, 4, 30),
        }
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

        self.assertEqual(doc.state, 'red_form_confirmed')
        self.assertRecordValues(credit_note, [{
            'l10n_cn_edi_red_form_status': 'red_form_confirmed',
            'l10n_cn_edi_state': 'issued',
            'l10n_cn_edi_fapiao_no': 'red-fapiao-789',
            'l10n_cn_edi_fapiao_date': datetime(2026, 9, 23, 4, 30),
        }])

    def test_only_a_full_reversal_gets_a_red_form(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        credit_note.invoice_line_ids.price_unit /= 2

        with self.assertRaisesRegex(UserError, "whole fapiao"):
            credit_note.action_l10n_cn_edi_request_red_form()
        self.assertNotIn('request_red_form', [method for method, _args in self.client.calls])

    def test_red_form_waits_for_the_bureau_to_register_it(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['request_red_form'] = {'uuid': 'uuid-1', 'bureau_state': False}

        credit_note.action_l10n_cn_edi_request_red_form()

        doc = credit_note.l10n_cn_edi_document_ids
        self.assertRecordValues(doc, [{'state': 'red_form_pending', 'red_form_uuid': 'uuid-1', 'bureau_state': False}])

        self.responses['query_red_form'] = {'uuid': 'uuid-1', 'bureau_state': False, 'error': "Blue fapiao already reversed"}
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

        self.assertRecordValues(doc, [{'state': 'failed', 'error_message': "Blue fapiao already reversed"}])
        self.assertEqual(credit_note.l10n_cn_edi_state, 'failed')

    def test_confirmed_red_form_waits_for_its_red_fapiao(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['request_red_form'] = {'uuid': 'uuid-1', 'number': 'no-1', 'bureau_state': '01'}

        credit_note.action_l10n_cn_edi_request_red_form()

        doc = credit_note.l10n_cn_edi_document_ids
        self.assertRecordValues(doc, [{'state': 'red_form_pending', 'bureau_state': '01'}])
        self.assertEqual(credit_note.l10n_cn_edi_state, 'not_sent')

        self.responses['query_red_form'] = {
            'bureau_state': '01',
            'red_fapiao_no': 'red-fapiao-789',
            'pdf': b'%PDF red',
            'ofd': b'PK red',
        }
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

        self.assertEqual(doc.state, 'red_form_confirmed')
        self.assertEqual(credit_note.l10n_cn_edi_fapiao_no, 'red-fapiao-789')
        self.assertEqual(credit_note.l10n_cn_edi_fapiao_pdf_id.raw.content, b'%PDF red')
        self.assertEqual(credit_note.l10n_cn_edi_fapiao_ofd_id.name, 'red-fapiao-789.ofd')

    def test_red_form_reuses_single_document(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['request_red_form'] = {'uuid': 'uuid-1', 'number': 'no-1', 'bureau_state': '02'}
        credit_note.action_l10n_cn_edi_request_red_form()

        with self.assertRaises(UserError):
            credit_note.action_l10n_cn_edi_request_red_form()
        self.assertEqual(len(credit_note.l10n_cn_edi_document_ids), 1)

    def test_revoking_a_pending_red_form(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['request_red_form'] = {'uuid': 'uuid-1', 'number': 'no-1', 'bureau_state': '02'}
        credit_note.action_l10n_cn_edi_request_red_form()

        credit_note.action_l10n_cn_edi_cancel_red_form()

        self.assertEqual(self.client.calls[-1][0], 'operate_red_form')
        self.assertEqual(self.client.calls[-1][1][1], 'revoke')
        self.assertRecordValues(credit_note.l10n_cn_edi_document_ids, [{'state': 'failed', 'bureau_state': '08'}])

    def test_red_form_status_cron_handles_empty_queue(self):
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

    # ------------------------------------------------------------------
    # Red forms, buyer side
    # ------------------------------------------------------------------

    def _create_vendor_bill(self, fapiao_no):
        bill = self.init_invoice('in_invoice', partner=self.partner_a, products=self.product_a, taxes=self.tax_purchase_a)
        bill.action_post()
        bill.l10n_cn_edi_fapiao_no = fapiao_no
        return bill

    def test_inbound_red_form_is_imported_and_approved(self):
        bill = self._create_vendor_bill('31000000000000000001')
        self.responses['list_inbound_red_forms'] = [
            {'uuid': 'in-1', 'number': 'rf-1', 'bureau_state': '02', 'original_fapiao_no': '31000000000000000001',
             'amount_untaxed': -100.0, 'amount_tax': -13.0, 'reason': '02'},
            {'uuid': 'in-2', 'number': 'rf-2', 'bureau_state': '02', 'original_fapiao_no': 'unknown'},
            {'uuid': 'in-3', 'number': 'rf-3', 'bureau_state': '05', 'original_fapiao_no': '31000000000000000001'},
        ]

        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

        doc = bill.l10n_cn_edi_document_ids
        self.assertRecordValues(doc, [{'red_form_uuid': 'in-1', 'state': 'red_form_pending', 'amount_tax': -13.0}])

        bill.action_l10n_cn_edi_approve_inbound_red_form()

        self.assertEqual(self.client.calls[-1][1][1], 'confirm')
        # Confirmed at the bureau, which now issues the red fapiao: no credit note to draft yet.
        self.assertRecordValues(doc, [{'state': 'red_form_pending', 'bureau_state': '04'}])

        self.responses['list_inbound_red_forms'] = []
        self.responses['query_red_form'] = {'bureau_state': '04', 'red_fapiao_no': '31000000000000000009'}
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

        self.assertEqual(doc.state, 'red_form_confirmed')
        credit_note = self._reverse(bill)
        self.assertRecordValues(credit_note, [{'l10n_cn_edi_fapiao_no': '31000000000000000009', 'l10n_cn_edi_state': 'issued'}])

    def test_customer_raised_red_form_lands_on_the_invoice(self):
        invoice = self._create_posted_invoice(fapiao_no='24442000000071309399')
        self.responses['list_inbound_red_forms'] = [
            {'uuid': 'in-9', 'number': 'rf-9', 'bureau_state': '03', 'original_fapiao_no': '24442000000071309399',
             'amount_untaxed': -50.0, 'amount_tax': -6.5, 'reason': '04'},
        ]
        self.responses['query_red_form'] = {'bureau_state': '03'}

        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

        doc = invoice.l10n_cn_edi_document_ids
        self.assertRecordValues(doc, [{'red_form_uuid': 'in-9', 'state': 'red_form_pending', 'bureau_state': '03'}])
        self.assertEqual(invoice.l10n_cn_edi_red_form_bureau_state, '03')

        invoice.action_l10n_cn_edi_reject_inbound_red_form()

        self.assertEqual(self.client.calls[-1][1][1:], ('reject',))
        self.assertRecordValues(doc, [{'state': 'failed', 'bureau_state': '06'}])

    def test_credit_note_of_a_customer_raised_red_form_needs_no_red_form(self):
        invoice = self._create_posted_invoice(fapiao_no='24442000000071309399')
        self.env['l10n_cn_edi.document'].create({
            'move_id': invoice.id,
            'state': 'red_form_confirmed',
            'bureau_state': '04',
            'red_form_uuid': 'in-9',
            'red_fapiao_no': '24442000000071309400',
        })

        credit_note = self._reverse(invoice)

        self.assertRecordValues(credit_note, [{
            'l10n_cn_edi_fapiao_no': '24442000000071309400',
            'l10n_cn_edi_state': 'issued',
            'l10n_cn_edi_red_form_required': False,
            'hide_post_button': False,
        }])

    def test_inbound_red_form_is_not_imported_twice(self):
        bill = self._create_vendor_bill('31000000000000000001')
        self.responses['list_inbound_red_forms'] = [
            {'uuid': 'in-1', 'number': 'rf-1', 'bureau_state': '02', 'original_fapiao_no': '31000000000000000001'},
        ]
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

        self.assertEqual(len(bill.l10n_cn_edi_document_ids), 1)
