from odoo import models


class ProductProduct(models.Model):
    _inherit = 'product.product'

    _product__consu_delivery_02 = models.Ref('product.consu_delivery_02', required=False)
    _product__monitor_stand = models.Ref('product.monitor_stand', required=False)
    _product__product_delivery_01 = models.Ref('product.product_delivery_01', required=False)
    _product__product_product_16 = models.Ref('product.product_product_16', required=False)
    _product__product_product_4c = models.Ref('product.product_product_4c', required=False)
