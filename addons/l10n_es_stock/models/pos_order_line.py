from odoo import api, fields, models


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    purchase_price = fields.Float(compute='_compute_purchase_price', store=True)

    @api.depends('pack_lot_ids.standard_price', 'product_id')
    def _compute_purchase_price(self):
        for line in self:
            lots = line.pack_lot_ids
            if lots:
                line.purchase_price = sum(lots.mapped('standard_price')) / len(lots)
            else:
                line.purchase_price = line.product_id.standard_price

    @api.model
    def get_existing_lots(self, company_id, config_id, product_id):
        result = super().get_existing_lots(company_id, config_id, product_id)
        lots = self.env['stock.lot'].sudo().browse([r['id'] for r in result])
        cost_by_lot_id = {lot.id: lot.standard_price for lot in lots}
        for r in result:
            r['standard_price'] = cost_by_lot_id.get(r['id'], 0.0)
        return result