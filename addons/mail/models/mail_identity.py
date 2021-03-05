# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, tools


class MailIdentity(models.Model):
    _name = 'mail.identity'
    _description = 'Identity'
    _order = 'id desc'

    # description
    name = fields.Char(string='Name')
    active = fields.Boolean(string='Active')
    avatar = fields.Image(string='Avatar', max_width=512, max_height=512)
    # contact
    email = fields.Char(string='Email')
    email_normalized = fields.Char(
        string='Normalized Email', compute="_compute_email_normalized",
        compute_sudo=True, store=True)
    phone = fields.Char(string='Phone')
    # security / access
    token = fields.Char(string='Token')

    @api.depends('email')
    def _compute_email_normalized(self):
        for identity in self:
            identity.email_normalized = tools.email_normalize(identity.email) if identity.email else False
