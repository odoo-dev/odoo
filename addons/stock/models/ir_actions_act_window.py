from odoo import models


class IrActionsActWindow(models.Model):
    _inherit = 'ir.actions.act_window'

    _delivery__action_delivery_carrier_form_optional = models.Ref('delivery.action_delivery_carrier_form', required=False)
