# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http


class WebsiteEventTrackLiveController(http.Controller):

    @http.route('/event/track/<model("event.track"):track>/get_track_suggestion', type='json', auth='public')
    def get_next_track_suggestion(self, track):
        track_suggestion = track._get_track_suggestions(
            restrict_domain=[('youtube_video_url', '!=', False)],
            limit=1)
        if track_suggestion:
            return self._prepare_track_suggestion_values(track, track_suggestion)
        else:
            return False

    def _prepare_track_suggestion_values(self, track, track_suggestion):
        return {
            'current_track': {
                'name': track.name
            },
            'suggestion': {
                'id': track_suggestion.id,
                'name': track_suggestion.name,
                'speaker_name': track_suggestion.partner_name,
                'website_image_url': track_suggestion.website_image_url,
                'website_url': track_suggestion.website_url
            }
        }
