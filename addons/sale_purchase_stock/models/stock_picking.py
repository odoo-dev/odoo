# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    def _get_all_po_pickings(self):
        all_pickings = super()._get_all_po_pickings()
        return all_pickings.filtered(lambda p: not p.sale_id or p.purchase_id)
