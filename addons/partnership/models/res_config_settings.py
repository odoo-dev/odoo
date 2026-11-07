# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    _partnership__crm_menu_partners = models.Ref('partnership.crm_menu_partners', 'ir.ui.menu', required=False)

    partnership_label = fields.Char(related='company_id.partnership_label', required=True, readonly=False)

    @api.onchange('partnership_label')
    def _onchange_partnership_label(self):
        self._partnership__crm_menu_partners.name = self.partnership_label
