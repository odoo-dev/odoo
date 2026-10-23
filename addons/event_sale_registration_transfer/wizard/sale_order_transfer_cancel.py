# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class SaleOrderTransferCancel(models.TransientModel):
    _name = 'sale.order.transfer.cancel'
    _description = "Cancel Order with Transferred Tickets"

    sale_order_ids = fields.Many2many('sale.order', string="Orders", required=True)
    registration_ids = fields.Many2many('event.registration', string="Transferred Tickets", readonly=True)

    def action_cancel_order(self):
        self.ensure_one()
        return self.sale_order_ids.with_context(skip_registration_transfer_warning=True).action_cancel()
