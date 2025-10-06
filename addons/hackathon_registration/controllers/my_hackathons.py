import base64

from odoo import http
from odoo.http import request
from odoo.addons.portal.controllers import portal
from odoo import api, fields, models, Command


class MyHackathon(http.Controller):

    @http.route(['/my/hackathons',
                 ], type='http', auth='user', website=True, methods=['GET', 'POST'])
    def my_hackathons(self):
        """Portal page showing user's hackathons and upcoming events"""
        user = request.env.user
        my_hackathons = request.env['event.registration'].sudo().search([
            ('name', '=', user.name)
        ])
        new_state = self.env.ref('event.event_stage_new')
        announced_state = self.env.ref('event.event_stage_announced')
        upcoming_hackathons = request.env['event.event'].sudo().search([
            ('stage_id', 'in', [new_state.id, announced_state.id])
        ])
        return request.render('hackathon_registration.my_hackathons_page', {
            'my_hackathons': my_hackathons,
            'upcoming_hackathons': upcoming_hackathons,
        })
