# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_enable_imin_printer = fields.Boolean(compute='_compute_pos_enable_imin_printer', store=True, readonly=False)

    @api.depends('pos_enable_imin_printer', 'pos_other_devices')
    def _compute_pos_iface_cashdrawer(self):
        """We are just adding depends on this compute."""
        super()._compute_pos_iface_cashdrawer()

    def _is_cashdrawer_displayed(self, res_config):
        return super()._is_cashdrawer_displayed(res_config) or (res_config.pos_other_devices and res_config.pos_enable_imin_printer)

    @api.depends('pos_other_devices', 'pos_config_id')
    def _compute_pos_enable_imin_printer(self):
        for res_config in self:
            if not res_config.pos_other_devices:
                res_config.pos_enable_imin_printer = False
            else:
                res_config.pos_enable_imin_printer = res_config.pos_config_id.enable_imin_printer
