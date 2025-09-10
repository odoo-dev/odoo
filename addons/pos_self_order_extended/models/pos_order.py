# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api


class PosOrder(models.Model):
    _inherit = "pos.order"

    contact_number = fields.Char()

    @api.depends('contact_number')
    def _compute_contact_details(self):
        super()._compute_contact_details()
        for order in self:
            if not order.mobile:
                order.mobile = order.contact_number

    def get_order_data(self):
        """Return basic POS receipt data as a dictionary."""
        self.ensure_one()
        order = {
            'id': self.id,
            'pos_reference': self.pos_reference,
            'tracking_number': self.tracking_number,
            'date_order': self.date_order.strftime("%Y-%m-%d %H:%M:%S") if self.date_order else False,
            'amount_total': self.amount_total,
            'amount_tax': self.amount_tax,
            'amount_paid': self.amount_paid,
            'amount_return': self.amount_return,
            'amount_subtotal': self.amount_total - self.amount_tax,
            'contact_number': self.contact_number,
            'lines': [],
        }

        for line in self.lines:
            order['lines'].append({
                'product_name': line.product_id.display_name,
                'qty': line.qty,
                'price_unit': line.price_unit,
                'discount': line.discount,
                'price_subtotal': line.price_subtotal,            # excl. tax
                'price_subtotal_incl': line.price_subtotal_incl,  # incl. tax
            })

        return order
