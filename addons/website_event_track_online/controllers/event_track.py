# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import werkzeug

from odoo import http
from odoo.http import request
from odoo.addons.http_routing.models.ir_http import slug
from odoo.addons.website_event_track.controllers.main import WebsiteEventTrackController


class WebsiteEventTrackOnlineController(WebsiteEventTrackController):

    @http.route("/event/track/wishlist/toggle", type="json", auth="public", website=True)
    def track_wishlist_toggle(self, track_id, active):
        track = request.env['event.track'].browse(track_id).sudo()
        if not track:
            raise werkzeug.exceptions.NotFound()

        user = request.env.user
        if user._is_public():
            return {'error': 'need_login'}

        event = track.event_id
        if not event.is_participating:
            return {
                'error': 'need_registration',
                'eventUrlName': slug(event)
            }

        # get event.track.partner record (create one if needed - ignore if un-wishlist and no event_track_partner found)
        event_track_partner = track._find_event_track_partner(user.partner_id.id, force_create=active)
        if not event_track_partner or event_track_partner.is_wishlisted == active:  # ignore if new state = old state
            return {'error': 'ignored'}

        event_track_partner.write({'is_wishlisted': active})

        return {'wishlisted': active}
