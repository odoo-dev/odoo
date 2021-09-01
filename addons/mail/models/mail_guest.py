# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import pytz
import uuid

from odoo.tools import consteq
from odoo import api, fields, models
from odoo.addons.base.models.res_partner import _tz_get


class MailGuest(models.Model):
    _name = 'mail.guest'
    _description = "Guest"
    _inherit = ['avatar.mixin']
    _avatar_name_field = "name"

    @api.model
    def _lang_get(self):
        return self.env['res.lang'].get_installed()

    name = fields.Char(string="Name", required=True)
    access_token = fields.Char(string="Access Token", default=lambda self: str(uuid.uuid4()), groups='base.group_system', required=True, readonly=True, copy=False)
    country_id = fields.Many2one(string="Country", comodel_name='res.country')
    lang = fields.Selection(string="Language", selection=_lang_get)
    timezone = fields.Selection(string="Timezone", selection=_tz_get)
    channel_ids = fields.Many2many(string="Channels", comodel_name='mail.channel', relation='mail_channel_partner', column1='guest_id', column2='channel_id', copy=False)

    def _get_guest_from_request(self, request):
        guest_id = request.httprequest.cookies.get('mail.guest_id')
        guest_access_token = request.httprequest.cookies.get('mail.guest_access_token')
        if not guest_id or not guest_access_token:
            return self.env['mail.guest']
        guest = self.env['mail.guest'].browse(int(guest_id)).sudo().exists()
        if not guest or not guest.access_token or not consteq(guest.access_token, guest_access_token):
            return self.env['mail.guest']
        if not guest.timezone:
            timezone = self._get_timezone_from_request(request)
            if timezone:
                guest._update_timezone(timezone)
        return guest.sudo(False).with_context(guest=guest)

    def _get_timezone_from_request(self, request):
        timezone = request.httprequest.cookies.get('tz')
        return timezone if timezone in pytz.all_timezones else False

    def _update_timezone(self, timezone):
        query = """
            UPDATE mail_guest
            SET timezone = %s
            WHERE id IN (
                SELECT id FROM mail_guest WHERE id = %s
                FOR NO KEY UPDATE SKIP LOCKED
            )
        """
        self.env.cr.execute(query, (timezone, self.id))

    def _init_messaging(self):
        self.ensure_one()
        partner_root = self.env.ref('base.partner_root')
        return {
            'channels': self.channel_ids.channel_info(),
            'company_name': self.env.user.company_id.name,
            'currentGuest': {
                'id': self.id,
                'name': self.name,
            },
            'current_partner': False,
            'current_user_id': False,
            'current_user_settings': False,
            'mail_failures': [],
            'menu_id': False,
            'needaction_inbox_counter': False,
            'partner_root': {
                'id': partner_root.id,
                'name': partner_root.name,
            },
            'public_partners': [],
            'shortcodes': [],
            'starred_counter': False,
        }
