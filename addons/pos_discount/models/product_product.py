from odoo import models


class ProductProduct(models.Model):
    _inherit = 'product.product'

    _pos_discount__product_product_consumable_optional = models.Ref('pos_discount.product_product_consumable', required=False)
