# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import datetime

from odoo import Command
from odoo.exceptions import UserError
from odoo.tests import freeze_time, tagged

from .common import BAROBILL_CANCELLED, BAROBILL_NOT_FOUND, TestL10nKrEdiCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nKrEdiTaxInvoice(TestL10nKrEdiCommon):

    def test_prepare_tax_invoice_values(self):
        invoice = self._create_kr_invoice(lines=[
            {'name': 'Goods', 'l10n_kr_edi_supply_date': '2026-11-03'},
            {'name': 'Service', 'quantity': 3, 'price_unit': 333},
        ])

        values = self.Document._prepare_tax_invoice_values(invoice)

        self.assertDictEqual(
            {key: values[key] for key in ('IssueDirection', 'TaxInvoiceType', 'TaxType', 'PurposeType', 'ModifyCode', 'WriteDate', 'AmountTotal', 'TaxTotal', 'TotalAmount', 'Remark1')},
            {
                'IssueDirection': 1,
                'TaxInvoiceType': 1,
                'TaxType': 1,
                'PurposeType': 2,
                'ModifyCode': '',
                'WriteDate': '20261124',
                'AmountTotal': '2999',
                'TaxTotal': '300',
                'TotalAmount': '3299',
                'Remark1': '',
            },
        )
        self.assertDictEqual(
            {key: values['InvoicerParty'][key] for key in ('MgtNum', 'CorpNum', 'CEOName', 'BizType', 'ContactID', 'Email')},
            {
                'MgtNum': invoice.name.replace('/', '-'),
                'CorpNum': '2208105670',
                'CEOName': 'Kim Daepyo',
                'BizType': '',
                'ContactID': 'barobill_user',
                'Email': 'company@example.kr',
            },
        )
        self.assertDictEqual(
            {key: values['InvoiceeParty'][key] for key in ('CorpNum', 'CorpName', 'CEOName', 'BizType')},
            {'CorpNum': '1238102348', 'CorpName': '(주)Partner A', 'CEOName': 'Lee Daepyo', 'BizType': 'Wholesale'},
        )
        self.assertEqual(
            [
                {key: line[key] for key in ('PurchaseExpiry', 'Name', 'ChargeableUnit', 'UnitPrice', 'Amount', 'Tax')}
                for line in values['TaxInvoiceTradeLineItems']['TaxInvoiceTradeLineItem']
            ],
            [
                {'PurchaseExpiry': '20261103', 'Name': 'Goods', 'ChargeableUnit': '2.00', 'UnitPrice': '1000.00', 'Amount': '2000', 'Tax': '200'},
                {'PurchaseExpiry': '', 'Name': 'Service', 'ChargeableUnit': '3.00', 'UnitPrice': '333.00', 'Amount': '999', 'Tax': '100'},
            ],
        )

    def test_prepare_tax_exempt_invoice_values(self):
        invoice = self._create_kr_invoice(taxes=self.tax_exempt, l10n_kr_issuance_type='tax_exempt_invoice')

        values = self.Document._prepare_tax_invoice_values(invoice)

        self.assertEqual((values['TaxInvoiceType'], values['TaxType'], values['TaxTotal']), (2, 3, '0'))
        self.assertFalse(self.Document._get_tax_invoice_errors(invoice))

    def test_prepare_foreign_currency_tax_invoice_values(self):
        currency = self.setup_other_currency('USD', rates=[('2026-01-01', 0.001)])
        invoice = self._create_kr_invoice(currency_id=currency.id)

        values = self.Document._prepare_tax_invoice_values(invoice)

        self.assertEqual((values['AmountTotal'], values['TaxTotal'], values['TotalAmount']), ('2000000', '200000', '2200000'))
        line = values['TaxInvoiceTradeLineItems']['TaxInvoiceTradeLineItem'][0]
        self.assertEqual((line['UnitPrice'], line['Amount'], line['Tax']), ('1000000.00', '2000000', '200000'))
        self.assertFalse(self.Document._get_tax_invoice_errors(invoice))

    def test_tax_invoice_errors(self):
        self.partner_a.write({'l10n_kr_representative_name': False, 'street': False})
        invoice = self._create_kr_invoice(lines=[
            {'tax_ids': [Command.clear()], 'l10n_kr_edi_supply_date': '2026-10-31'},
        ])

        self.assertEqual(self.Document._get_tax_invoice_errors(invoice), [
            "The supply date of every line must be in the same month as the invoice date.",
            "The customer must have a representative name.",
            "The customer must have an address.",
            "Every line must have a tax.",
        ])

    def test_tax_type_errors(self):
        mixed_invoice = self._create_kr_invoice(lines=[{'tax_ids': [Command.set(self.tax_10.ids)]}, {'tax_ids': [Command.set(self.tax_0.ids)]}])
        exempt_invoice = self._create_kr_invoice(taxes=self.tax_exempt)
        exempt_type_invoice = self._create_kr_invoice(l10n_kr_issuance_type='tax_exempt_invoice')

        self.assertEqual(self.Document._get_tax_invoice_errors(mixed_invoice), ["All lines must use taxes of the same type: either 10%, 0% or exempt."])
        self.assertEqual(self.Document._get_tax_invoice_errors(exempt_invoice), ["Exempt taxes must be issued as a tax-exempt invoice."])
        self.assertEqual(self.Document._get_tax_invoice_errors(exempt_type_invoice), ["A tax-exempt invoice can only contain exempt taxes."])

    def test_send_tax_invoice(self):
        invoice = self._create_kr_invoice()
        responses = {
            'GetTaxInvoiceStatesEX': [
                ([self._tax_invoice_state(BAROBILL_NOT_FOUND)], None),
                ([self._tax_invoice_state()], None),
            ],
            'RegistAndIssueTaxInvoice': (1, None),
        }

        with self._patch_barobill(responses) as calls:
            self._send(invoice, ['kr_edi_tax_invoice'])

        self.assertEqual([operation for operation, _kwargs in calls], ['GetTaxInvoiceStatesEX', 'RegistAndIssueTaxInvoice', 'GetTaxInvoiceStatesEX'])
        self.assertRecordValues(invoice, [{'l10n_kr_edi_state': 'issued', 'l10n_kr_issuance_type': 'tax_invoice', 'show_reset_to_draft_button': False}])

    def test_send_tax_invoice_with_errors(self):
        self.partner_a.street = False
        invoice = self._create_kr_invoice()

        with self._patch_barobill({}) as calls, self.assertRaisesRegex(UserError, "The customer must have an address."):
            self._send(invoice, ['kr_edi_tax_invoice'])

        self.assertFalse(calls)
        self.assertFalse(invoice.l10n_kr_edi_state)

    def test_send_tax_invoice_state_check_failed(self):
        invoice = self._create_kr_invoice()
        responses = {'GetTaxInvoiceStatesEX': ([self._tax_invoice_state(-10001)], "Barobill error -10001")}

        with self._patch_barobill(responses) as calls, self.assertRaisesRegex(UserError, "Barobill error -10001"):
            self._send(invoice, ['kr_edi_tax_invoice'])

        self.assertEqual([operation for operation, _kwargs in calls], ['GetTaxInvoiceStatesEX'])
        self.assertFalse(invoice.l10n_kr_edi_document_ids)

    def test_send_tax_invoice_already_issued(self):
        invoice = self._create_kr_invoice()
        responses = {'GetTaxInvoiceStatesEX': ([self._tax_invoice_state()], None)}

        with self._patch_barobill(responses) as calls:
            errors = self.Document._issue_tax_invoice(invoice)

        self.assertEqual(errors, ["This invoice was already issued on Barobill. Its e-Tax Invoice status has been updated."])
        self.assertEqual([operation for operation, _kwargs in calls], ['GetTaxInvoiceStatesEX'])
        self.assertRecordValues(invoice.l10n_kr_edi_document_ids, [{'state': 'issued', 'mgt_key': invoice.name.replace('/', '-')}])

    def test_resend_cancelled_tax_invoice(self):
        invoice = self._create_kr_invoice()
        cancelled_document = self._create_kr_document(invoice, 'canceled')
        responses = {
            'GetTaxInvoiceStatesEX': [
                ([self._tax_invoice_state(BAROBILL_CANCELLED)], None),
                ([self._tax_invoice_state()], None),
            ],
            'DeleteTaxInvoice': (1, None),
            'RegistAndIssueTaxInvoice': (1, None),
        }

        with self._patch_barobill(responses) as calls:
            self._send(invoice, ['kr_edi_tax_invoice'])

        self.assertEqual(
            [operation for operation, _kwargs in calls],
            ['GetTaxInvoiceStatesEX', 'DeleteTaxInvoice', 'RegistAndIssueTaxInvoice', 'GetTaxInvoiceStatesEX'],
        )
        self.assertEqual(invoice.l10n_kr_edi_state, 'issued')
        self.assertRecordValues(invoice.l10n_kr_edi_document_ids.sorted('id'), [
            {'id': cancelled_document.id, 'state': 'canceled'},
            {'id': (invoice.l10n_kr_edi_document_ids - cancelled_document).id, 'state': 'issued'},
        ])

    def test_late_issuance_warning(self):
        invoice = self._create_kr_invoice(invoice_date='2026-10-31')

        with freeze_time('2026-11-10 14:00:00'):
            self.assertNotIn('l10n_kr_edi_late_issuance', self.create_send_and_print(invoice).alerts or {})
        with freeze_time('2026-11-10 15:00:00'):
            self.assertIn('l10n_kr_edi_late_issuance', self.create_send_and_print(invoice).alerts)

    def test_update_tax_invoice_state(self):
        invoice = self._create_kr_invoice()
        document = self._create_kr_document(invoice)
        responses = {'GetTaxInvoiceStatesEX': ([self._tax_invoice_state(nts_send_state=4, NTSSendKey='20261124-41000000-00000001', NTSResultDT='20261124093000')], None)}

        with self._patch_barobill(responses):
            invoice.action_l10n_kr_edi_refresh_state()

        self.assertRecordValues(invoice, [{'l10n_kr_edi_state': 'success', 'l10n_kr_edocument_number': '20261124-41000000-00000001'}])
        self.assertRecordValues(document, [{'state': 'success', 'nts_send_date': datetime(2026, 11, 24, 0, 30)}])

    def test_update_tax_invoice_state_sending(self):
        invoice = self._create_kr_invoice()
        document = self._create_kr_document(invoice)
        responses = {'GetTaxInvoiceStatesEX': [
            ([self._tax_invoice_state(nts_send_state=3, NTSSendDT='20261124093000')], None),
            ([self._tax_invoice_state(nts_send_state=4, NTSSendKey='20261124-41000000-00000001', NTSSendDT='20261124093000')], None),
        ]}

        with self._patch_barobill(responses), self.registry_test_mode():
            invoice.action_l10n_kr_edi_refresh_state()
            self.assertRecordValues(document, [{'state': 'sent', 'nts_send_date': datetime(2026, 11, 24, 0, 30)}])
            self.env.ref('l10n_kr_edi.ir_cron_l10n_kr_edi_refresh_state').method_direct_trigger()

        self.assertRecordValues(invoice, [{'l10n_kr_edi_state': 'success', 'l10n_kr_edocument_number': '20261124-41000000-00000001'}])

    def test_cron_refresh_state_in_bulk(self):
        invoices = self._create_kr_invoice() + self._create_kr_invoice()
        cash_receipt = self._create_kr_invoice(partner=self.partner_b)
        for move in invoices + cash_receipt:
            self._create_kr_document(move)
        responses = {
            'GetTaxInvoiceStatesEX': ([self._tax_invoice_state(nts_send_state=4, NTSSendKey='20261124-41000000-00000001'), self._tax_invoice_state(BAROBILL_NOT_FOUND)], None),
            'GetCashBillStates': ([self._cash_receipt_state(3000, NTSConfirmNum='TX0000001')], None),
        }

        with self._patch_barobill(responses) as calls, self.registry_test_mode():
            self.env.ref('l10n_kr_edi.ir_cron_l10n_kr_edi_refresh_state').method_direct_trigger()

        self.assertEqual(
            sorted((operation, kwargs['MgtKeyList']['string']) for operation, kwargs in calls),
            [('GetCashBillStates', [cash_receipt.name.replace('/', '-')]), ('GetTaxInvoiceStatesEX', [invoices[1].name.replace('/', '-'), invoices[0].name.replace('/', '-')])],
        )
        self.assertEqual((invoices + cash_receipt).mapped('l10n_kr_edi_state'), ['issued', 'success', 'success'])

    def test_update_tax_invoice_state_rejected(self):
        invoice = self._create_kr_invoice()
        document = self._create_kr_document(invoice)
        responses = {'GetTaxInvoiceStatesEX': ([self._tax_invoice_state(nts_send_state=5, NTSSendResult="ERR002")], None)}

        with self._patch_barobill(responses), self.registry_test_mode():
            self.env.ref('l10n_kr_edi.ir_cron_l10n_kr_edi_refresh_state').method_direct_trigger()

        self.assertEqual(invoice.l10n_kr_edi_state, 'error')
        self.assertTrue(invoice.message_ids.filtered(lambda message: "The NTS rejected this document: ERR002: The customer" in message.body))

    def test_cancel_tax_invoice(self):
        invoice = self._create_kr_invoice()
        self._create_kr_document(invoice)
        responses = {
            'GetTaxInvoiceStatesEX': ([self._tax_invoice_state()], None),
            'ProcTaxInvoice': (1, None),
        }

        with self._patch_barobill(responses) as calls:
            invoice.action_l10n_kr_edi_cancel()

        self.assertEqual(calls[1], ('ProcTaxInvoice', {'MgtKey': invoice.name.replace('/', '-'), 'ProcType': 'ISSUE_CANCEL', 'Memo': ''}))
        self.assertRecordValues(invoice, [{'l10n_kr_edi_state': 'canceled', 'show_reset_to_draft_button': True}])

    def test_cancel_tax_invoice_already_sent(self):
        invoice = self._create_kr_invoice()
        self._create_kr_document(invoice)
        responses = {'GetTaxInvoiceStatesEX': ([self._tax_invoice_state(nts_send_state=4, NTSSendKey='20261124-41000000-00000001')], None)}

        with self._patch_barobill(responses) as calls:
            action = invoice.action_l10n_kr_edi_cancel()

        self.assertEqual(len(calls), 1)
        self.assertEqual(action['params']['type'], 'warning')
        self.assertEqual(invoice.l10n_kr_edi_state, 'success')

    def test_resend_rejected_tax_invoice(self):
        invoice = self._create_kr_invoice()
        self._create_kr_document(invoice, 'error')
        self.assertTrue(invoice.show_reset_to_draft_button)
        invoice.button_draft()
        invoice.action_post()
        responses = {
            'GetTaxInvoiceStatesEX': [
                ([self._tax_invoice_state(nts_send_state=5, NTSSendResult='ERR002')], None),
                ([self._tax_invoice_state()], None),
            ],
            'DeleteTaxInvoice': (1, None),
            'RegistAndIssueTaxInvoice': (1, None),
        }

        with self._patch_barobill(responses) as calls:
            self._send(invoice, ['kr_edi_tax_invoice'])

        self.assertEqual(
            [operation for operation, _kwargs in calls],
            ['GetTaxInvoiceStatesEX', 'DeleteTaxInvoice', 'RegistAndIssueTaxInvoice', 'GetTaxInvoiceStatesEX'],
        )
        self.assertEqual(invoice.l10n_kr_edi_state, 'issued')

    def test_send_wizard_checkbox(self):
        tax_invoice = self._create_kr_invoice()
        tax_exempt_invoice = self._create_kr_invoice(taxes=self.tax_exempt, l10n_kr_issuance_type='tax_exempt_invoice')
        cash_receipt = self._create_kr_invoice(partner=self.partner_b)
        issued_invoice = self._create_kr_invoice()
        self._create_kr_document(issued_invoice)

        self.assertEqual(self.create_send_and_print(tax_invoice).extra_edis, ['kr_edi_tax_invoice'])
        self.assertEqual(self.create_send_and_print(tax_exempt_invoice).extra_edis, ['kr_edi_tax_exempt_invoice'])
        self.assertEqual(self.create_send_and_print(cash_receipt).extra_edis, ['kr_edi_cash_receipt'])
        self.assertFalse(self.create_send_and_print(issued_invoice).extra_edis)
