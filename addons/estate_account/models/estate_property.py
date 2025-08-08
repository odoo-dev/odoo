from odoo import Command, models
import logging


class EstateProperty(models.Model):
    _inherit = "estate.property"

    def action_estate_property_sold(self):
        invoice_lines = [
            {'name': 'admin fees', 'price_unit': 100, 'quantity': 1},
            {'name': '6% of the seeling price cause why not ig',
             'price_unit': self.selling_price * 0.06, 'quantity': 1},
        ]

        self.env['account.move'].create({
            'partner_id': self.partner_id.id,
            'move_type': 'out_invoice',
            'invoice_line_ids':  [Command.create(line)
                          for line in invoice_lines],
        })

        # call parent implementation and return its result
        return super().action_estate_property_sold()
