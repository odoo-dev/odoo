# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    def _compute_priority(self):
        picking_ids_to_compute = self.env['stock.picking']
        for picking in self:
            if picking.sale_id:
                continue
            else:
                picking_ids_to_compute += picking
            super(StockPicking, picking_ids_to_compute)._compute_priority()

    def _get_all_po_pickings(self):
        all_po_pickings = super()._get_all_po_pickings()
        return all_po_pickings.filtered(lambda p: not p.sale_id)
