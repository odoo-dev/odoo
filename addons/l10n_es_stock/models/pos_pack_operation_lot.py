from odoo import api, fields, models


class PosPackOperationLot(models.Model):
    _inherit = 'pos.pack.operation.lot'

    lot_id = fields.Many2one('stock.lot', compute='_compute_lot_id', store=True)
    standard_price = fields.Float()

    @api.depends('lot_name', 'product_id')
    def _compute_lot_id(self):
        for pack in self:
            pack.lot_id = self.env['stock.lot'].search([
                ('name', '=', pack.lot_name),
                ('product_id', '=', pack.product_id.id)
            ], limit=1)

    @api.model
    def _load_pos_data_fields(self, config):
        params = super()._load_pos_data_fields(config)
        params.append('lot_id')
        params.append('standard_price')
        return params
