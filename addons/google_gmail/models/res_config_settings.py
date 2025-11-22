# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    company_uses_google_gmail_server = fields.Boolean(related='company_id.uses_google_gmail_server', readonly=False)
    google_gmail_client_identifier = fields.Char('Gmail Client Id', related='company_id.google_gmail_client_identifier', readonly=False)
    google_gmail_client_secret = fields.Char('Gmail Client Secret', related='company_id.google_gmail_client_secret', readonly=False)
