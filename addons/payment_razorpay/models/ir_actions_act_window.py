from odoo import models


class IrActionsActWindow(models.Model):
    _inherit = 'ir.actions.act_window'

    _payment__action_payment_provider = models.Ref('payment.action_payment_provider', 'ir.actions.act_window')
