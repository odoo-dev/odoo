import functools
import json
import operator

from collections import Counter, defaultdict

from odoo.addons.portal.controllers.portal import CustomerPortal
from odoo.addons.website_event.controllers.main import WebsiteEventController
from odoo.exceptions import ValidationError
from odoo.http import request, route


class WebsiteEventSaleController(WebsiteEventController):

    def _check_seats_availability(self, event, registrations_data):
        res = super()._check_seats_availability(event, registrations_data)
        if not res:
            return False

        counter_per_combination = Counter((
            registration.get('event_slot_id', False),
            registration['event_ticket_id'],
            self.env['product.combo.item'].browse(registration['product_combo_item_ids']))
            for registration in registrations_data
            if registration.get('product_combo_item_ids'))
        if not counter_per_combination:
            return res

        slot_ids = {slot_id for slot_id, _, _ in counter_per_combination if slot_id}
        ticket_ids = {ticket_id for _, ticket_id, _ in counter_per_combination if ticket_id}
        slots_per_id = {slot.id: slot for slot in self.env['event.slot'].browse(slot_ids)}
        tickets_per_id = {ticket.id: ticket for ticket in self.env['event.event.ticket'].browse(ticket_ids)}
        try:
            event._verify_seats_availability_combo(list({
                (slots_per_id.get(slot_id, False), tickets_per_id.get(ticket_id, False), product_combo_items, count)
                for (slot_id, ticket_id, product_combo_items), count in counter_per_combination.items()
            }))
        except ValidationError:
            return False
        return True

    def _process_attendees_form(self, event, form_details):
        registrations = super()._process_attendees_form(event, form_details)
        for key, value in form_details.items():
            if not value or '-' not in key:
                continue

            key_values = key.split('-')
            # Special case for handling combo_choices data
            if len(key_values) == 2:
                registration_index, field_name = key_values
                if field_name == 'combo_choices':
                    combo_choices = json.loads(value)
                    registrations[registration_index]['product_combo_item_ids'] = [choice['combo_item_id'] for choice in combo_choices]
        return registrations

    def _process_tickets_form(self, event, form_details):
        """ Add price information on ticket order """
        res = super()._process_tickets_form(event, form_details)
        ticket_combo_choices = defaultdict(list)
        for name, value in form_details.items():
            if 'choice_combo' not in name:
                continue
            ticket_id, combo_id = name.split('-')[1].split('.')
            if int(ticket_id) not in [r['id'] for r in res]:
                continue
            ticket_combo_choices[int(ticket_id)].append({
                'combo_id': int(combo_id),
                'combo_item_id': int(value),
            })

        for item in res:
            if item['ticket']['product_type'] != 'combo':
                item['price'] = item['ticket']['price'] if item['ticket'] else 0
            else:
                item['combo_choices'] = json.dumps(ticket_combo_choices[item['id']])
        return res

    def _create_attendees_from_registration_post(self, event, registration_data):
        # we have at least one registration linked to a ticket -> sale mode activate
        if not any(info.get('event_ticket_id') for info in registration_data):
            return super()._create_attendees_from_registration_post(event, registration_data)

        event_ticket_ids = [registration['event_ticket_id'] for registration in registration_data if registration.get('event_ticket_id')]
        event_ticket_by_id = {
            event_ticket.id: event_ticket
            for event_ticket in request.env['event.event.ticket'].sudo().browse(event_ticket_ids)
        }
        all_product_combo_item_ids = functools.reduce(operator.iadd, (reg['product_combo_item_ids'] for reg in registration_data if reg.get('product_combo_item_ids')), [])
        all_product_combo_items = request.env['product.combo.item'].sudo().browse(all_product_combo_item_ids)
        product_combo_item_by_id = {
            product_combo_item.id: product_combo_item for product_combo_item in all_product_combo_items
        }
        ticket_by_product_data = self.env['event.event.ticket'].sudo()._read_group(
            [('event_id', '=', event.id), ('product_id', 'in', all_product_combo_items.product_id.ids)], ['product_id'], ['id:recordset'])
        ticket_by_product_id = {
            product.id: ticket.id for product, ticket in ticket_by_product_data
        }

        if all(event_ticket.price == 0 for event_ticket in event_ticket_by_id.values()) and not request.cart.id:
            # all chosen tickets are free AND no existing SO -> skip SO and payment process
            return super()._create_attendees_from_registration_post(event, registration_data)

        order_sudo = request.cart or request.website._create_cart()
        tickets_data = defaultdict(int)
        for data in registration_data:
            event_slot_id = data.get('event_slot_id', False)
            event_ticket_id = data.get('event_ticket_id', False)
            product_combo_item_ids = tuple(data['product_combo_item_ids']) if data.get('product_combo_item_ids') else False
            if event_ticket_id:
                tickets_data[event_slot_id, event_ticket_id, product_combo_item_ids] += 1

        cart_data = {}
        for (slot_id, ticket_id, product_combo_item_ids), count in tickets_data.items():
            ticket_sudo = event_ticket_by_id.get(ticket_id)
            linked_products = False
            if product_combo_item_ids:
                linked_products = [{
                    'product_template_id': product_combo_item_by_id.get(product_combo_item_id).product_id.product_tmpl_id.id,
                    'parent_product_template_id': ticket_sudo.product_id.product_tmpl_id.id,
                    'quantity': count,
                    'combo_item_id': product_combo_item_id,
                    'product_id': product_combo_item_by_id.get(product_combo_item_id).product_id.id,
                } for product_combo_item_id in product_combo_item_ids]
            cart_values = order_sudo._cart_add(
                product_id=ticket_sudo.product_id.id,
                quantity=count,
                event_ticket_id=ticket_id,
                event_slot_id=slot_id,
            )
            if linked_products and cart_values['line_id']:
                line_ids = {ticket_sudo.product_id.product_tmpl_id.id: cart_values['line_id']}
                for product_data in linked_products:
                    order_sudo._cart_add(
                        product_id=product_data['product_id'],
                        quantity=product_data['quantity'],
                        linked_line_id=line_ids[product_data['parent_product_template_id']],
                        combo_item_id=product_data['combo_item_id'],
                        event_ticket_id=ticket_by_product_id.get(product_data['product_id'], False),
                        event_slot_id=slot_id if ticket_by_product_id.get(product_data['product_id']) else False,
                    )

            cart_data[slot_id, ticket_id] = cart_values['line_id']

        for data in registration_data:
            event_slot_id = data.get('event_slot_id', False)
            event_ticket_id = data.get('event_ticket_id', False)
            event_ticket = event_ticket_by_id.get(event_ticket_id)
            if event_ticket:
                data['sale_order_id'] = order_sudo.id
                data['sale_order_line_id'] = cart_data[event_slot_id, event_ticket_id]

        return super()._create_attendees_from_registration_post(event, registration_data)

    @route()
    def registration_confirm(self, event, **post):
        res = super().registration_confirm(event, **post)

        registrations = self._process_attendees_form(event, post)
        registrations_data = list(registrations.values())
        order_sudo = request.cart
        if not any(line.event_ticket_id for line in order_sudo.order_line):
            # order does not contain any tickets, meaning we are confirming a free event
            return res

        # we have at least one registration linked to a ticket -> sale mode activate
        if any(info['event_ticket_id'] for info in registrations_data):
            if order_sudo.amount_total:
                if order_sudo._is_anonymous_cart():
                    booked_by_partner, feedback_dict = CustomerPortal()._create_or_update_address(
                        request.env['res.partner'].sudo(),
                        order_sudo=order_sudo,
                        verify_address_values=False,
                        **registrations_data[0]
                    )
                    if not feedback_dict.get('invalid_fields'):
                        order_sudo._update_address(booked_by_partner.id, ['partner_id'])
                request.session['sale_last_order_id'] = order_sudo.id
                return request.redirect("/shop/checkout?try_skip_step=true")
            else:
                # Free order -> auto confirmation without checkout
                order_sudo.action_confirm()  # tde notsure: email sending ?
                request.website.sale_reset()
                request.session['sale_last_order_id'] = order_sudo.id
                return request.redirect("/shop/confirmation")

        return res
