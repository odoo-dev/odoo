from odoo import models


class PosCategory(models.Model):
    _inherit = 'pos.category'

    _pos_restaurant__pos_category_cocktails = models.Ref('pos_restaurant.pos_category_cocktails', required=False)
