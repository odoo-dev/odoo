# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class EventEvent(models.Model):
    _inherit = 'event.event'

    def _to_structured_data_ticket_offer(self, ticket):
        """Add ticket pricing to the structured data offer.

        Uses the tax-included or tax-excluded price depending on the
        website ``show_line_subtotals_tax_selection`` setting, matching
        the price displayed on the event page.
        """
        offer_jsonld = super()._to_structured_data_ticket_offer(ticket)
        website = self.env['website'].get_current_website()
        if website.show_line_subtotals_tax_selection == 'tax_excluded':
            price = ticket.total_price_reduce
        else:
            price = ticket.total_price_reduce_taxinc
        offer_jsonld.set({
            'price': price,
            'priceCurrency': self.company_id.currency_id.name,
        })
        return offer_jsonld
