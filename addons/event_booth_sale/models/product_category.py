from odoo import models


class ProductCategory(models.Model):
    _inherit = 'product.category'

    _event_product__product_category_events = models.Ref('event_product.product_category_events')
