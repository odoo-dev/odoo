# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    module_l10n_tw_edi_ecpay = fields.Boolean(string="Taiwan E-invoicing (ECPay)")

    def action_l10n_tw_activate_edi_ecpay(self):
        self.env['ir.module.module'].search([('name', '=', 'l10n_tw_edi_ecpay')]).button_immediate_install()
        return {'type': 'ir.actions.client', 'tag': 'reload'}
