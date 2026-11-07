from odoo import models


class IrActionsActWindow(models.Model):
    _inherit = 'ir.actions.act_window'

    _base_setup__action_general_configuration = models.Ref('base_setup.action_general_configuration', 'ir.actions.act_window')
