# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models

from odoo.addons.l10n_kr_edi.models.account_move import (
    L10N_KR_EDI_AMENDMENT_CODES,
    L10N_KR_EDI_CASH_RECEIPT_CANCEL_CODES,
    L10N_KR_EDI_CASH_RECEIPT_REPLACEMENT_CANCEL_CODE,
    L10N_KR_EDI_REPLACEMENT_AMENDMENT_CODES,
)


class AccountMoveReversal(models.TransientModel):
    _inherit = 'account.move.reversal'

    l10n_kr_edi_document_type = fields.Selection(
        selection=[('tax_invoice', "Tax Invoice"), ('cash_receipt', "Cash Receipt")],
        compute='_compute_l10n_kr_edi_document_type',
    )
    l10n_kr_edi_amendment_code = fields.Selection(selection=L10N_KR_EDI_AMENDMENT_CODES, string="Amendment Reason")
    l10n_kr_edi_cash_receipt_cancel_code = fields.Selection(selection=L10N_KR_EDI_CASH_RECEIPT_CANCEL_CODES, string="Cancellation Reason")
    l10n_kr_edi_is_amendment = fields.Boolean(compute='_compute_l10n_kr_edi_is_amendment')
    l10n_kr_edi_is_mixed = fields.Boolean(compute='_compute_l10n_kr_edi_is_amendment')
    l10n_kr_edi_is_replacement = fields.Boolean(compute='_compute_l10n_kr_edi_is_replacement')

    @api.depends('move_ids')
    def _compute_l10n_kr_edi_document_type(self):
        for wizard in self:
            document_types = {move._l10n_kr_edi_get_reversal_document_type() for move in wizard.move_ids._origin}
            wizard.l10n_kr_edi_document_type = document_types.pop() if len(document_types) == 1 else False

    @api.depends('move_ids', 'l10n_kr_edi_document_type')
    def _compute_l10n_kr_edi_is_amendment(self):
        for wizard in self:
            moves = wizard.move_ids._origin
            issued_moves = moves.filtered(lambda move: move.l10n_kr_edi_state in ('issued', 'sent', 'success'))
            wizard.l10n_kr_edi_is_amendment = bool(wizard.l10n_kr_edi_document_type) and bool(issued_moves) and issued_moves == moves
            wizard.l10n_kr_edi_is_mixed = bool(issued_moves) and not wizard.l10n_kr_edi_is_amendment

    @api.depends('l10n_kr_edi_is_amendment', 'l10n_kr_edi_document_type', 'l10n_kr_edi_amendment_code', 'l10n_kr_edi_cash_receipt_cancel_code')
    def _compute_l10n_kr_edi_is_replacement(self):
        for wizard in self:
            wizard.l10n_kr_edi_is_replacement = wizard.l10n_kr_edi_is_amendment and (
                (wizard.l10n_kr_edi_document_type == 'tax_invoice' and wizard.l10n_kr_edi_amendment_code in L10N_KR_EDI_REPLACEMENT_AMENDMENT_CODES)
                or (wizard.l10n_kr_edi_document_type == 'cash_receipt' and wizard.l10n_kr_edi_cash_receipt_cancel_code == L10N_KR_EDI_CASH_RECEIPT_REPLACEMENT_CANCEL_CODE)
            )

    def _prepare_default_reversal(self, move):
        # EXTENDS 'account'
        values = super()._prepare_default_reversal(move)
        if self.l10n_kr_edi_document_type == 'tax_invoice':
            values['l10n_kr_edi_amendment_code'] = self.l10n_kr_edi_amendment_code
        elif self.l10n_kr_edi_document_type == 'cash_receipt':
            values['l10n_kr_edi_cash_receipt_cancel_code'] = self.l10n_kr_edi_cash_receipt_cancel_code
        if self.l10n_kr_edi_is_replacement:
            values['auto_post'] = 'no'
        return values

    def _modify_default_reverse_values(self, origin_move):
        # EXTENDS 'account'
        values = super()._modify_default_reverse_values(origin_move)
        if self.l10n_kr_edi_document_type:
            reversal_move = self.env['account.move'].search([('reversed_entry_id', '=', origin_move.id)], order='id desc', limit=1)
            values.update({
                'l10n_kr_edi_reversal_move_id': reversal_move.id,
                'l10n_kr_edi_amendment_code': reversal_move.l10n_kr_edi_amendment_code,
                'l10n_kr_edi_cash_receipt_cancel_code': reversal_move.l10n_kr_edi_cash_receipt_cancel_code,
            })
        return values
