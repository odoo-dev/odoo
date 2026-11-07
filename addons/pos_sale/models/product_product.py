from odoo import models


class ProductProduct(models.Model):
    _inherit = 'product.product'

    _pos_sale__default_downpayment_product = models.Ref('pos_sale.default_downpayment_product', required=False)
    _pos_sale__default_sol_product = models.Ref('pos_sale.default_sol_product', required=False)
