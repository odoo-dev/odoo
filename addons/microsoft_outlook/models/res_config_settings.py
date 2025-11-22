# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    company_uses_microsoft_outlook_server = fields.Boolean(related='company_id.uses_microsoft_outlook_server', readonly=False)
    microsoft_outlook_client_identifier = fields.Char('Outlook Client Id', related='company_id.microsoft_outlook_client_identifier', readonly=False)
    microsoft_outlook_client_secret = fields.Char('Outlook Client Secret', related='company_id.microsoft_outlook_client_secret', readonly=False)
