from odoo import models


class ProductProduct(models.Model):
    _inherit = 'product.product'

    _l10n_in_boe__product_custom_duty = models.Ref('l10n_in_boe.product_custom_duty', required=False)
