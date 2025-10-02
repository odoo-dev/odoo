from odoo import api, models


class EventEventTicket(models.Model):
    _inherit = 'event.event.ticket'
    _order = "event_id, sequence, price, name, id"

    @api.depends('registration_ids.related_event_ticket_id')
    def _compute_seats(self):
        # As now, it's possible to have combo option tickets, we need to take into account
        # all tickets of the event to compute correctly the seats
        tickets = self.event_id.event_ticket_ids
        super(EventEventTicket, tickets)._compute_seats()

    def _get_compute_seats_fields_to_flush(self):
        fields_list = super()._get_compute_seats_fields_to_flush()
        fields_list.append('related_event_ticket_id')
        return fields_list

    def _get_compute_seats_args(self):
        args = super()._get_compute_seats_args()
        args.append('related_event_ticket_id')
        return args

    def _get_compute_seats_orderby(self):
        orderby = super()._get_compute_seats_orderby()
        orderby.append('related_event_ticket_id')
        return orderby

    @api.model
    def _get_compute_seats_query_results(self, query_res):
        state_field = {
            'open': 'seats_reserved',
            'done': 'seats_used',
        }
        results = {}
        for event_ticket_id, state, num, related_event_ticket_id in query_res:
            results.setdefault(event_ticket_id, {})[state_field[state]] = num
            if related_event_ticket_id:
                if related_event_ticket_id not in results:
                    results.setdefault(related_event_ticket_id, {})[state_field[state]] = num
                else:
                    results[related_event_ticket_id][state_field[state]] += num
        return results

    def _get_ticket_multiline_description(self):
        """ If people set a description on their product it has more priority
        than the ticket name itself for the SO description. """
        self.ensure_one()
        if self.product_id.description_sale:
            return '%s\n%s' % (self.product_id.description_sale, self.event_id.display_name)
        return super()._get_ticket_multiline_description()
