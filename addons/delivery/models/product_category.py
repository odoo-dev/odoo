# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)


class ProductCategory(models.Model):
    _inherit = "product.category"

    _delivery_category = models.Ref(
        'delivery.product_category_deliveries', 'product.category',
        message=_lt("You cannot delete this product category as it is used on the products linked to delivery methods."),
    )
