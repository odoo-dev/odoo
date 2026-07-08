from odoo import fields, models


class L10nEgEdiCancelWizard(models.TransientModel):
    _name = 'l10n_eg_edi.cancel.wizard'
    _description = 'Wizard to cancel an invoice in ETA'

    move_id = fields.Many2one('account.move', required=True)
    l10n_eg_eta_cancellation_reason = fields.Selection(
        selection=[
            ('wrong_buyer', "Wrong Buyer Details"),
            ('wrong_invoice', "Wrong Invoice Details"),
            ('duplicate', "Duplicate Invoice"),
            ('other', "Other"),
        ],
        string='Cancellation Reason',
        required=True,
    )
    l10n_eg_eta_cancellation_reason_other = fields.Char(string='Other Reason')

    def action_cancel_invoice(self):
        self.ensure_one()
        cancellation_reason = self.l10n_eg_eta_cancellation_reason
        if cancellation_reason == 'other':
            cancellation_reason = self.l10n_eg_eta_cancellation_reason_other
        self.move_id._l10n_eg_edi_cancel_invoice(cancellation_reason)
