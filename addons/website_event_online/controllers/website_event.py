# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import werkzeug
from datetime import datetime

from odoo.addons.website_event.controllers.main import WebsiteEventController
from odoo import http
from odoo.http import request
from odoo.addons.http_routing.models.ir_http import slug


class WebsiteEventOnlineController(WebsiteEventController):

    @http.route(['''/event/<model("event.event"):event>/page/<path:page>'''],
                type='http', auth="public", website=True, sitemap=False)
    def event_page(self, event, page, **post):
        if not event.can_access_from_current_website():
            raise werkzeug.exceptions.NotFound()

        if event.show_countdown and event.date_begin > datetime.now():
            page = "website_event_online.event_countdown"
            redirect_url = '/event/%s/track' % slug(event)
            # check if only one talk starting when event starts
            talks = request.env["event.track"].sudo().search([('event_id', '=', event.id)], order='date', limit=2)
            if len(talks) == 2 and talks[0].date != talks[1].date:
                redirect_url += '/%s' % slug(talks[0])

            values = {
                'event': event,
                'remaining_time': (event.date_begin - datetime.now()).total_seconds(),
                'redirect_url': redirect_url,
            }
            return request.render(page, values)
        else:
            return super(WebsiteEventOnlineController, self).event_page(event, page, **post)
