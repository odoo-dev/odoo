# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    is_unicommerce_order = fields.Boolean()
    unicommerce_invoice_code = fields.Char()
