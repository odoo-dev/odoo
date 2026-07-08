from odoo import models
from odoo.fields import Datetime


class AccountMoveSendWizard(models.TransientModel):
    _inherit = 'account.move.send.wizard'

    def action_send_and_print(self, allow_fallback_pdf=False):
        result_action = super().action_send_and_print(allow_fallback_pdf)
        # generate e-invoice json
        einvoice_json = self.move_id._generate_l10n_eg_edi_json()
        # sign and send invoice
        thumb_drive = self.env['l10n_eg_edi.thumb.drive'].search(
            [('user_id', '=', self.env.user.id), ('company_id', '=', self.company_id.id)]
        )
        sign_action = thumb_drive.action_sign_and_send_eta_invoice(
            {self.move_id.id: {'invoice': einvoice_json, 'signing_time': Datetime.now()}}
        )
        if result_action:
            sign_action['next'] = result_action
        return sign_action
