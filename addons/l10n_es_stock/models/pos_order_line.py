from odoo import api, fields, models


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    purchase_price = fields.Float(compute='_compute_purchase_price', store=True)
    total_cost = fields.Float(compute='_compute_purchase_price', store=True)

    @api.depends('pack_lot_ids', 'product_id', 'qty')
    def _compute_purchase_price(self):
        for line in self:
            lots = line.pack_lot_ids.mapped('lot_id')
            if lots:
                line.total_cost = sum(lots.mapped('lot_purchase_price'))
                line.purchase_price = line.total_cost / len(lots) if len(lots) else 0.0
            else:
                line.purchase_price = line.product_id.standard_price
                line.total_cost = 0
