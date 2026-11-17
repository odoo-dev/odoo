# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class EventTypeBooth(models.Model):
    _inherit = 'event.type.booth'

    product_id = fields.Many2one(related='booth_category_id.product_id')
    price = fields.Float(related='booth_category_id.price', store=True)
    currency_id = fields.Many2one(related='booth_category_id.currency_id')
