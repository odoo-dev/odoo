# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from werkzeug.exceptions import Forbidden, NotFound
from werkzeug.utils import redirect

from odoo import exceptions, http
from odoo.http import request
from odoo.addons.http_routing.models.ir_http import slug
from odoo.osv import expression

_logger = logging.getLogger(__name__)


class WebsiteEventMeetController(http.Controller):

    def _get_event_rooms_base_domain(self, event):
        search_domain_base = [('event_id', '=', event.id), ('is_published', '=', True)]
        return search_domain_base

    def _MEETING_ROOMS_SORT(self, m):
        return (m.is_pinned, m.room_last_joined, m.id)

    # ------------------------------------------------------------
    # MAIN PAGE
    # ------------------------------------------------------------

    @http.route(["/event/<model('event.event'):event>/meeting_rooms"], type="http",
                auth="public", website=True, sitemap=True)
    def event_meeting_rooms(self, event, lang=None):
        """Display the meeting rooms of the event on the frontend side.

        :param event: event for which we display the meeting rooms
        :param lang: lang id used to perform a search
        """
        if not event.can_access_from_current_website():
            raise Forbidden()

        return request.render(
            "website_event_meet.event_meet",
            self._event_meeting_rooms_get_values(event, lang=lang)
        )

    def _event_meeting_rooms_get_values(self, event, lang=None):
        search_domain = self._get_event_rooms_base_domain(event)
        meeting_rooms_all = request.env['event.meeting.room'].sudo().search(search_domain)
        if lang:
            search_domain = expression.AND([
                search_domain,
                [('room_lang_id', '=', int(lang))]
            ])
        meeting_rooms = request.env['event.meeting.room'].sudo().search(search_domain)
        meeting_rooms = meeting_rooms.sorted(self._MEETING_ROOMS_SORT, reverse=True)

        visitor = request.env['website.visitor']._get_visitor_from_request()

        return {
            # event information
            "event": event.sudo(),
            'main_object': event,
            # rooms
            "meeting_rooms": meeting_rooms,
            "current_lang": request.env["res.lang"].browse(int(lang)) if lang else False,
            "available_languages": meeting_rooms_all.mapped("room_lang_id"),
            "default_lang_code": request.context.get('lang', request.env.user.lang),
            "default_username": visitor._get_attendee_name() if visitor else None,
            # environment
            "is_event_manager": request.env.user.has_group("event.group_event_manager"),
        }

    @http.route(["/event/create_meeting_room"], type="http", auth="public", methods=["POST"], website=True)
    def create_meeting_room(self, **post):
        name = post.get("name")
        summary = post.get("summary")
        target_audience = post.get("audience")
        lang_code = post.get("lang_code")
        max_capacity = post.get("capacity")
        event_id = int(post.get("event"))

        # get the record to be sure they really exist
        event = request.env["event.event"].browse(event_id).exists()
        lang = request.env["res.lang"].search([("code", "=", lang_code)], limit=1)

        if not event or not event.can_access_from_current_website():
            raise Forbidden()

        if not event.website_published or not lang or max_capacity == "no_limit" or not event.meeting_room_allow_creation:
            raise Forbidden()

        _logger.info("New meeting room (%s) create by %s" % (name, request.httprequest.remote_addr))

        meeting_room = request.env["event.meeting.room"].sudo().create(
            {
                "name": name,
                "summary": summary,
                "target_audience": target_audience,
                "is_pinned": False,
                "event_id": event.id,
                "room_lang_id": lang.id,
                "room_max_capacity": max_capacity,
                "is_published": True,
            },
        )

        return redirect(f"/event/{slug(event)}/meeting_room/{slug(meeting_room)}")

    @http.route(["/event/active_langs"], type="json", auth="public")
    def active_langs(self):
        return request.env["res.lang"].sudo().get_installed()

    # ------------------------------------------------------------
    # ROOM PAGE VIEW
    # ------------------------------------------------------------

    @http.route(["/event/<model('event.event'):event>/meeting_room/<model('event.meeting.room'):meeting_room>"], type="http",
                auth="public", website=True, sitemap=True)
    def event_meeting_room(self, event, meeting_room, **post):
        """Display the meeting room frontend view.

        :param event: Event for which we display the meeting rooms
        :param meeting_room: Meeting Room to display
        """
        if not event.can_access_from_current_website() or meeting_room not in event.sudo().meeting_room_ids:
            raise NotFound()

        try:
            meeting_room.check_access_rule('read')
        except exceptions.AccessError:
            raise Forbidden()

        meeting_room = meeting_room.sudo()

        return request.render(
            "website_event_meet.event_meet_main",
            self._event_meet_get_values(event, meeting_room),
        )

    def _event_meet_get_values(self, event, meeting_room):
        # search for meeting room list
        meeting_rooms_other = request.env['event.meeting.room'].sudo().search([
            ('event_id', '=', event.id), ('id', '!=', meeting_room.id), ('is_published', '=', True),
        ])

        if not request.env.user.has_group("event.group_event_manager"):
            # only the event manager can see meeting rooms which are full
            meeting_rooms_other = meeting_rooms_other.filtered(lambda m: not m.room_is_full)

        meeting_rooms_other = meeting_rooms_other.sorted(self._MEETING_ROOMS_SORT, reverse=True)

        return {
            # event information
            'event': event,
            'main_object': event,
            'meeting_room': meeting_room,
            # sidebar
            'meeting_rooms_other': meeting_rooms_other,
            # options
            'option_widescreen': True,
            'is_event_manager': request.env.user.has_group('event.group_event_manager'),
        }
