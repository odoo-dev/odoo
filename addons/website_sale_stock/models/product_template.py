# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ProductTemplate(models.Model):
    _inherit = "product.template"

    def _prepare_delivery_availability_info(self, product_sudo, uom, website, **kwargs):
        kwargs.setdefault("warehouse_id", website.warehouse_id.id)
        return super()._prepare_delivery_availability_info(product_sudo, uom, website, **kwargs)
