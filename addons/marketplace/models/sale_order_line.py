# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    marketplace_line_identifier = fields.Char(string="Marketplace Line Identifier", readonly=True)

    marketplace_offer_id = fields.Many2one(
        string="Marketplace Offer", comodel_name='marketplace.offer', ondelete='set null'
    )
    marketplace_account_id = fields.Many2one(
        related="order_id.marketplace_account_id",
        # related="marketplace_offer_id.marketplace_account_id",
        store=True,
    )

    _unique_marketplace_account_marketplace_line_identifier = models.Constraint(
        "UNIQUE(marketplace_account_id, marketplace_line_identifier)",
        "Marketplace order line identifier should be unique per marketplace account."
    )
