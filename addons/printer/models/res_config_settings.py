# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    def open_manage_printer(self):
        return self.env['ir.actions.actions']._for_xml_id('printer.manage_printers_action')

    def open_reset_printer(self):
        return self.env['ir.actions.actions']._for_xml_id('printer.action_reset_linked_printers')
