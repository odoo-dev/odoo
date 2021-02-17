# -*- coding: utf-8 -*-
from odoo import models, fields

import uuid


class RtcRoom(models.Model):
    _name = "mail.room"
    _description = "RTC Room"

    name = fields.Char()
    room_token = fields.Char(required=True, default=lambda x: str(uuid.uuid4()))
    partner_ids = fields.One2many('res.partner', 'room_id', string='Peers')

    def join_room(self):
        current_partner = self.env.user.partner_id
        # create peer token on partner if it doesn't exist yet
        if not current_partner.peer_token:
            peer_token = 'odoo_' + str(uuid.uuid4())
            current_partner.peer_token = peer_token
        current_partner.room_id = self.id
        self._notify_room_change(current_partner.id)

        return {
            'peerToken': current_partner.peer_token,
            'peerTokens': [partner_id.peer_token for partner_id in self.partner_ids if partner_id.im_status in ['online', 'away']],
        }

    def leave_room(self):
        self.env.user.partner_id.room_id = False
        self._notify_room_change()

    def _notify_room_change(self, partner_id=None):
        """
       :param peer_token:
       :param status:
        """
        self.ensure_one()
        notifications = []
        peer_tokens = [partner.peer_token for partner in self.partner_ids if partner.im_status in ['online', 'away']]
        for partner in self.partner_ids:
            if partner.id == partner_id:
                continue
            notifications.append([
                (self._cr.dbname, 'mail.room', partner.id),
                {
                    'room_token': self.room_token,
                    'id': self.id,
                    'peer_tokens': peer_tokens,
                },
            ])
        self.env['bus.bus'].sendmany(notifications)
