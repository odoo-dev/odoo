# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from ast import literal_eval
from datetime import datetime
from pytz import utc
from werkzeug.exceptions import Forbidden, NotFound

from odoo import exceptions, http
from odoo.addons.website_event_track.controllers.main import WebsiteEventTrackController
from odoo.http import request
from odoo.osv import expression


class WebsiteEventSessionController(WebsiteEventTrackController):

    def _get_event_tracks_base_domain(self, event):
        search_domain_base = [
            ('event_id', '=', event.id),
        ]
        if not request.env.user.has_group('event.event_manager'):
            search_domain_base = expression.AND([search_domain_base, [('is_published', '=', True)]])
        return search_domain_base

    # ------------------------------------------------------------
    # MAIN PAGE
    # ------------------------------------------------------------

    @http.route([
        '''/event/<model("event.event"):event>/track''',
        '''/event/<model("event.event"):event>/track/tag/<model("event.track.tag"):tag>'''
    ], type='http', auth="public", website=True, sitemap=False)
    def event_tracks(self, event, tag=None, **searches):
        #  or (tag and tag.color == 0)
        if not event.can_access_from_current_website():
            raise NotFound()

        # init and process search terms
        searches.setdefault('search', '')
        searches.setdefault('tags', '')
        search_domain = self._get_event_tracks_base_domain(event)
        search_tags = self._get_search_tags(searches['tags'])
        if search_tags:
            # Example: You filter on age: 10-12 and activity: football.
            # Doing it this way allows to only get events who are tagged "age: 10-12" AND "activity: football".
            # Add another tag "age: 12-15" to the search and it would fetch the ones who are tagged:
            # ("age: 10-12" OR "age: 12-15") AND "activity: football
            grouped_tags = dict()
            for search_tag in search_tags:
                grouped_tags.setdefault(search_tag.category_id, list()).append(search_tag)
            search_domain_items = [
                [('tag_ids', 'in', [tag.id for tag in grouped_tags[group]])]
                for group in grouped_tags
            ]
            search_domain = expression.AND([
                search_domain,
                *search_domain_items
            ])

        # fetch data to display
        event = event.with_context(tz=event.date_tz or 'UTC')
        tracks = request.env['event.track'].search(search_domain, order='date asc')
        tag_categories = request.env['event.track.tag.category'].sudo().search([])

        # organize categories for display: live, soon, ...
        today_now = datetime.now(utc).replace(microsecond=0).date()
        tracks_live = tracks.filtered(lambda track: track.is_track_live)
        tracks_soon = tracks.filtered(lambda track: not track.is_track_live and track.date == today_now)
        tracks = sorted(tracks, key=lambda track: track.is_track_done)

        # return render
        values = {
            # event information
            'event': event,
            'main_object': event,
            # tracks display information
            'tracks': tracks,
            'tracks_live': tracks_live,
            'tracks_soon': tracks_soon,
            # search information
            'searches': searches,
            'search_tags': search_tags,
            'tag_categories': tag_categories,
        }
        return request.render("website_event_track.tracks", values)

    # ------------------------------------------------------------
    # FRONTEND FORM
    # ------------------------------------------------------------

    @http.route(['/event/<model("event.event"):event>/track/<model("event.track"):track>'], type='http', auth="public", website=True, sitemap=False)
    def event_exhibitor(self, event, track):
        if not event.can_access_from_current_website():
            raise NotFound()

        try:
            track.check_access_rule('read')
        except exceptions.AccessError:
            raise Forbidden()
        track = track.sudo()

        # if not event.can_access_from_current_website():
        #     raise NotFound()

        # track = track.sudo().with_context(tz=event.date_tz or 'UTC')
        # values = {'track': track, 'event': track.event_id, 'main_object': track}
        # return request.render("website_event_track.track_view", values)

        # search for tracks list
        search_domain_base = self._get_event_tracks_base_domain(event)
        search_domain_base = expression.AND([
            search_domain_base,
            [('id', '!=', track.id)]
        ])
        tracks_other = request.env['event.track'].sudo().search(search_domain_base)

        values = {
            # event information
            'event': event,
            'main_object': event,
            'track': track,
            # sidebar
            'tracks_other': tracks_other,
        }
        return request.render("website_event_track_session.event_track_main", values)

    # ------------------------------------------------------------
    # TOOLS
    # ------------------------------------------------------------

    def _get_search_tags(self, tag_search):
        # TDE FIXME: make me generic (slides, event, ...)
        try:
            tag_ids = literal_eval(tag_search)
        except Exception:
            tags = request.env['event.track.tag'].sudo()
        else:
            # perform a search to filter on existing / valid tags implicitly
            tags = request.env['event.track.tag'].sudo().search([('id', 'in', tag_ids)])
        return tags
