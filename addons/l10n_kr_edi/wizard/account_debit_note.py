# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models


class AccountDebitNote(models.TransientModel):
    _inherit = 'account.debit.note'

    def _prepare_default_values(self, move):
        # EXTENDS 'account_debit_note'
        values = super()._prepare_default_values(move)
        if move._l10n_kr_edi_get_reversal_document_type() == 'tax_invoice':
            values['l10n_kr_edi_amendment_code'] = '2'
        return values
