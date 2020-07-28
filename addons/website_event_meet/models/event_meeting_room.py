# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from werkzeug.urls import url_join

from odoo import api, fields, models, _
from odoo.addons.http_routing.models.ir_http import slug


class EventMeetingRoom(models.Model):
    _name = "event.meeting.room"
    _description = "Event Meeting Room"
    _order = "is_pinned DESC, id"
    _inherit = [
        'chat.room.mixin',
        'website.published.mixin',
    ]

    name = fields.Char("Topic", required=True, translate=True)
    active = fields.Boolean('Active', default=True)
    is_published = fields.Boolean(copy=True)  # make the inherited field copyable
    event_id = fields.Many2one("event.event", string="Event", required=True, ondelete="cascade")
    is_pinned = fields.Boolean("Is Pinned")
    summary = fields.Char("Summary")
    target_audience = fields.Char("Audience", translate=True)

    # TDE FIXME: merge with mixin code
    ROOM_CONFIG_FIELDS = {
        'room_name': 'name',
        'room_lang_id': 'lang_id',
        'room_max_capacity': 'max_capacity',
        'room_participant_count': 'participant_count',
    }

    @api.model_create_multi
    def create(self, values_list):
        # TDE FIXME: merge with mixin code
        for values in values_list:
            if not values.get("chat_room_id"):
                # be sure to always create a `chat.room` for each `event.meeting.room`
                chat_room = self.env["chat.room"].create({
                    self.ROOM_CONFIG_FIELDS[field]: value
                    for field, value in dict(values).items()
                    if field in self.ROOM_CONFIG_FIELDS and values.pop(field)
                })

                values["chat_room_id"] = chat_room.id

            values["name"] = values["name"].capitalize()
            values["target_audience"] = (values.get("target_audience") or _("Attendee(s)")).capitalize()

        return super(EventMeetingRoom, self).create(values_list)

    def action_join(self):
        """Join the meeting room on the frontend side."""
        web_base_url = self.env["ir.config_parameter"].sudo().get_param("web.base.url")
        url = url_join(web_base_url, f"/event/{slug(self.event_id)}/meeting_room/{slug(self)}")
        return {
            "type": "ir.actions.act_url",
            "url": url,
        }
