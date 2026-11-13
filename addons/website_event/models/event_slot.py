from datetime import datetime

from odoo import models


class EventSlot(models.Model):
    _inherit = "event.slot"

    def _filter_open_slots(self):
        """ Keep upcoming slots having seats available for at least one ticket.
        Availabilities are fetched once per event instead of once per slot. """
        now = datetime.now()
        open_slot_ids = set()
        for event, slots in self.filtered(lambda slot: slot.start_datetime > now).grouped('event_id').items():
            slot_tickets = [(slot, ticket) for slot in slots for ticket in event.event_ticket_ids or [False]]
            open_slot_ids.update(
                slot.id
                for (slot, _ticket), availability in zip(slot_tickets, event._get_seats_availability(slot_tickets))
                if availability is None or availability > 0
            )
        return self.filtered(lambda slot: slot.id in open_slot_ids)
