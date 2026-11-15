from odoo import api, fields, models

from odoo.addons.product_shape.models.product_template import SHAPE_DIMENSION_FIELDS


class StockQuant(models.Model):
    _inherit = 'stock.quant'

    shape_type = fields.Selection(related='product_id.shape_type')
    shape_pcs = fields.Integer(
        "Number of Pcs", compute='_compute_shape_pcs',
        help="Number of pieces on hand: the quantity divided by the quantity of one piece of the size of the lot.")
    shape_weight = fields.Float(
        "Weight (kg)", compute='_compute_shape_weight', digits='Stock Weight',
        help="Weight of the quantity on hand.")
    inventory_shape_pcs = fields.Integer(
        "Counted Pcs",
        help="Number of pieces counted. Setting it sets the counted quantity to the quantity of "
             "these pieces, of the size of the lot.")

    @api.depends('quantity', 'uom_id', 'product_id.shape_type', *(f'lot_id.{fname}' for fname in SHAPE_DIMENSION_FIELDS))
    def _compute_shape_pcs(self):
        for quant in self:
            template = quant.product_id.product_tmpl_id
            quant.shape_pcs = template._get_shape_pcs(
                quant.quantity, quant.uom_id, quant.lot_id._get_shape_dimensions()
            ) if template.shape_type and quant.lot_id else 0

    @api.depends('quantity', 'uom_id', 'product_id.shape_type', 'product_id.shape_density')
    def _compute_shape_weight(self):
        for quant in self:
            template = quant.product_id.product_tmpl_id
            quant.shape_weight = template._get_shape_weight(quant.quantity, quant.uom_id) if template.shape_type else 0.0

    @api.onchange('inventory_shape_pcs')
    def _onchange_inventory_shape_pcs(self):
        if self.product_id.shape_type and self.lot_id:
            self.inventory_quantity = self.inventory_shape_pcs * self.lot_id._get_shape_piece_quantity(self.uom_id)

    @api.model
    def _get_inventory_fields_write(self):
        return super()._get_inventory_fields_write() + ['inventory_shape_pcs']

    def _apply_inventory(self, date=None):
        res = super()._apply_inventory(date)
        self.inventory_shape_pcs = 0
        return res

    def action_clear_inventory_quantity(self):
        res = super().action_clear_inventory_quantity()
        self.inventory_shape_pcs = 0
        return res
