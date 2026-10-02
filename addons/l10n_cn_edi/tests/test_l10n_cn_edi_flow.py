# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import datetime
from unittest.mock import patch

from freezegun import freeze_time

from odoo import Command
from odoo.exceptions import AccessError, UserError
from odoo.tests import tagged

from odoo.addons.l10n_cn_edi.tools import L10nCnEdiProviderUnreachable

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

    def test_reversal_preserves_manual_tax_category(self):
        invoice = self._create_posted_invoice()
        line = invoice.invoice_line_ids
        category = line.l10n_cn_tax_category_id
        line.product_id = False
        line.l10n_cn_tax_category_id = category

        credit_note = self._reverse(invoice)

        self.assertEqual(credit_note.invoice_line_ids.l10n_cn_tax_category_id, category)

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

    def test_issue_amount_mismatch_keeps_issued_and_warns(self):
        invoice = self._create_posted_invoice()
        self.responses['issue_invoice'] = {
            'state': 'issued',
            'fapiao_no': '24442000000071309399',
            'amount_total': 10.0,
            'amount_untaxed': 8.85,
            'amount_tax': 1.15,
        }

        self.assertIsNone(self._issue(invoice))

        self.assertEqual(invoice.l10n_cn_edi_state, 'issued')
        self.assertEqual(invoice.l10n_cn_edi_fapiao_no, '24442000000071309399')
        self.assertIn('amount mismatch', ''.join(invoice.message_ids.mapped('body')))

    def test_issue_retry_reuses_the_serial_number(self):
        invoice = self._create_posted_invoice()
        self.responses['issue_invoice'] = UserError("Timeout")
        self._issue(invoice)
        first_serial = invoice.l10n_cn_edi_serial_no

        self.responses['issue_invoice'] = {'state': 'sent'}
        self._issue(invoice)

        self.assertEqual(invoice.l10n_cn_edi_state, 'sent')
        self.assertEqual(self.client.calls[-1][1][0]['serial_no'], first_serial)

    def test_issue_serial_is_stored_before_network_submission(self):
        invoice = self._create_posted_invoice()
        stored_serials = []
        self.responses['issue_invoice'] = lambda: stored_serials.append(invoice.l10n_cn_edi_serial_no) or {'state': 'sent'}

        self._issue(invoice)

        issue_values = [args[0] for method, args in self.client.calls if method == 'issue_invoice'][-1]
        self.assertTrue(issue_values['serial_no'])
        self.assertEqual(stored_serials, [issue_values['serial_no']])
        self.assertLessEqual(len(issue_values['serial_no']), 20)

    def test_serial_is_deterministic(self):
        invoice = self._create_posted_invoice()
        serial = invoice._l10n_cn_edi_make_serial('B')

        self.assertEqual(invoice._l10n_cn_edi_make_serial('B'), serial)
        self.assertTrue(serial.startswith(f'B{invoice.id}_0_'))
        invoice._l10n_cn_edi_drop_serial()
        self.assertNotEqual(invoice._l10n_cn_edi_make_serial('B'), serial)

    def test_batch_goes_on_after_an_invoice_that_cannot_be_prepared(self):
        broken = self.init_invoice('out_invoice', partner=self.partner_a, products=self.product_a, taxes=self.tax_sale_a)
        broken.invoice_line_ids.l10n_cn_tax_category_id = False
        broken.action_post()
        invoice = self._create_posted_invoice()
        self.responses['issue_invoice'] = {'state': 'issued', 'fapiao_no': '24442000000071309399'}

        errors = self.env['account.move.send']._l10n_cn_edi_issue_invoices(broken + invoice)

        self.assertEqual(errors, {broken: f"Missing Tax Category Code on line: {broken.invoice_line_ids.name}"})
        self.assertEqual((broken + invoice).mapped('l10n_cn_edi_state'), ['not_sent', 'issued'])

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
        first_serial = invoice.l10n_cn_edi_serial_no
        self.assertTrue(first_serial)

        self.responses['issue_invoice'] = {'state': 'failed', 'error': "Buyer tax number is invalid", 'new_serial': True}
        self._issue(invoice)
        self.assertFalse(invoice.l10n_cn_edi_serial_no)

        self.responses['issue_invoice'] = UserError("offline")
        self._issue(invoice)
        self.assertTrue(invoice.l10n_cn_edi_serial_no)
        self.assertNotEqual(invoice.l10n_cn_edi_serial_no, first_serial)

    def test_unanswered_submission_is_locked_and_polled_with_the_same_serial(self):
        invoice = self._create_posted_invoice()
        self.responses['issue_invoice'] = L10nCnEdiProviderUnreachable("Read timed out")

        self.assertIsNone(self._issue(invoice))

        serial = invoice.l10n_cn_edi_serial_no
        self.assertEqual(invoice.l10n_cn_edi_state, 'sent')
        self.assertTrue(invoice.l10n_cn_edi_sent_date)
        with self.assertRaisesRegex(UserError, 'cannot reset this document to draft'):
            invoice.button_draft()

        self.responses['query_invoice'] = {'state': 'issued', 'fapiao_no': '24442000000071309399'}
        self.env['account.move']._cron_l10n_cn_edi_poll_invoices()

        self.assertEqual(invoice.l10n_cn_edi_serial_no, serial)
        self.assertEqual(invoice.l10n_cn_edi_state, 'issued')

    def test_refused_submission_leaves_the_invoice_retryable(self):
        invoice = self._create_posted_invoice()
        self.responses['issue_invoice'] = UserError("Invalid credentials")

        self.assertEqual(self._issue(invoice), "Invalid credentials")
        self.assertEqual(invoice.l10n_cn_edi_state, 'not_sent')
        self.assertFalse(invoice.l10n_cn_edi_sent_date)

    def test_cron_gives_a_fresh_submission_time_to_show_up(self):
        invoice = self._create_posted_invoice()
        self.client.result_delays = (3, 5)
        self.responses['issue_invoice'] = {'state': 'sent'}
        self.responses['query_invoice'] = {'state': 'sent'}
        cron = self.env.ref('l10n_cn_edi.ir_cron_l10n_cn_edi_poll_invoices')

        with freeze_time('2026-10-02 10:00:00'):
            self._issue(invoice)
            trigger = self.env['ir.cron.trigger'].search([('cron_id', '=', cron.id)], order='id desc', limit=1)
            self.assertEqual(trigger.call_at, datetime(2026, 10, 2, 10, 0, 8))
            self.client.calls.clear()
            self.env['account.move']._cron_l10n_cn_edi_poll_invoices()
        self.assertEqual(self.client.calls, [('query_invoice', (invoice, True))])

        with freeze_time('2026-10-02 10:10:01'):
            self.client.calls.clear()
            self.env['account.move']._cron_l10n_cn_edi_poll_invoices()
        self.assertEqual(self.client.calls, [('query_invoice', (invoice, False))])

    def test_poll_cron_goes_on_after_a_company_without_client(self):
        other_company = self.env['res.company'].create({'name': "Other CN Company"})
        other_journal = self.env['account.journal'].create({'name': "Misc", 'code': 'MISC', 'type': 'general', 'company_id': other_company.id})
        other_invoice = self.env['account.move'].create({'journal_id': other_journal.id})
        invoice = self._create_posted_invoice()
        (invoice + other_invoice).l10n_cn_edi_state = 'sent'
        self.responses['query_invoice'] = {'state': 'issued', 'fapiao_no': '24442000000071309399'}

        def get_client(company):
            if company == invoice.company_id:
                raise UserError("Credentials expired")
            return self.client

        with patch.object(self.env.registry['res.company'], '_l10n_cn_edi_get_client', get_client):
            self.env['account.move'].sudo()._cron_l10n_cn_edi_poll_invoices()

        self.assertEqual((invoice + other_invoice).mapped('l10n_cn_edi_state'), ['sent', 'issued'])

    def test_poll_cron_stops_when_its_time_is_up(self):
        invoices = self._create_posted_invoice() + self._create_posted_invoice()
        invoices.l10n_cn_edi_state = 'sent'
        self.responses['query_invoice'] = {'state': 'sent'}
        self.commit_progress.return_value = 0

        self.env['account.move']._cron_l10n_cn_edi_poll_invoices()

        self.assertEqual(len([method for method, _args in self.client.calls if method == 'query_invoice']), 1)

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

        self.assertEqual(invoices_data[invoice]['error'], {
            'error_title': "Error when issuing the e-Fapiao:",
            'errors': ["Provider error"],
        })

    def test_send_print_stops_on_pending_fapiao(self):
        invoice = self._create_posted_invoice()
        self.responses['issue_invoice'] = {'state': 'sent'}
        self.responses['query_invoice'] = {'state': 'sent'}

        invoices_data = {invoice: {'extra_edis': {'cn_edi'}}}
        self.env['account.move.send']._call_web_service_before_invoice_pdf_render(invoices_data)

        self.assertEqual(invoices_data[invoice]['error'], {
            'error_title': "Error when issuing the e-Fapiao:",
            'errors': ["The e-Fapiao is still being issued by the tax bureau. Try again once it is issued."],
            'retry': True,
        })

    def test_send_print_holds_any_pending_fapiao(self):
        invoice = self._create_posted_invoice()
        invoice.l10n_cn_edi_state = 'sent'
        send_model = self.env['account.move.send']
        self.assertFalse(send_model._get_all_extra_edis()['cn_edi']['is_applicable'](invoice))

        invoices_data = {invoice: {}}
        send_model._call_web_service_before_invoice_pdf_render(invoices_data)

        self.assertTrue(invoices_data[invoice]['error']['retry'])
        self.assertNotIn('issue_invoice', [method for method, _args in self.client.calls])

    def test_lapsed_session_does_not_hold_an_invoice_sent_meanwhile(self):
        invoices = self._create_posted_invoice() + self._create_posted_invoice()
        self.responses['get_session_state'] = 'login'
        self.env.flush_all()
        # Sent by another transaction meanwhile.
        self.env.cr.execute("UPDATE account_move SET l10n_cn_edi_state = 'sent' WHERE id = %s", [invoices[0].id])

        errors = self.env['account.move.send']._l10n_cn_edi_issue_invoices(invoices)

        self.assertEqual(invoices.mapped('l10n_cn_edi_state'), ['sent', 'waiting_login'])
        self.assertEqual(set(errors), {invoices[1]})

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

    def test_global_discount_over_categories_of_the_same_rate(self):
        other_category = self.env['l10n_cn_edi.tax.category'].sudo().create({'name': 'Other', 'code': '1010101020000000000'})
        self.product_b.product_tmpl_id.l10n_cn_tax_category_id = other_category
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [
                Command.create({'product_id': self.product_a.id, 'price_unit': 100.0, 'tax_ids': [Command.set(self.tax_sale_a.ids)]}),
                Command.create({'product_id': self.product_b.id, 'price_unit': 300.0, 'tax_ids': [Command.set(self.tax_sale_a.ids)]}),
                Command.create({'name': 'Global Discount', 'price_unit': -40.0, 'tax_ids': [Command.set(self.tax_sale_a.ids)]}),
            ],
        })

        lines = invoice._l10n_cn_edi_prepare_lines()

        self.assertEqual([line['amount_untaxed'] for line in lines], [100.0, -10.0, 300.0, -30.0])
        self.assertEqual(lines[2]['tax_category_code'], '1010101020000000000')

    def test_global_discount_of_another_tax_is_rejected(self):
        extra_tax = self.env['account.tax'].create({
            'name': 'VAT 6%',
            'amount_type': 'percent',
            'amount': 6.0,
            'type_tax_use': 'sale',
            'company_id': self.company_data['company'].id,
        })
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [
                Command.create({'product_id': self.product_a.id, 'price_unit': 100.0, 'tax_ids': [Command.set(self.tax_sale_a.ids)]}),
                Command.create({'name': 'Global Discount', 'price_unit': -10.0, 'tax_ids': [Command.set(extra_tax.ids)]}),
            ],
        })

        with self.assertRaisesRegex(UserError, 'Global negative lines spanning multiple tax groups are not supported'):
            invoice._l10n_cn_edi_prepare_lines()

    def test_prepare_lines_rejects_multiple_taxes(self):
        extra_tax = self.env['account.tax'].create({
            'name': 'Extra VAT 3%',
            'amount_type': 'percent',
            'amount': 3.0,
            'type_tax_use': 'sale',
            'company_id': self.company_data['company'].id,
        })
        invoice = self.init_invoice('out_invoice', partner=self.partner_a, products=self.product_a, taxes=self.tax_sale_a + extra_tax)

        with self.assertRaisesRegex(UserError, 'Only one percentage tax is supported'):
            invoice._l10n_cn_edi_prepare_lines()

    def test_prepare_lines_rejects_non_percent_tax(self):
        fixed_tax = self.env['account.tax'].create({
            'name': 'Fixed VAT',
            'amount_type': 'fixed',
            'amount': 1.0,
            'type_tax_use': 'sale',
            'company_id': self.company_data['company'].id,
        })
        invoice = self.init_invoice('out_invoice', partner=self.partner_a, products=self.product_a, taxes=fixed_tax)

        with self.assertRaisesRegex(UserError, 'Only one percentage tax is supported'):
            invoice._l10n_cn_edi_prepare_lines()

    def test_prepare_lines_rejects_cross_tax_group_global_discount(self):
        extra_tax = self.env['account.tax'].create({
            'name': 'VAT 6%',
            'amount_type': 'percent',
            'amount': 6.0,
            'type_tax_use': 'sale',
            'company_id': self.company_data['company'].id,
        })
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [
                (0, 0, {'product_id': self.product_a.id, 'price_unit': 100.0, 'quantity': 1.0, 'tax_ids': [(6, 0, self.tax_sale_a.ids)]}),
                (0, 0, {'product_id': self.product_b.id, 'price_unit': 100.0, 'quantity': 1.0, 'tax_ids': [(6, 0, extra_tax.ids)]}),
                (0, 0, {'name': 'Global Discount', 'price_unit': -10.0, 'quantity': 1.0, 'tax_ids': [(6, 0, self.tax_sale_a.ids)]}),
            ],
        })

        with self.assertRaisesRegex(UserError, 'Global negative lines spanning multiple tax groups are not supported'):
            invoice._l10n_cn_edi_prepare_lines()

    def test_prepare_lines_rejects_100_percent_discount(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [
                (0, 0, {
                    'product_id': self.product_a.id,
                    'price_unit': 100.0,
                    'quantity': 1.0,
                    'discount': 100.0,
                    'tax_ids': [(6, 0, self.tax_sale_a.ids)],
                }),
            ],
        })

        with self.assertRaisesRegex(UserError, '100% line discounts are not supported'):
            invoice._l10n_cn_edi_prepare_lines()

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

    def test_revoked_red_form_can_be_requested_again(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['request_red_form'] = {'uuid': 'uuid-1', 'number': 'no-1', 'bureau_state': '02'}
        credit_note.action_l10n_cn_edi_request_red_form()
        first_serial = credit_note.l10n_cn_edi_serial_no
        credit_note.action_l10n_cn_edi_cancel_red_form()

        credit_note.l10n_cn_edi_red_form_reason = '02'
        self.responses['request_red_form'] = {'uuid': 'uuid-2', 'number': 'no-2', 'bureau_state': '02'}
        credit_note.action_l10n_cn_edi_request_red_form()

        self.assertNotEqual(self.client.calls[-1][1][0]['serial_no'], first_serial)
        self.assertRecordValues(credit_note.l10n_cn_edi_document_ids, [{'state': 'red_form_pending', 'red_form_uuid': 'uuid-2'}])

    def test_pending_red_form_locks_the_credit_note(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['request_red_form'] = {'uuid': 'uuid-1', 'number': 'no-1', 'bureau_state': '02'}
        credit_note.action_l10n_cn_edi_request_red_form()

        with self.assertRaisesRegex(UserError, 'its red fapiao is requested or issued'):
            credit_note.invoice_line_ids.price_unit = 1.0
        with self.assertRaisesRegex(UserError, 'cannot cancel'):
            credit_note.button_cancel()

    def test_credit_note_opens_without_a_provider(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        credit_note.invalidate_recordset()

        with patch.object(self.env.registry['res.company'], '_l10n_cn_edi_get_client', side_effect=UserError("No provider")):
            self.assertTrue(credit_note.hide_post_button)
            with self.assertRaisesRegex(UserError, 'posted only once its red fapiao is issued'):
                credit_note.action_post()

    def test_red_form_status_cron_handles_empty_queue(self):
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

    def test_direct_red_uses_invoice_lane_without_red_form_document(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True
        self.responses['issue_direct_red'] = {'state': 'sent'}
        self.responses['query_direct_red'] = {'state': 'sent'}

        credit_note.action_l10n_cn_edi_request_red_form()

        self.assertFalse(credit_note.l10n_cn_edi_document_ids)
        self.assertEqual(credit_note.l10n_cn_edi_state, 'sent')
        self.assertIn('issue_direct_red', [method for method, _args in self.client.calls])
        self.assertNotIn('request_red_form', [method for method, _args in self.client.calls])

        self.responses['query_direct_red'] = {
            'state': 'issued',
            'fapiao_no': 'red-fapiao-789',
            'fapiao_date': datetime(2026, 9, 23, 4, 30),
        }
        self.env['account.move']._cron_l10n_cn_edi_poll_invoices()

        self.assertFalse(credit_note.l10n_cn_edi_document_ids)
        self.assertEqual(credit_note.l10n_cn_edi_state, 'issued')
        self.assertEqual(credit_note.l10n_cn_edi_fapiao_no, 'red-fapiao-789')

    def test_direct_red_failure_uses_invoice_failure_state(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True
        self.responses['issue_direct_red'] = {'state': 'failed', 'error': 'Aisino refused direct red'}

        credit_note.action_l10n_cn_edi_request_red_form()

        self.assertFalse(credit_note.l10n_cn_edi_document_ids)
        self.assertEqual(credit_note.l10n_cn_edi_state, 'failed')

    def test_direct_red_post_button_guard_uses_invoice_state(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True

        credit_note._compute_hide_post_button()
        self.assertTrue(credit_note.hide_post_button)

        self.responses['issue_direct_red'] = {'state': 'issued', 'fapiao_no': 'red-fapiao-789'}
        credit_note.action_l10n_cn_edi_request_red_form()
        credit_note._compute_hide_post_button()
        self.assertFalse(credit_note.hide_post_button)

    def test_direct_red_cron_uses_direct_query(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        credit_note.l10n_cn_edi_state = 'sent'
        self.responses['supports_direct_red'] = True
        self.responses['query_direct_red'] = {'state': 'issued', 'fapiao_no': 'red-fapiao-789'}

        self.env['account.move']._cron_l10n_cn_edi_poll_invoices()

        self.assertEqual(self.client.calls, [('query_direct_red', (credit_note, False))])
        self.assertEqual(credit_note.l10n_cn_edi_state, 'issued')

    def test_direct_red_unanswered_request_waits_for_the_cron(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True
        self.responses['issue_direct_red'] = L10nCnEdiProviderUnreachable("Connection reset")

        credit_note.action_l10n_cn_edi_request_red_form()

        self.assertEqual(credit_note.l10n_cn_edi_state, 'sent')
        with self.assertRaisesRegex(UserError, 'its red fapiao is requested or issued'):
            credit_note.invoice_line_ids.price_unit = 1.0

    def test_direct_red_refused_request_changes_nothing(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True
        self.responses['issue_direct_red'] = UserError("Invalid credentials")

        with self.assertRaisesRegex(UserError, 'Invalid credentials'):
            credit_note.action_l10n_cn_edi_request_red_form()
        self.assertEqual(credit_note.l10n_cn_edi_state, 'not_sent')

    def test_direct_red_uses_stable_serial(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True
        self.responses['issue_direct_red'] = {'state': 'failed', 'error': 'temporary'}

        credit_note.action_l10n_cn_edi_request_red_form()
        serial_1 = credit_note.l10n_cn_edi_serial_no
        credit_note.action_l10n_cn_edi_request_red_form()
        serial_2 = credit_note.l10n_cn_edi_serial_no

        self.assertEqual(serial_1, serial_2)
        self.assertTrue(serial_1.startswith(f'R{credit_note.id}_0_'))

    def test_direct_red_sent_credit_note_cannot_be_deleted(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True
        credit_note.l10n_cn_edi_state = 'sent'

        with self.assertRaisesRegex(UserError, 'its red fapiao is requested or issued'):
            credit_note.unlink()

    def test_direct_red_sent_credit_note_cannot_edit_invoice_lines(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True
        credit_note.l10n_cn_edi_state = 'sent'

        with self.assertRaisesRegex(UserError, 'its red fapiao is requested or issued'):
            credit_note.write({'invoice_line_ids': [(1, credit_note.invoice_line_ids[0].id, {'name': 'Edited'})]})

    def test_direct_red_sent_credit_note_cannot_edit_lines_via_line_model(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True
        credit_note.l10n_cn_edi_state = 'sent'

        with self.assertRaisesRegex(UserError, 'its red fapiao is requested or issued'):
            credit_note.invoice_line_ids[0].write({'name': 'Edited'})

    def test_direct_red_sent_credit_note_cannot_reassign_lines(self):
        invoice = self._create_posted_invoice(fapiao_no='24442000000071309399')
        credit_note = self._reverse(invoice)
        self.responses['supports_direct_red'] = True
        credit_note.l10n_cn_edi_state = 'sent'

        with self.assertRaisesRegex(UserError, 'its red fapiao is requested or issued'):
            credit_note.invoice_line_ids[0].write({'move_id': invoice.id})

    def test_direct_red_sent_credit_note_cannot_delete_lines(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True
        credit_note.l10n_cn_edi_state = 'sent'

        with self.assertRaisesRegex(UserError, 'its red fapiao is requested or issued'):
            credit_note.invoice_line_ids.unlink()

    def test_post_credit_note_requires_red_prerequisite_server_side(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))

        with self.assertRaisesRegex(UserError, 'posted only once its red fapiao is issued'):
            credit_note.action_post()

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

    def _create_auditor(self):
        company = self.company_data['company']
        return self.env['res.users'].create({
            'name': 'Auditor',
            'login': 'cn_edi_auditor',
            'group_ids': [Command.set(self.env.ref('account.group_account_readonly').ids)],
            'company_id': company.id,
            'company_ids': [Command.set(company.ids)],
        })

    def test_inbound_red_form_actions_require_accounting_role(self):
        bill = self._create_vendor_bill('31000000000000000001')
        doc = self.env['l10n_cn_edi.document'].create({
            'move_id': bill.id,
            'state': 'red_form_pending',
            'bureau_state': '02',
            'red_form_uuid': 'in-11',
        })
        auditor = self._create_auditor()
        self.assertEqual(doc.with_user(auditor).state, 'red_form_pending')

        with self.assertRaises(AccessError):
            bill.with_user(auditor).action_l10n_cn_edi_approve_inbound_red_form()
        with self.assertRaises(AccessError):
            bill.with_user(auditor).action_l10n_cn_edi_reject_inbound_red_form()
        self.assertNotIn('operate_red_form', [method for method, _args in self.client.calls])

    def test_red_fapiao_request_requires_accounting_role(self):
        credit_note = self._reverse(self._create_posted_invoice(fapiao_no='24442000000071309399'))
        self.responses['supports_direct_red'] = True
        self.responses['issue_direct_red'] = {'state': 'issued', 'fapiao_no': 'red-fapiao-789'}

        with self.assertRaises(AccessError):
            credit_note.with_user(self._create_auditor()).action_l10n_cn_edi_request_red_form()
        self.assertNotIn('issue_direct_red', [method for method, _args in self.client.calls])

    def test_inbound_red_form_actions_require_pending_state(self):
        bill = self._create_vendor_bill('31000000000000000001')
        doc = self.env['l10n_cn_edi.document'].create({
            'move_id': bill.id,
            'state': 'red_form_confirmed',
            'bureau_state': '04',
            'red_form_uuid': 'in-12',
        })

        with self.assertRaisesRegex(UserError, 'Only pending Red Forms can be processed'):
            doc._l10n_cn_edi_check_action_role('confirm')

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

    def test_partial_inbound_red_form_does_not_auto_inherit_number_on_full_reversal(self):
        invoice = self._create_posted_invoice(fapiao_no='24442000000071309399')
        self.env['l10n_cn_edi.document'].create({
            'move_id': invoice.id,
            'state': 'red_form_confirmed',
            'bureau_state': '04',
            'red_form_uuid': 'in-9',
            'red_form_number': 'rf-9',
            'red_fapiao_no': '24442000000071309400',
            'amount_untaxed': -invoice.amount_untaxed / 2,
            'amount_tax': -invoice.amount_tax / 2,
        })

        credit_note = self._reverse(invoice)

        self.assertRecordValues(credit_note, [{
            'l10n_cn_edi_fapiao_no': False,
            'l10n_cn_edi_state': 'not_sent',
            'l10n_cn_edi_red_form_required': True,
        }])
        self.assertIn('rf-9', ''.join(credit_note.message_ids.mapped('body')))

        credit_note.invoice_line_ids.price_unit /= 2
        self.assertFalse(credit_note.l10n_cn_edi_red_form_required)
        credit_note.action_post()

        self.assertRecordValues(credit_note, [{
            'state': 'posted',
            'l10n_cn_edi_fapiao_no': '24442000000071309400',
            'l10n_cn_edi_state': 'issued',
        }])

    def test_red_fapiao_of_a_customer_red_form_goes_to_one_credit_note(self):
        invoice = self._create_posted_invoice(fapiao_no='24442000000071309399')
        self.env['l10n_cn_edi.document'].create({
            'move_id': invoice.id,
            'state': 'red_form_confirmed',
            'bureau_state': '04',
            'red_form_uuid': 'in-9',
            'red_form_number': 'rf-9',
            'red_fapiao_no': '24442000000071309400',
        })

        first = self._reverse(invoice)
        second = self._reverse(invoice)

        self.assertEqual(first.l10n_cn_edi_fapiao_no, '24442000000071309400')
        self.assertRecordValues(second, [{'l10n_cn_edi_fapiao_no': False, 'l10n_cn_edi_red_form_required': True}])
        with self.assertRaisesRegex(UserError, 'customer raised Red Form rf-9'):
            second.action_l10n_cn_edi_request_red_form()
        self.assertNotIn('request_red_form', [method for method, _args in self.client.calls])

    def test_no_red_form_while_the_customer_s_is_pending(self):
        invoice = self._create_posted_invoice(fapiao_no='24442000000071309399')
        self.env['l10n_cn_edi.document'].create({
            'move_id': invoice.id,
            'state': 'red_form_pending',
            'bureau_state': '03',
            'red_form_uuid': 'in-9',
            'red_form_number': 'rf-9',
        })
        credit_note = self._reverse(invoice)

        with self.assertRaisesRegex(UserError, 'customer raised Red Form rf-9'):
            credit_note.action_l10n_cn_edi_request_red_form()

    def test_issued_credit_note_must_keep_the_red_amount(self):
        invoice = self._create_posted_invoice(fapiao_no='24442000000071309399')
        credit_note = self._reverse(invoice)
        self.responses['supports_direct_red'] = True
        self.responses['issue_direct_red'] = {'state': 'issued', 'fapiao_no': 'red-fapiao-789'}
        credit_note.action_l10n_cn_edi_request_red_form()
        # Changed behind the edit guard's back.
        self.env.flush_all()
        self.env.cr.execute("UPDATE account_move SET amount_total = 1 WHERE id = %s", [credit_note.id])
        credit_note.invalidate_recordset(['amount_total'])

        with self.assertRaisesRegex(UserError, 'no longer credits the amount of its red fapiao red-fapiao-789'):
            credit_note.action_post()

    def test_inbound_poll_window_uses_progress_watermark(self):
        company = self.company_data['company']
        self.responses['list_inbound_red_forms'] = []

        self.env['l10n_cn_edi.document']._l10n_cn_edi_pull_inbound_red_forms()
        first_window = [args for method, args in self.client.calls if method == 'list_inbound_red_forms'][-1]
        first_end = first_window[1]
        self.client.calls = []

        self.env['l10n_cn_edi.document']._l10n_cn_edi_pull_inbound_red_forms()
        second_window = [args for method, args in self.client.calls if method == 'list_inbound_red_forms'][-1]
        self.assertEqual(second_window[0], first_end)
        self.assertEqual(company.l10n_cn_edi_inbound_red_form_last_date, second_window[1])

    def test_inbound_red_form_is_not_imported_twice(self):
        bill = self._create_vendor_bill('31000000000000000001')
        self.responses['list_inbound_red_forms'] = [
            {'uuid': 'in-1', 'number': 'rf-1', 'bureau_state': '02', 'original_fapiao_no': '31000000000000000001'},
        ]
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()
        self.env['l10n_cn_edi.document']._cron_check_red_form_status()

        self.assertEqual(len(bill.l10n_cn_edi_document_ids), 1)
