# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    marketplace_offer_id = fields.Many2one(
        string="Market Place Offer", comodel_name='marketplace.offer', ondelete='set null'
    )
