# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.addons.http_routing.models.ir_http import slug


class Event(models.Model):
    _inherit = "event.event"

    meeting_room_ids = fields.One2many("event.meeting.room", "event_id", string="Meeting rooms")
    meeting_room_count = fields.Integer("Room count", compute="_compute_meeting_room_count")
    meeting_room_menu = fields.Boolean(
        "Community Rooms", compute="_compute_meeting_room_menu",
        readonly=False, store=True,
        help="Display community tab on website")
    meeting_room_menu_ids = fields.One2many(
        "website.event.menu", "event_id", string="Event Community Menus",
        domain=[("menu_type", "=", "meeting_room")])
    meeting_room_allow_creation = fields.Boolean(
        "Allow meeting room creation", compute="_compute_meeting_room_allow_creation",
        readonly=False, store=True,
        help="Let Visitors Create Rooms")

    @api.depends("meeting_room_ids")
    def _compute_meeting_room_count(self):
        meeting_room_count = self.env["event.meeting.room"].sudo().read_group(
            domain=[("event_id", "in", self.ids)],
            fields=["id:count"],
            groupby=["event_id"],
        )

        meeting_room_count = {
            result["event_id"][0]: result["event_id_count"]
            for result in meeting_room_count
        }

        for event in self:
            event.meeting_room_count = meeting_room_count.get(event.id, 0)

    @api.depends("event_type_id", "website_menu", "meeting_room_menu")
    def _compute_meeting_room_menu(self):
        for event in self:
            if event.event_type_id and event.event_type_id != event._origin.event_type_id:
                event.meeting_room_menu = event.event_type_id.meeting_room_menu
            elif event.website_menu and event.website_menu != event._origin.website_menu:
                event.meeting_room_menu = True
            elif not event.website_menu or not event.meeting_room_menu:
                event.meeting_room_menu = False

    @api.depends("event_type_id", "meeting_room_menu", "meeting_room_allow_creation")
    def _compute_meeting_room_allow_creation(self):
        for event in self:
            if event.event_type_id and event.event_type_id != event._origin.event_type_id:
                event.meeting_room_allow_creation = event.event_type_id.meeting_room_allow_creation
            elif not event.meeting_room_menu or not event.meeting_room_allow_creation:
                event.meeting_room_allow_creation = False

    # ------------------------------------------------------------
    # WEBSITE MENU MANAGEMENT
    # ------------------------------------------------------------

    def _get_menu_update_fields(self):
        return super(Event, self)._get_menu_update_fields() + ['meeting_room_menu']

    def _update_website_menus(self, menus_update_by_field=None):
        super(Event, self)._update_website_menus(menus_update_by_field=menus_update_by_field)
        for event in self:
            if not menus_update_by_field or event in menus_update_by_field.get('meeting_room_menu'):
                event._update_website_menu_entry('meeting_room_menu', 'meeting_room_menu_ids', '_get_meet_menu_entries')

    def _get_menu_type_field_matching(self):
        res = super(Event, self)._get_menu_type_field_matching()
        res['meeting_room'] = 'meeting_room_menu'
        return res

    def _get_meet_menu_entries(self):
        self.ensure_one()
        return [(_('Community'), '/event/%s/meeting_rooms' % slug(self), False, 70, 'meeting_room')]
