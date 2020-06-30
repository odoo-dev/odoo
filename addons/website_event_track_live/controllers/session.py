# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.website_event_track_session.controllers.session import WebsiteEventSessionController


class WebsiteEventSessionLiveController(WebsiteEventSessionController):
    def _prepare_event_track_values(self, event, tag=None, **searches):
        values = super(WebsiteEventSessionLiveController, self)._prepare_event_track_values(event, tag, **searches)
        values['viewers_count'] = values['tracks']._get_viewers_count()
        return values
