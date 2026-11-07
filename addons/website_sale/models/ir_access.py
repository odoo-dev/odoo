from odoo import models


class IrAccess(models.Model):
    _inherit = 'ir.access'

    _product__product_pricelist_comp_rule = models.Ref('product.product_pricelist_comp_rule', 'ir.access', required=False)
    _product__product_pricelist_item_comp_rule = models.Ref('product.product_pricelist_item_comp_rule', 'ir.access', required=False)
