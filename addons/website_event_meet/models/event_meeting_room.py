# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import datetime

from odoo import api, fields, models
from odoo.addons.http_routing.models.ir_http import slug


class EventMeetingRoom(models.Model):
    _name = "event.meeting.room"
    _description = "Event Meeting Room"
    _order = "is_pinned DESC, id"
    _inherit = [
        'chat.room.mixin',
        'website.published.mixin',
    ]

    _DELAY_CLEAN = datetime.timedelta(hours=4)

    name = fields.Char("Topic", required=True, translate=True)
    active = fields.Boolean('Active', default=True)
    is_published = fields.Boolean(copy=True)  # make the inherited field copyable
    event_id = fields.Many2one("event.event", string="Event", required=True, ondelete="cascade")
    is_pinned = fields.Boolean("Is Pinned")
    chat_room_id = fields.Many2one("chat.room", required=True, ondelete="restrict")
    room_max_capacity = fields.Selection(default="8", copy=True)
    summary = fields.Char("Summary", translate=True)
    target_audience = fields.Char("Audience", translate=True)

    @api.depends('name', 'event_id.name')
    def _compute_website_url(self):
        super(EventMeetingRoom, self)._compute_website_url()
        for meeting_room in self:
            if meeting_room.id:
                meeting_room.website_url = f'/event/{slug(meeting_room.event_id)}/meeting_room/{slug(meeting_room)}'

    @api.depends('event_id.website_id.domain')
    def _compute_website_absolute_url(self):
        super()._compute_website_absolute_url()

    @api.model_create_multi
    def create(self, values_list):
        for values in values_list:
            if not values.get("chat_room_id") and not values.get('room_name'):
                values['room_name'] = 'odoo-room-%s' % (values['name'])
        return super(EventMeetingRoom, self).create(values_list)

    @api.autovacuum
    def _archive_meeting_rooms(self):
        """Archive all non-pinned room with 0 participant if nobody has joined it for a moment."""
        self.sudo().search([
            ("is_pinned", "=", False),
            ("active", "=", True),
            ("room_participant_count", "=", 0),
            ("room_last_activity", "<", fields.Datetime.now() - self._DELAY_CLEAN),
        ]).active = False

    def get_base_url(self):
        """ As website_id is not defined on this record, we rely on event website_id for base URL. """
        return self.event_id.get_base_url()

    def open_website_url(self):
        """ Overridden to use a relative URL instead of an absolute when website_id is False. """
        if self.event_id.website_id:
            return super().open_website_url()
        return self.env['website'].get_client_action(f'/event/{slug(self.event_id)}/meeting_room/{slug(self)}')
