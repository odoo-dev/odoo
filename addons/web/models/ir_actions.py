# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class IrActionsAct_Window(models.Model):
    _inherit = 'ir.actions.act_window'

    hub_view_id = fields.Many2one(
        'ir.ui.view', string='Hub View', domain=[('type', '=', 'hub')],
        help="Hub shown for the records displayed by this action, instead of the default hub of "
             "their model.",
    )

    def _get_readable_fields(self):
        return super()._get_readable_fields() | {'hub_view_id'}
