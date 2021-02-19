# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class Channel(models.Model):
    _inherit = 'mail.channel'

    subscription_department_ids = fields.Many2many(
        'hr.department', string='HR Departments',
        help='Automatically subscribe members of those departments to the channel.')

    def _subscribe_users_automatically_get_members(self):
        """ Auto-subscribe members of a department to a channel """
        new_members = super(Channel, self)._subscribe_users_automatically_get_members()
        new_partner_ids = [member['partner_id'] for member in new_members]
        new_members += [
            {'channel_id': channel.id, 'partner_id': partner.id}
            for channel in self.filtered(lambda channel: channel.subscription_department_ids)
            for partner in channel.subscription_department_ids.member_ids.user_id.partner_id - channel.channel_partner_ids
            if partner.id not in new_partner_ids
        ]
        return new_members

    def write(self, vals):
        res = super(Channel, self).write(vals)
        if vals.get('subscription_department_ids'):
            self._subscribe_users_automatically()
        return res
