# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.website_event_track_live.controllers.track_live import WebsiteEventTrackLiveController


class WebsiteEventTrackLiveQuizController(WebsiteEventTrackLiveController):

    def _prepare_track_suggestion_values(self, track, track_suggestion):
        res = super(WebsiteEventTrackLiveQuizController, self)._prepare_track_suggestion_values(track, track_suggestion)
        track_visitor = track._get_event_track_visitors(force_create=False)
        res['current_track']['show_quiz'] = bool(track.sudo().quiz_id) and not track_visitor.quiz_completed
        return res
