# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import math

from odoo import http
from odoo.addons.http_routing.models.ir_http import slug
from odoo.addons.website_event_track_online.controllers.community import WebsiteEventCommunityController
from odoo.http import request


class WebsiteEventTrackQuizCommunityController(WebsiteEventCommunityController):

    _visitors_per_page = 30
    _pager_max_pages = 5

    @http.route(['/event/<model("event.event"):event>/community',
                '/event/<model("event.event"):event>/community/page/<int:page>',
                '/event/<model("event.event"):event>/community/leaderboard',
                '/event/<model("event.event"):event>/community/leaderboard/page/<int:page>'], type='http', auth="public", website=True, sitemap=False)
    def community(self, event, page=1, lang=None, **kwargs):
        values = self._get_community_leaderboard_render_values(event, kwargs.get('search'), page)
        return request.render('website_event_track_quiz.event_leaderboard', values)

    def _get_community_leaderboard_render_values(self, event, search_term, page, values={}):
        values = self._get_leaderboard(event, search_term)
        values.update({'event': event, 'search': search_term})

        user_count = len(values['visitors'])
        if user_count:
            page_count = math.ceil(user_count / self._visitors_per_page)
            url = '/event/%s/community/leaderboard' % (slug(event))
            pager = request.website.pager(url=url, total=user_count, page=page, step=self._visitors_per_page,
                                          scope=page_count if page_count < self._pager_max_pages else self._pager_max_pages)
        else:
            pager = {'page_count': 0}
        values['visitors'] = values['visitors'][(page - 1) * self._visitors_per_page: (page) * self._visitors_per_page]
        values.update({'pager': pager})
        return values

    def _get_leaderboard(self, event, searched_name=None):
        domain = [('track_id', 'in', event.track_ids.ids), ('visitor_id', '!=', False)]
        track_visitor_data = request.env['event.track.visitor'].sudo().read_group(
            domain,
            ['id', 'visitor_id', 'points:sum(quiz_points)'],
            ['visitor_id'], orderby="points DESC")
        data_map = {datum['visitor_id'][0]: datum['points'] for datum in track_visitor_data if datum.get('visitor_id')}
        leaderboard = []
        position = 1
        for visitor_id, points in data_map.items():
            visitor = request.env['website.visitor'].sudo().browse(visitor_id)
            if (searched_name and searched_name.lower() in visitor.display_name.lower()) or not searched_name:
                leaderboard.append({'visitor': visitor, 'points': points, 'position': position})
            position = position + 1

        return {
            'top3_visitors': leaderboard[:3] if len(leaderboard) >= 3 else False,
            'visitors': leaderboard
        }
