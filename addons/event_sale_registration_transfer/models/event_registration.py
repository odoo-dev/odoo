# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class EventRegistration(models.Model):
    _inherit = 'event.registration'

    def _get_event_registration_ids_from_order(self):
        """ Tickets of an order may now belong to different people: only list
        the ones owned by the same attendee. """
        registration_ids = super()._get_event_registration_ids_from_order()
        return self.browse(registration_ids).filtered(
            lambda registration: registration.partner_id == self.partner_id
        ).ids
