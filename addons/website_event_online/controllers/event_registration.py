# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.website_event.controllers.main import WebsiteEventController
from odoo.http import request


class WebsiteEventOnlineController(WebsiteEventController):

    def _create_attendees_from_registration_post(self, event, registration_data):
        visitor_sudo = request.env['website.visitor']._get_visitor_from_request(force_create=True)

        if visitor_sudo and registration_data:
            # update visitor info
            visitor_values = {
                "name": registration_data[0]["name"],
                "email": registration_data[0]["email"]
            }
            if not visitor_sudo.mobile:
                visitor_values['mobile'] = registration_data[0]["phone"]
            visitor_sudo.write(visitor_values)

            # update registration info
            registration_data[0]["visitor_id"] = visitor_sudo.id
        return super(WebsiteEventOnlineController, self)._create_attendees_from_registration_post(event, registration_data)
