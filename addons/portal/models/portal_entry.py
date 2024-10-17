# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class PortalEntry(models.Model):
    _name = 'portal.entry'
    _description = 'Portal Entry'

    title = fields.Char(string="Title", required=True)
    text = fields.Char(string="Text")
    url = fields.Char(string="URL", required=True)
    icon = fields.Char(string="Icon Path")
    placeholder_count = fields.Char(string="Placeholder Count")
    bg_color = fields.Char(string="Background Color")
    isAlert = fields.Boolean(string="Is Alert", default=False)
