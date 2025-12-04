# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    def _compute_priority(self):
        picking_ids_to_compute = set()
        for picking in self:
            if picking.sale_id:
                continue
            else:
                picking_ids_to_compute.add(picking.id)
            super(StockPicking, self.env['stock.picking'].browse(picking_ids_to_compute))._compute_priority()

    def _get_all_po_pickings(self):
        all_pickings = super()._get_all_po_pickings()
        return all_pickings.filtered(lambda p: not p.sale_id)
