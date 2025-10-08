from odoo import http
from odoo.http import request


class MyHackathon(http.Controller):

    @http.route(['/my/hackathons',
                 ], type='http', auth='user', website=True)
    def my_hackathons(self):
        """Portal page showing user's hackathons and upcoming events"""
        user = request.env.user
        my_hackathons = request.env['event.registration'].sudo().search([
            ('name', '=', user.name)
        ])
        new_state = self.env.ref('event.event_stage_new')
        announced_state = self.env.ref('event.event_stage_announced')
        upcoming_hackathons = request.env['event.event'].sudo().search([
            ('stage_id', 'in', [
             new_state.id, announced_state.id]), ('is_published', '=', True)
        ])
        return request.render('hackathon_registration.my_hackathons_page', {
            'my_hackathons': my_hackathons,
            'upcoming_hackathons': upcoming_hackathons,
        })

    @http.route(['/hackathon/details/<int:hackathon_id>',
                 ], type='http', auth='user', website=True)
    def hackathon_details(self, hackathon_id):
        event_registration = request.env['event.registration'].sudo().browse(
            hackathon_id)
        values = {
            'event': event_registration.event_id,
            'registration': event_registration,
        }
        return request.render('hackathon_registration.hackathon_event_details_page_template', values)

    @http.route(['/hackathon/event/<model("event.event"):event>'], type='http', auth='user', website=True)
    def hackathon_event_page(self, event):
        values = {
            'event': event,
            'is_hackathon_page': True,
        }
        return request.render('website_event.event_description_full', values)
