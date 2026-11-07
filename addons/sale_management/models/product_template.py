from odoo import models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    _product__product_product_11_product_template = models.Ref('product.product_product_11_product_template', required=False)
    _sale__product_product_1_product_template = models.Ref('sale.product_product_1_product_template', required=False)
