# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    web_app_name = fields.Char('Web App Name', config_parameter='web.web_app_name')

    def action_base_document_layout_configurator(self):
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._("Configure your document layout"),
            'view_mode': 'form',
            'res_model': 'base.document.layout',
            'view_id': self.env.ref('web.view_base_document_layout').id,
            'target': 'new',
            'context': {'dialog_size': 'extra-large'},
        }
