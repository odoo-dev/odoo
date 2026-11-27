# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import datetime
from unittest.mock import patch

from odoo.tests import freeze_time, tagged

from .common import BAROBILL_NOT_FOUND, TestL10nKrEdiCommon

CASH_RECEIPT_SENT = 3000
CASH_RECEIPT_CANCELLED = 7000
CASH_RECEIPT_REJECTED = 4000


@freeze_time('2026-11-24 10:00:00')
@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nKrEdiCashReceipt(TestL10nKrEdiCommon):

    def _issue_responses(self, **sent_values):
        return {
            'GetCashBillStates': [
                ([self._cash_receipt_state(BAROBILL_NOT_FOUND)], None),
                ([self._cash_receipt_state(CASH_RECEIPT_SENT, **sent_values)], None),
            ],
            'RegistAndIssueCashBill': (1, None),
        }

    def test_cash_receipt_identity(self):
        invoice = self._create_kr_invoice(partner=self.partner_b)
        self.assertEqual(self.Document._get_cash_receipt_identity(invoice), ('5', '01012345678'))

        self.partner_b.phone = '02-1234-5678'
        self.assertEqual(self.Document._get_cash_receipt_identity(invoice), (False, False))
        self.assertIn(
            "The customer's phone number must be a South Korean mobile phone number to issue a cash receipt.",
            self.Document._get_cash_receipt_errors(invoice),
        )

        self.partner_b.vat = '123-81-02348'
        self.assertEqual(self.Document._get_cash_receipt_identity(invoice), ('4', '1238102348'))

        self.partner_b.vat = '123-81-02349'
        self.assertIn("The customer's business registration number is not valid.", self.Document._get_cash_receipt_errors(invoice))

    def test_self_issued_cash_receipt(self):
        self.partner_b.phone = False
        invoice = self._create_kr_invoice(partner=self.partner_b)
        self._register_payment(invoice, amount=invoice.amount_residual)

        self.assertFalse(self.Document._get_cash_receipt_errors(invoice))
        self.assertEqual(self.Document._prepare_cash_receipt_values(invoice)['IdentityNum'], '0100001234')
        self.assertIn('l10n_kr_edi_self_issued_cash_receipts', self.create_send_and_print(invoice).alerts)

    def test_prepare_cash_receipt_values(self):
        invoice = self._create_kr_invoice(partner=self.partner_b, lines=[{'name': 'Coffee'}, {'name': 'Cake'}])

        values = self.Document._prepare_cash_receipt_values(invoice)

        self.assertDictEqual(
            {key: values[key] for key in ('MgtKey', 'FranchiseCorpNum', 'FranchiseMemberID', 'IdentityNum', 'TradeDate', 'TradeType', 'TradeUsage', 'TradeMethod', 'ItemName', 'Amount', 'Tax', 'CancelType')},
            {
                'MgtKey': invoice.name.replace('/', '-'),
                'FranchiseCorpNum': '2208105670',
                'FranchiseMemberID': 'barobill_user',
                'IdentityNum': '01012345678',
                'TradeDate': '20261124',
                'TradeType': 'N',
                'TradeUsage': '1',
                'TradeMethod': '5',
                'ItemName': 'Coffee and 1 more',
                'Amount': '4000',
                'Tax': '400',
                'CancelType': '',
            },
        )

    def test_cash_receipt_date(self):
        invoice = self._create_kr_invoice(partner=self.partner_b, invoice_date='2026-11-23')
        old_invoice = self._create_kr_invoice(partner=self.partner_b, invoice_date='2026-11-22')
        self._register_payment(invoice, amount=invoice.amount_residual)
        self._register_payment(old_invoice, amount=old_invoice.amount_residual)

        self.assertFalse(self.Document._get_cash_receipt_errors(invoice))
        self.assertEqual(self.Document._get_cash_receipt_errors(old_invoice), ["A cash receipt can only be issued for invoices dated today or yesterday."])

    def test_cash_receipt_unpaid(self):
        invoice = self._create_kr_invoice(partner=self.partner_b)

        self.assertEqual(self.Document._get_cash_receipt_errors(invoice), ["A cash receipt can only be issued once the invoice is fully paid."])
        self.assertEqual(self.create_send_and_print(invoice).extra_edis, ['kr_edi_cash_receipt'])

    def test_cash_receipt_unreconciled_payment(self):
        self.company_data['default_journal_bank'].inbound_payment_method_line_ids.payment_account_id = False
        invoice = self._create_kr_invoice(partner=self.partner_b)

        with patch.object(self.env.registry['account.move'], '_get_invoice_in_payment_state', return_value='in_payment'):
            self._register_payment(invoice, amount=1000)
            self.assertEqual(invoice.payment_state, 'in_payment')
            self.assertEqual(self.Document._get_cash_receipt_errors(invoice), ["A cash receipt can only be issued once the invoice is fully paid."])

            self._register_payment(invoice, amount=1200)
            self.assertFalse(self.Document._get_cash_receipt_errors(invoice))

    def test_send_cash_receipt(self):
        invoice = self._create_kr_invoice(partner=self.partner_b)
        self._register_payment(invoice, amount=invoice.amount_residual)

        with self._patch_barobill(self._issue_responses(NTSConfirmNum='TX0000001', NTSConfirmDT='20261124190000')) as calls:
            self._send(invoice, ['kr_edi_cash_receipt'])

        self.assertEqual([operation for operation, _kwargs in calls], ['GetCashBillStates', 'RegistAndIssueCashBill', 'GetCashBillStates'])
        self.assertEqual(calls[1][1]['UserID'], 'barobill_user')
        self.assertRecordValues(invoice, [{'l10n_kr_edi_state': 'success', 'l10n_kr_edocument_number': 'TX0000001'}])
        self.assertRecordValues(invoice.l10n_kr_edi_document_ids, [{
            'document_type': 'cash_receipt',
            'state': 'success',
            'nts_send_date': datetime(2026, 11, 24, 10, 0),
        }])

    def test_resend_rejected_cash_receipt(self):
        invoice = self._create_kr_invoice(partner=self.partner_b)
        self._register_payment(invoice, amount=invoice.amount_residual)
        self._create_kr_document(invoice, 'error')
        responses = self._issue_responses()
        responses['GetCashBillStates'][0] = ([self._cash_receipt_state(CASH_RECEIPT_REJECTED)], None)
        responses['DeleteCashBill'] = (1, None)

        with self._patch_barobill(responses) as calls:
            self._send(invoice, ['kr_edi_cash_receipt'])

        self.assertEqual(calls[1], ('DeleteCashBill', {'UserID': 'barobill_user', 'MgtKey': invoice.name.replace('/', '-')}))
        self.assertEqual(invoice.l10n_kr_edi_state, 'success')

    def test_cancel_cash_receipt(self):
        invoice = self._create_kr_invoice(partner=self.partner_b)
        invoice.l10n_kr_edocument_number = 'TX0000001'
        self._create_kr_document(invoice, 'success')
        credit_note = self._reverse_invoice(invoice, l10n_kr_edi_cash_receipt_cancel_code='1', post=True)

        self.assertFalse(credit_note._l10n_kr_edi_get_amendment_error())
        with self._patch_barobill(self._issue_responses(NTSConfirmNum='TX0000002')) as calls:
            self._send(credit_note, ['kr_edi_cash_receipt'])

        values = calls[1][1]['Invoice']
        self.assertDictEqual(
            {key: values[key] for key in ('TradeType', 'CancelType', 'CancelNTSConfirmNum', 'CancelNTSConfirmDate', 'Amount', 'Tax')},
            {
                'TradeType': 'D',
                'CancelType': '1',
                'CancelNTSConfirmNum': 'TX0000001',
                'CancelNTSConfirmDate': '20261124',
                'Amount': '2000',
                'Tax': '200',
            },
        )
        self.assertEqual(credit_note.l10n_kr_edi_state, 'success')

    def test_cancel_cash_receipt_without_reason(self):
        invoice = self._create_kr_invoice(partner=self.partner_b)
        credit_note = self._reverse_invoice(invoice, post=True)
        invoice.l10n_kr_edocument_number = 'TX0000001'
        self._create_kr_document(invoice, 'success')

        self.assertEqual(
            credit_note._l10n_kr_edi_get_amendment_error(),
            "This credit note has no cancellation reason, so it cannot cancel the original cash receipt. "
            "Cancel it and reverse the original invoice again with a cancellation reason.",
        )

    def test_replace_cash_receipt(self):
        invoice = self._create_kr_invoice(partner=self.partner_b)
        invoice.l10n_kr_edocument_number = 'TX0000001'
        self._create_kr_document(invoice, 'success')

        new_invoice = self._reverse_invoice(invoice, is_modify=True, l10n_kr_edi_cash_receipt_cancel_code='2')
        new_invoice.action_post()

        self.assertRecordValues(new_invoice.l10n_kr_edi_reversal_move_id, [{'l10n_kr_edi_cash_receipt_cancel_code': '2', 'state': 'posted'}])
        self.assertFalse(new_invoice._l10n_kr_edi_get_amendment_error())
        self.assertEqual(self.Document._prepare_cash_receipt_values(new_invoice)['TradeType'], 'N')

    def test_cash_receipt_debit_note(self):
        invoice = self._create_kr_invoice(partner=self.partner_b)
        invoice.l10n_kr_edocument_number = 'TX0000001'
        self._create_kr_document(invoice, 'success')

        debit_note = self._create_debit_note(invoice, post=True)

        self.assertEqual(
            debit_note._l10n_kr_edi_get_amendment_error(),
            "A debit note cannot be issued as a cash receipt. Create a new invoice for the additional amount instead.",
        )
