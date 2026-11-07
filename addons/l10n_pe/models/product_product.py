from odoo import models


class ProductProduct(models.Model):
    _inherit = 'product.product'

    _product__consu_delivery_03 = models.Ref('product.consu_delivery_03', required=False)
    _product__product_delivery_01 = models.Ref('product.product_delivery_01', required=False)
