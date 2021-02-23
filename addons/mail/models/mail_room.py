# -*- coding: utf-8 -*-
from odoo import models, fields

import uuid


class RtcRoom(models.Model):
    _name = "mail.room"
    _description = "RTC Room"

    name = fields.Char()
    room_token = fields.Char(required=True, default=lambda x: 'odoo_'+str(uuid.uuid4()))
    partner_ids = fields.Many2many('res.partner', string='Peers')

    def join_room(self):
        current_partner = self.env.user.partner_id
        self.partner_ids = [(4, current_partner.id, 0)]
        self._notify_room_change(current_partner.id)

        # TODO ultimately, we return enriched partner_ids instead of peer_tokens. this is a POC simplification to avoid the front-end relational layer.
        return {
            'peerToken': self.room_token + str(current_partner.id),
            'peerTokens': [self.room_token + str(partner_id.id) for partner_id in self.partner_ids if partner_id.im_status != 'offline'],
        }

    def leave_room(self):
        self.partner_ids = [(3, self.env.user.partner_id.id, 0)]
        self._notify_room_change()

    def _notify_room_change(self, partner_id=None):
        """
       :param peer_token:
       :param status:
        """
        self.ensure_one()
        notifications = []
        peer_tokens = [self.room_token + str(partner.id) for partner in self.partner_ids if partner.im_status != 'offline']
        for partner in self.partner_ids:
            if partner.id == partner_id:
                continue
            notifications.append([
                (self._cr.dbname, 'mail.room', partner.id),
                {
                    'id': self.id,
                    'peer_tokens': peer_tokens,
                },
            ])
        self.env['bus.bus'].sendmany(notifications)
