from odoo import models


class ProductProduct(models.Model):
    _inherit = 'product.product'

    _l10n_pk_edi_pos__product_product_fbr_service_fee = models.Ref('l10n_pk_edi_pos.product_product_fbr_service_fee', required=False)
