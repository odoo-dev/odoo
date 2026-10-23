# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.event.controllers.portal import EventPortal
from odoo.fields import Domain
from odoo.http import request


class EventSaleRegistrationTransferPortal(EventPortal):

    def _prepare_event_registrations_domain(self):
        """ Buyers see the registrations of their orders, except the ones they
        transferred to someone else. """
        domain = super()._prepare_event_registrations_domain()
        partner = request.env.user.partner_id
        transferred_ids = request.env['event.registration'].sudo()._search([
            ('sale_order_id.partner_id', '=', partner.id),
            ('partner_id', '!=', partner.id),
            ('transfer_ids.state', '=', 'accepted'),
        ])
        return Domain.AND([domain, Domain('id', 'not in', transferred_ids)])
