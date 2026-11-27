# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, models

from .l10n_kr_edi_document import L10N_KR_EDI_CASH_RECEIPT_SELF_ISSUANCE_NUMBER

L10N_KR_EDI_EXTRA_EDIS = {'kr_edi_tax_invoice', 'kr_edi_tax_exempt_invoice', 'kr_edi_cash_receipt'}
L10N_KR_EDI_TAX_INVOICE_EXTRA_EDIS = {'kr_edi_tax_invoice', 'kr_edi_tax_exempt_invoice'}


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    @api.model
    def _is_kr_edi_tax_invoice_applicable(self, move):
        return move._l10n_kr_edi_get_sendable_issuance_type() == 'tax_invoice'

    @api.model
    def _is_kr_edi_tax_exempt_invoice_applicable(self, move):
        return move._l10n_kr_edi_get_sendable_issuance_type() == 'tax_exempt_invoice'

    @api.model
    def _is_kr_edi_cash_receipt_applicable(self, move):
        return move._l10n_kr_edi_get_sendable_issuance_type() == 'cash_receipt'

    def _get_all_extra_edis(self):
        # EXTENDS 'account'
        res = super()._get_all_extra_edis()
        res.update({
            'kr_edi_tax_invoice': {
                'label': self.env._("Issue tax invoice"),
                'is_applicable': self._is_kr_edi_tax_invoice_applicable,
            },
            'kr_edi_tax_exempt_invoice': {
                'label': self.env._("Issue tax-exempt invoice"),
                'is_applicable': self._is_kr_edi_tax_exempt_invoice_applicable,
            },
            'kr_edi_cash_receipt': {
                'label': self.env._("Issue cash receipt"),
                'is_applicable': self._is_kr_edi_cash_receipt_applicable,
            },
        })
        return res

    def _get_alerts(self, moves, moves_data):
        # EXTENDS 'account'
        alerts = super()._get_alerts(moves, moves_data)
        unsendable_moves = moves.filtered(lambda move: (
            L10N_KR_EDI_EXTRA_EDIS.intersection(moves_data[move]['extra_edis'])
            and move._l10n_kr_edi_get_amendment_error()
        ))
        if len(moves) == 1 and unsendable_moves:
            alerts['l10n_kr_edi_unsendable_moves'] = {
                'level': 'danger',
                'message': unsendable_moves._l10n_kr_edi_get_amendment_error(),
            }
        elif unsendable_moves:
            alerts['l10n_kr_edi_unsendable_moves'] = {
                'level': 'warning',
                'message': self.env._("Some documents cannot be issued through Barobill."),
                'action_text': self.env._("View Documents"),
                'action': unsendable_moves._get_records_action(name=self.env._("Check Documents")),
            }
        self_issued_moves = moves.filtered(lambda move: (
            'kr_edi_cash_receipt' in moves_data[move]['extra_edis']
            and self.env['l10n_kr_edi.document']._get_cash_receipt_identity(move)[1] == L10N_KR_EDI_CASH_RECEIPT_SELF_ISSUANCE_NUMBER
        ))
        if self_issued_moves:
            alerts['l10n_kr_edi_self_issued_cash_receipts'] = {
                'level': 'warning',
                'message': self.env._(
                    "The customer has neither a business registration number nor a phone number, "
                    "so the cash receipt will be self-issued with the number 010-000-1234."
                ),
            }
            if len(moves) > 1:
                alerts['l10n_kr_edi_self_issued_cash_receipts'].update({
                    'action_text': self.env._("View Documents"),
                    'action': self_issued_moves._get_records_action(name=self.env._("Check Documents")),
                })
        late_moves = moves.filtered(lambda move: (
            L10N_KR_EDI_TAX_INVOICE_EXTRA_EDIS.intersection(moves_data[move]['extra_edis'])
            and move._l10n_kr_edi_is_late_issuance()
        ))
        if late_moves:
            alerts['l10n_kr_edi_late_issuance'] = {
                'level': 'warning',
                'message': self.env._(
                    "The 10th of the month after the invoice date has passed. "
                    "A late issuance incurs additional tax for both the supplier and the customer, so check it before issuing."
                ),
            }
            if len(moves) > 1:
                alerts['l10n_kr_edi_late_issuance'].update({
                    'action_text': self.env._("View Documents"),
                    'action': late_moves._get_records_action(name=self.env._("Check Documents")),
                })
        return alerts

    @api.model
    def _call_web_service_before_invoice_pdf_render(self, invoices_data):
        # EXTENDS 'account'
        super()._call_web_service_before_invoice_pdf_render(invoices_data)
        for invoice, invoice_data in invoices_data.items():
            extra_edis = invoice_data['extra_edis']
            if not L10N_KR_EDI_EXTRA_EDIS.intersection(extra_edis):
                continue
            if error := invoice._l10n_kr_edi_get_amendment_error():
                errors = [error]
            elif 'kr_edi_tax_invoice' in extra_edis or 'kr_edi_tax_exempt_invoice' in extra_edis:
                errors = self.env['l10n_kr_edi.document']._issue_tax_invoice(invoice)
            else:
                errors = self.env['l10n_kr_edi.document']._issue_cash_receipt(invoice)
            if errors:
                invoice_data['error'] = {
                    'error_title': self.env._("Error when sending the document to Barobill."),
                    'errors': errors,
                }
            if self._can_commit():
                self.env.cr.commit()
