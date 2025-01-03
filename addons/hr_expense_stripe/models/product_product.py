from odoo import fields, models


class ProductProduct(models.Model):
    _inherit = 'product.product'

    mcc_code_ids = fields.One2many(comodel_name='product.mcc.stripe.tag', inverse_name='product_id', string="Merchant Category Code")
