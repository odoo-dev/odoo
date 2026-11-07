# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    partnership_label = fields.Char(related='company_id.partnership_label', required=True, readonly=False)

    @api.onchange('partnership_label')
    def _onchange_partnership_label(self):
        self.env['ir.ui.menu'].ref('partnership.crm_menu_partners').name = self.partnership_label
