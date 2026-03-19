# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class StockMove(models.Model):
    _inherit = "stock.move"

    def _action_synch_order(self):
        """Override to trigger auto-publish/unpublish after stock moves are validated."""
        res = super()._action_synch_order()
        products = self.product_id.product_tmpl_id
        if products:
            products._check_and_update_website_published()
        return res
