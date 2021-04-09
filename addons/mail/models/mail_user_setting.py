# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class MailUserSetting(models.Model):
    # TODO should be merged with `mail.user.settings` from https://github.com/odoo/odoo/pull/70986
    _name = 'mail.user.setting'
    _description = 'Mail User Setting'

    user_id = fields.Many2one('res.users', ondelete='cascade', required=True, index=True)
    use_push_to_talk = fields.Boolean(default=False)
    push_to_talk_key = fields.Char()
    voice_active_duration = fields.Integer()

    _sql_constraints = [
        ('user_unique', 'unique (user_id)', "A setting already exists for this user"),
    ]

    def mail_setting_format(self):
        records = self.search_read([('user_id', '=', self.env.user.id)])
        return records[0] if records else False

    def set_setting(self, write_dict):
        write_dict.pop('user_id', None)
        setting = self.search([('user_id', '=', self.env.user.id)])
        if not setting:
            setting = self.create([{'user_id': self.env.user.id}])
        return setting.write(write_dict)
