# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import datetime
from zoneinfo import ZoneInfo

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models

L10N_KR_EDI_AMENDMENT_CODES = [
    ('1', "Error in details"),
    ('2', "Change in supply value"),
    ('3', "Returned goods"),
    ('4', "Contract cancelled"),
    ('5', "Local L/C opened afterwards"),
    ('6', "Duplicate issuance"),
]
L10N_KR_EDI_REPLACEMENT_AMENDMENT_CODES = ('1', '5')
L10N_KR_EDI_CASH_RECEIPT_CANCEL_CODES = [
    ('1', "Transaction cancelled"),
    ('2', "Issued in error"),
]
L10N_KR_EDI_CASH_RECEIPT_REPLACEMENT_CANCEL_CODE = '2'
L10N_KR_EDI_SENDABLE_ISSUANCE_TYPES = {
    False: 'tax_invoice',
    'tax_invoice': 'tax_invoice',
    'tax_exempt_invoice': 'tax_exempt_invoice',
    'cash_receipt': 'cash_receipt',
}


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_kr_edocument_number = fields.Char(tracking=True)
    l10n_kr_edi_document_ids = fields.One2many(comodel_name='l10n_kr_edi.document', inverse_name='move_id', string="Barobill Documents")
    l10n_kr_edi_state = fields.Selection(
        selection=[
            ('issued', "Issued"),
            ('sent', "Sent to NTS"),
            ('success', "NTS Success"),
            ('error', "NTS Error"),
            ('canceled', "Canceled"),
        ],
        string="e-Issuance Status",
        help="Issued: issued on Barobill but not sent to the NTS yet. It can still be cancelled.\n"
             "Sent to NTS: waiting to be sent or being sent to the NTS. The NTS can still reject it.\n"
             "NTS Success: accepted by the NTS.\n"
             "NTS Error: rejected by the NTS. The reason is logged in the chatter. Reset the invoice to draft to fix it and issue it again.\n"
             "Canceled: cancelled on Barobill before it reached the NTS.",
        compute='_compute_l10n_kr_edi_state',
        store=True,
        tracking=True,
    )
    l10n_kr_edi_nts_send_date = fields.Datetime(
        string="NTS Submission Date",
        compute='_compute_l10n_kr_edi_state',
        store=True,
    )
    l10n_kr_edi_origin_move_id = fields.Many2one(
        comodel_name='account.move',
        string="Original e-Invoice",
        compute='_compute_l10n_kr_edi_origin_move_id',
    )
    l10n_kr_edi_reversal_move_id = fields.Many2one(
        comodel_name='account.move',
        string="Cancelling Credit Note",
        copy=False,
        readonly=True,
        help="Credit note that cancels the original invoice this invoice replaces.",
    )
    l10n_kr_edi_amendment_code = fields.Selection(
        selection=L10N_KR_EDI_AMENDMENT_CODES,
        string="Amendment Reason",
        copy=False,
        help="Reason for issuing an amended e-Tax Invoice against the original one.",
    )
    l10n_kr_edi_cash_receipt_cancel_code = fields.Selection(
        selection=L10N_KR_EDI_CASH_RECEIPT_CANCEL_CODES,
        string="Cancellation Reason",
        copy=False,
        help="Reason for cancelling the original cash receipt.",
    )

    @api.depends('l10n_kr_edi_document_ids.state', 'l10n_kr_edi_document_ids.nts_send_date')
    def _compute_l10n_kr_edi_state(self):
        for move in self:
            document = move._l10n_kr_edi_get_document()
            move.l10n_kr_edi_state = document.state
            move.l10n_kr_edi_nts_send_date = document.nts_send_date

    @api.depends('reversed_entry_id', 'debit_origin_id', 'l10n_kr_edi_reversal_move_id.reversed_entry_id')
    def _compute_l10n_kr_edi_origin_move_id(self):
        for move in self:
            move.l10n_kr_edi_origin_move_id = move.reversed_entry_id or move.debit_origin_id or move.l10n_kr_edi_reversal_move_id.reversed_entry_id

    @api.depends('l10n_kr_edi_state')
    def _compute_show_reset_to_draft_button(self):
        # EXTENDS 'account'
        super()._compute_show_reset_to_draft_button()
        self.filtered(lambda move: move.l10n_kr_edi_state not in (False, 'error', 'canceled')).show_reset_to_draft_button = False

    def action_l10n_kr_edi_refresh_state(self):
        self.ensure_one()
        return self._l10n_kr_edi_get_document().action_refresh_state()

    def action_l10n_kr_edi_cancel(self):
        self.ensure_one()
        return self._l10n_kr_edi_get_document().action_cancel()

    def _l10n_kr_edi_get_document(self):
        self.ensure_one()
        return self.l10n_kr_edi_document_ids.sorted('id', reverse=True)[:1]

    def _l10n_kr_edi_get_reversal_document_type(self):
        self.ensure_one()
        if self.country_code != 'KR' or self.move_type != 'out_invoice':
            return False
        if self.l10n_kr_issuance_type == 'cash_receipt':
            return 'cash_receipt'
        if self.l10n_kr_issuance_type in (False, 'tax_invoice', 'tax_exempt_invoice'):
            return 'tax_invoice'
        return False

    def _l10n_kr_edi_get_sendable_issuance_type(self):
        self.ensure_one()
        if (
            self.country_code != 'KR'
            or self.move_type not in ('out_invoice', 'out_refund')
            or self.state != 'posted'
            or self.l10n_kr_edi_state not in (False, 'error', 'canceled')
        ):
            return False
        return L10N_KR_EDI_SENDABLE_ISSUANCE_TYPES.get(self.l10n_kr_issuance_type, False)

    def _l10n_kr_edi_is_late_issuance(self):
        self.ensure_one()
        return bool(self.invoice_date) and self.invoice_date + relativedelta(months=1, day=10) < datetime.now(ZoneInfo('Asia/Seoul')).date()

    def _l10n_kr_edi_get_amendment_error(self):
        self.ensure_one()
        origin = self.l10n_kr_edi_origin_move_id
        issuance_type = L10N_KR_EDI_SENDABLE_ISSUANCE_TYPES.get(self.l10n_kr_issuance_type, False)
        if self.l10n_kr_edi_reversal_move_id and self.l10n_kr_edi_reversal_move_id.state != 'posted':
            return self.env._("The credit note %(move)s that cancels the original invoice must be confirmed first.", move=self.l10n_kr_edi_reversal_move_id.display_name)
        if (
            self.move_type not in ('out_invoice', 'out_refund')
            or not issuance_type
            or (issuance_type == 'cash_receipt' and self.l10n_kr_edi_reversal_move_id)
        ):
            return False
        if not origin:
            if self.move_type == 'out_refund':
                return self.env._("A credit note can only be issued through Barobill when it is linked to its original invoice.")
            return False
        if origin.l10n_kr_edi_state in (False, 'canceled'):
            return self.env._("The original invoice %(move)s must be issued through Barobill first.", move=origin.name)
        if L10N_KR_EDI_SENDABLE_ISSUANCE_TYPES.get(origin.l10n_kr_issuance_type) != issuance_type:
            return self.env._("The proof of issuance must be the same as on the original invoice %(move)s.", move=origin.name)
        if self.move_type == 'out_refund' and issuance_type == 'cash_receipt' and not self.l10n_kr_edi_cash_receipt_cancel_code:
            return self.env._("This credit note has no cancellation reason, so it cannot cancel the original cash receipt. Cancel it and reverse the original invoice again with a cancellation reason.")
        if self.move_type == 'out_refund' and issuance_type != 'cash_receipt' and not self.l10n_kr_edi_amendment_code:
            return self.env._("This credit note has no amendment reason, so it cannot be issued as an amended e-Tax Invoice. Cancel it and reverse the original invoice again with an amendment reason.")
        if issuance_type == 'cash_receipt' and self.debit_origin_id:
            return self.env._("A debit note cannot be issued as a cash receipt. Create a new invoice for the additional amount instead.")
        if self.move_type == 'out_refund' and self.l10n_kr_edi_amendment_code in L10N_KR_EDI_REPLACEMENT_AMENDMENT_CODES:
            return self.env._("This credit note is issued together with its new invoice. Send the new invoice instead.")
        return False
