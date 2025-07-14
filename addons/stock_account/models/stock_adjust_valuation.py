from odoo import api, fields, models


class StockAdjustValuation(models.Model):
    _name = 'stock.adjust.valuation'
    _description = 'Inventory Valuation Adjustment'

    product_id = fields.Many2one('product.product', string='Product')
    move_ids = fields.Many2many(
        'stock.move', 'stock_move_adjustment_rel', 'adjustment_id', 'move_id', string='Moves')
    company_id = fields.Many2one(
        'res.company', string='Company', required=True,
        default=lambda self: self.env.company)
    quantity = fields.Float(string='Quantity', compute="_compute_quantity")
    current_value = fields.Monetary(
        string='Current Value', currency_field='currency_id',
        compute='_compute_current_value', readonly=True)
    new_value = fields.Monetary(string='New Value', currency_field='currency_id', required=True)
    new_value_by_unit = fields.Monetary(
        string='New Value by Unit', currency_field='currency_id',
        compute="_compute_new_value_by_unit")
    extra_value = fields.Float(string='Extra Value', compute="_compute_extra_value")
    currency_id = fields.Many2one('res.currency', string='Currency', related="company_id.currency_id")
    date = fields.Datetime(string='Date', required=True, default=fields.Datetime.now)
    description = fields.Text(string='Comment')

    @api.depends('move_ids')
    def _compute_quantity(self):
        for revaluation in self:
            revaluation.quantity = sum(revaluation.move_ids.mapped('product_qty'))

    @api.depends('move_ids')
    def _compute_current_value(self):
        for revaluation in self:
            revaluation.current_value = sum(move._get_value()[0] for move in revaluation.move_ids)

    def _compute_extra_value(self):
        for revaluation in self:
            revaluation.extra_value = revaluation.new_value - revaluation.current_value

    @api.depends('new_value', 'quantity')
    def _compute_new_value_by_unit(self):
        for revaluation in self:
            revaluation.new_value_by_unit = revaluation.new_value / revaluation.quantity if revaluation.quantity else 0.0

    def action_revalue(self):
        pass
        # self.move_ids._set_value()
