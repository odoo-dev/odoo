# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models
from odoo.tools import BinaryBytes, file_open


class ProductTemplate(models.Model):
    _inherit = "product.template"

    @api.model_create_multi
    def create(self, vals_list):
        """Override of `product` to set a default image for gift cards."""
        templates = super().create(vals_list)
        if templates and self.env.context.get("loyalty_is_gift_card_product"):
            with file_open("loyalty/static/img/gift_card.png", "rb") as file:
                templates.image_1920 = BinaryBytes(file.read())
        return templates
