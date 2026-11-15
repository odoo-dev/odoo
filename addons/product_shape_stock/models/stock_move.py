from odoo import fields, models


class StockMove(models.Model):
    _inherit = 'stock.move'

    # read by the detailed operations to show the size columns of the move lines
    shape_type = fields.Selection(related='product_id.shape_type')
    shape_dimension_uom_id = fields.Many2one(related='product_id.shape_dimension_uom_id')
