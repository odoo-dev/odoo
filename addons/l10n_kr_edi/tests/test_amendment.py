# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import tagged

from .common import BAROBILL_NOT_FOUND, TestL10nKrEdiCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nKrEdiAmendment(TestL10nKrEdiCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.invoice = cls._create_kr_invoice()
        cls.invoice.write({
            'l10n_kr_issuance_type': 'tax_invoice',
            'l10n_kr_edocument_number': '20261124-41000000-00000001',
        })
        cls._create_kr_document(cls.invoice, 'success')

    def _issue_responses(self, count=1):
        return {
            'GetTaxInvoiceStatesEX': [
                state
                for _index in range(count)
                for state in (([self._tax_invoice_state(BAROBILL_NOT_FOUND)], None), ([self._tax_invoice_state()], None))
            ],
            'RegistAndIssueTaxInvoice': (1, None),
        }

    def test_send_credit_note(self):
        credit_note = self._reverse_invoice(self.invoice, l10n_kr_edi_amendment_code='3')
        credit_note.invoice_line_ids.quantity = 1
        credit_note.action_post()

        with self._patch_barobill(self._issue_responses()) as calls:
            self._send(credit_note, ['kr_edi_tax_invoice'])

        values = calls[1][1]['Invoice']
        self.assertEqual(
            (values['ModifyCode'], values['Remark1'], values['AmountTotal'], values['TaxTotal'], values['TotalAmount']),
            ('3', '20261124-41000000-00000001', '-1000', '-100', '-1100'),
        )
        self.assertEqual(credit_note.l10n_kr_edi_state, 'issued')

    def test_reversal_reason(self):
        wizard = self.env['account.move.reversal'].with_context(active_model='account.move', active_ids=self.invoice.ids).create({
            'journal_id': self.invoice.journal_id.id,
        })
        self.assertRecordValues(wizard, [{'l10n_kr_edi_is_amendment': True, 'l10n_kr_edi_is_replacement': False}])

        wizard.l10n_kr_edi_amendment_code = '1'
        self.assertTrue(wizard.l10n_kr_edi_is_replacement)

    def test_reversal_mixed_selection(self):
        moves = self.invoice + self._create_kr_invoice()
        wizard = self.env['account.move.reversal'].with_context(active_model='account.move', active_ids=moves.ids).create({
            'journal_id': self.invoice.journal_id.id,
        })
        self.assertRecordValues(wizard, [{'l10n_kr_edi_is_amendment': False, 'l10n_kr_edi_is_mixed': True}])

    def test_send_replacement_invoice(self):
        new_invoice = self._reverse_invoice(self.invoice, is_modify=True, l10n_kr_edi_amendment_code='1')
        credit_note = new_invoice.l10n_kr_edi_reversal_move_id
        new_invoice.action_post()

        self.assertRecordValues(new_invoice, [{
            'l10n_kr_edi_amendment_code': '1',
            'l10n_kr_edi_origin_move_id': self.invoice.id,
        }])
        self.assertRecordValues(credit_note, [{
            'l10n_kr_edi_amendment_code': '1',
            'reversed_entry_id': self.invoice.id,
            'state': 'posted',
        }])

        with self._patch_barobill(self._issue_responses(count=2)) as calls:
            self._send(new_invoice, ['kr_edi_tax_invoice'])

        issued_values = [kwargs['Invoice'] for operation, kwargs in calls if operation == 'RegistAndIssueTaxInvoice']
        self.assertEqual(
            [(values['InvoicerParty']['MgtNum'], values['ModifyCode'], values['TotalAmount']) for values in issued_values],
            [
                (credit_note.name.replace('/', '-'), '1', '-2200'),
                (new_invoice.name.replace('/', '-'), '1', '2200'),
            ],
        )
        self.assertEqual((credit_note + new_invoice).mapped('l10n_kr_edi_state'), ['issued', 'issued'])

    def test_replacement_credit_note_posted_at_future_date(self):
        new_invoice = self._reverse_invoice(self.invoice, is_modify=True, l10n_kr_edi_amendment_code='1', date=fields.Date.add(fields.Date.today(), days=10))

        self.assertEqual(new_invoice.l10n_kr_edi_reversal_move_id.state, 'posted')

    def test_replacement_credit_note_must_be_posted(self):
        new_invoice = self._reverse_invoice(self.invoice, is_modify=True, l10n_kr_edi_amendment_code='1')
        new_invoice.l10n_kr_edi_reversal_move_id.button_draft()
        new_invoice.action_post()

        self.assertRegex(new_invoice._l10n_kr_edi_get_amendment_error(), "must be confirmed first")

    def test_replacement_credit_note_cannot_be_sent_alone(self):
        new_invoice = self._reverse_invoice(self.invoice, is_modify=True, l10n_kr_edi_amendment_code='1')
        credit_note = new_invoice.l10n_kr_edi_reversal_move_id

        wizard = self.create_send_and_print(credit_note, extra_edis=['kr_edi_tax_invoice'])

        self.assertEqual(wizard.alerts['l10n_kr_edi_unsendable_moves']['level'], 'danger')
        with self._patch_barobill({}) as calls, self.assertRaisesRegex(UserError, "Send the new invoice instead."):
            wizard.action_send_and_print()
        self.assertFalse(calls)

    def test_full_cancellation_required(self):
        credit_note = self._reverse_invoice(self.invoice, l10n_kr_edi_amendment_code='4')
        credit_note.invoice_line_ids.quantity = 1
        credit_note.action_post()

        self.assertEqual(self.Document._get_tax_invoice_errors(credit_note), ["This amendment reason requires the credit note to cancel the full original invoice."])

    def test_debit_note(self):
        debit_note = self._create_debit_note(self.invoice, post=True)

        self.assertRecordValues(debit_note, [{
            'l10n_kr_edi_amendment_code': '2',
            'l10n_kr_edi_origin_move_id': self.invoice.id,
        }])
        self.assertFalse(self.Document._get_tax_invoice_errors(debit_note))

        debit_note.l10n_kr_edi_amendment_code = '3'
        self.assertEqual(self.Document._get_tax_invoice_errors(debit_note), ["A debit note can only be issued for a change in supply value."])

    def test_reverse_unissued_invoice(self):
        invoice = self._create_kr_invoice()
        wizard = self.env['account.move.reversal'].with_context(active_model='account.move', active_ids=invoice.ids).create({
            'journal_id': invoice.journal_id.id,
        })
        self.assertRecordValues(wizard, [{'l10n_kr_edi_document_type': 'tax_invoice', 'l10n_kr_edi_is_amendment': False}])

        self.assertTrue(self._reverse_invoice(self._create_kr_invoice(), is_modify=True))
        credit_note = self._reverse_invoice(invoice, post=True)
        self.assertEqual(self.create_send_and_print(credit_note).extra_edis, ['kr_edi_tax_invoice'])
        self.assertEqual(credit_note._l10n_kr_edi_get_amendment_error(), f"The original invoice {invoice.name} must be issued through Barobill first.")

        self._create_kr_document(invoice, 'success')
        self.assertEqual(
            credit_note._l10n_kr_edi_get_amendment_error(),
            "This credit note has no amendment reason, so it cannot be issued as an amended e-Tax Invoice. "
            "Cancel it and reverse the original invoice again with an amendment reason.",
        )

    def test_amendment_errors(self):
        unlinked_credit_note = self._create_kr_invoice(move_type='out_refund')
        unissued_invoice = self._create_kr_invoice()
        credit_note_of_unissued = self._reverse_invoice(unissued_invoice, l10n_kr_edi_amendment_code='3', post=True)
        other_type_credit_note = self._reverse_invoice(self.invoice, l10n_kr_edi_amendment_code='3')
        other_type_credit_note.l10n_kr_issuance_type = 'tax_exempt_invoice'

        self.assertEqual(unlinked_credit_note._l10n_kr_edi_get_amendment_error(), "A credit note can only be issued through Barobill when it is linked to its original invoice.")
        self.assertEqual(credit_note_of_unissued._l10n_kr_edi_get_amendment_error(), f"The original invoice {unissued_invoice.name} must be issued through Barobill first.")
        self.assertEqual(other_type_credit_note._l10n_kr_edi_get_amendment_error(), f"The proof of issuance must be the same as on the original invoice {self.invoice.name}.")

    def test_send_wizard_alerts(self):
        unlinked_credit_note = self._create_kr_invoice(move_type='out_refund')
        other_invoice = self._create_kr_invoice()

        wizard = self.create_send_and_print(unlinked_credit_note)
        self.assertEqual(wizard.extra_edis, ['kr_edi_tax_invoice'])
        self.assertEqual(wizard.alerts['l10n_kr_edi_unsendable_moves']['level'], 'danger')

        wizard.extra_edi_checkboxes = {'kr_edi_tax_invoice': {'checked': False}}
        self.assertNotIn('l10n_kr_edi_unsendable_moves', wizard.alerts or {})

        batch_wizard = self.create_send_and_print(unlinked_credit_note + other_invoice)
        self.assertEqual(batch_wizard.alerts['l10n_kr_edi_unsendable_moves']['level'], 'warning')
