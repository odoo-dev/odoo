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
    email = fields.Char(
        string='Email', compute='_compute_email',
        readonly=False, store=True)
    email_normalized = fields.Char(
        string='Normalized Email', compute="_compute_email_normalized",
        compute_sudo=True, store=True)
    phone = fields.Char(
        string='Phone', compute='_compute_phone',
        readonly=False, store=True)
    # link with other contact models
    partner_id = fields.Many2one('res.partner', string='Partner')
    user_id = fields.Many2one('res.users', string='User')
    # security / access
    token = fields.Char(string='Token')

    @api.depends('partner_id.email')
    def _compute_email(self):
        for identity in self:
            if identity.partner_id.email or not identity.email:
                identity.email = identity.partner_id.email

    @api.depends('email')
    def _compute_email_normalized(self):
        for identity in self:
            identity.email_normalized = tools.email_normalize(identity.email) if identity.email else False

    @api.depends('partner_id.mobile', 'partner_id.phone')
    def _compute_phone(self):
        for identity in self:
            if identity.partner_id.mobile or identity.partner_id.phone or not identity.phone:
                identity.phone = identity.partner_id.mobile or identity.parnter_id.phone
