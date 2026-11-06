# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    group_mrp_byproducts = fields.Boolean("By-Products",
        implied_group='mrp.group_mrp_byproducts')
    module_mrp_mps = fields.Boolean("Master Production Schedule")
    module_mrp_plm = fields.Boolean("Product Lifecycle Management (PLM)")
    module_quality_control = fields.Boolean("Quality")
    module_quality_control_worksheet = fields.Boolean("Quality Worksheet")
    module_mrp_subcontracting = fields.Boolean("Subcontracting")
    group_mrp_routings = fields.Boolean("MRP Work Orders",
        implied_group='mrp.group_mrp_routings')
    group_unlocked_by_default = fields.Boolean("Unlock Manufacturing Orders", implied_group='mrp.group_unlocked_by_default')

    @api.onchange('group_unlocked_by_default')
    def _onchange_group_unlocked_by_default(self):
        """ When changing this setting, we want existing MOs to automatically update to match setting. """
        if self.group_unlocked_by_default:
            self.env['mrp.production'].search([('state', 'not in', ('cancel', 'done')), ('is_locked', '=', True)]).is_locked = False
        else:
            self.env['mrp.production'].search([('state', 'not in', ('cancel', 'done')), ('is_locked', '=', False)]).is_locked = True
