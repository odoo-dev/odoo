# -*- coding: utf-8 -*-
from odoo import models, fields

import uuid


class RtcRoom(models.Model):
    _name = "mail.room"
    _description = "RTC Room"

    name = fields.Char()
    room_token = fields.Char(required=True, default=lambda x: str(uuid.uuid4()))
    partner_ids = fields.One2many('res.partner', 'room_id', string='Peers')

    def _notify_room_change(self, partner_id):
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
