# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class StockQuant(models.Model):
    _inherit = "stock.quant"

    def _apply_inventory(self, date=None):
        """Override to trigger auto-publish/unpublish after manual inventory adjustments."""
        products = self.product_id.product_tmpl_id
        res = super()._apply_inventory(date=date)
        if products:
            products._check_and_update_website_published()
        return res
