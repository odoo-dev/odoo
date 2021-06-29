# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class MailRtcSession(models.Model):
    _name = 'mail.rtc.session'
    _description = 'Mail RTC session'

    channel_id = fields.Many2one('mail.channel', ondelete='cascade', required=True)
    partner_id = fields.Many2one('res.partner', index=True, required=True, ondelete='cascade')

    is_screen_sharing_on = fields.Boolean()
    is_camera_on = fields.Boolean()
    is_muted = fields.Boolean()
    is_deaf = fields.Boolean()

    def _disconnect(self):
        """ Unlinks the sessions and notifies the associated partners that
            their session ended.
        """
        notifications = []
        for record in self:
            notifications.append([
                (self._cr.dbname, 'res.partner', record.partner_id.id),
                {
                    'type': 'rtc_session_ended',
                    'payload': {
                        'sessionId': record.id,
                    },
                },
            ])
        self.unlink()
        return self.env['bus.bus'].sendmany(notifications)

    def _notify_peers(self, targets, content):
        """ Used for peer-to-peer communication,
            guarantees that the sender is the current partner.

            :param targets: a list of mail.rtc.session ids
            :param content: a dict with the content to be sent to the targets
        """

        if not self.exists() or self.env.user.partner_id != self.partner_id:
            return
        notifications = []
        target_sessions = self.search([('id', 'in', [int(target) for target in targets])])
        for session in target_sessions:
            notifications.append([
                (self._cr.dbname, 'res.partner', session.partner_id.id),
                {
                    'type': 'rtc_peer_notification',
                    'payload': {
                        'sender': self.id,
                        'content': content,
                    },
                },
            ])
        return self.env['bus.bus'].sendmany(notifications)

    def _mail_rtc_session_format(self):
        return {
            'id': self.id,
            'partner': {
                'id': self.partner_id.id,
                'name': self.partner_id.name,
            },
            'channel': {
                'id': self.channel_id.id,
                'name': self.channel_id.name,
                'model': self.channel_id._name,
            },
            'is_screen_sharing_on': self.is_screen_sharing_on,
            'is_muted': self.is_muted,
            'is_deaf': self.is_deaf,
            'is_camera_on': self.is_camera_on,
        }

    def update_and_broadcast(self, values):
        if self.env.user.partner_id != self.partner_id:
            return
        self.write(values)
        notifications = []
        for member in self.channel_id.channel_last_seen_partner_ids:
            notifications.append([
                (self._cr.dbname, 'res.partner', member.partner_id.id),
                {
                    'type': 'rtc_session_data_update',
                    'payload': {
                        'rtcSession': self._mail_rtc_session_format(),
                    },
                },
            ])
        self.env['bus.bus'].sendmany(notifications)
