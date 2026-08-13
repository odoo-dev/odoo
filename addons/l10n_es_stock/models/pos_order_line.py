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

    @api.model
    def get_existing_lots(self, company_id, config_id, product_id):
        result = super().get_existing_lots(company_id, config_id, product_id)
        lots = self.env['stock.lot'].sudo().browse([r['id'] for r in result])
        cost_by_lot_id = {lot.id: lot.standard_price for lot in lots}
        for r in result:
            r['standard_price'] = cost_by_lot_id.get(r['id'], 0.0)
        return result
