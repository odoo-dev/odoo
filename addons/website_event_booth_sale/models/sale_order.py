# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    def _website_product_id_change(self, order_id, product_id, qty=0):
        # TODO: Check this method
        # order = self.env['sale.order'].sudo().browse(order_id)

        values = super(SaleOrder, self)._website_product_id_change(order_id, product_id, qty=qty)
        event_booth_slot_ids = None
        if self.env.context.get('event_booth_slot_ids'):
            event_booth_slot_ids = self.env.context.get('event_booth_slot_ids')

        if event_booth_slot_ids:
            slots = self.env['event.booth.slot'].browse(event_booth_slot_ids)
            # TODO: Should I test that all registrations belongs to the same event_booth_id ?

            values.update(
                event_id=slots.event_id.id,
                event_booth_id=slots.event_booth_id.id,
                event_booth_slot_ids=slots.ids,
                name=slots._get_booth_multiline_description,
            )

        return values
