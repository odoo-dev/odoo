from odoo import api, fields, models

from odoo.addons.product_shape.models.product_template import SHAPE_DIMENSION_FIELDS


class StockLot(models.Model):
    _inherit = 'stock.lot'

    shape_type = fields.Selection(related='product_id.shape_type')
    shape_dimension_uom_id = fields.Many2one(related='product_id.shape_dimension_uom_id', string="Size Unit")
    shape_height = fields.Float(
        "Height", digits='Shape Dimension',
        help="Height or thickness of a piece; the wall of a pipe or a tube; the thickness of a ring.")
    shape_length = fields.Float("Length", digits='Shape Dimension', help="Length of a piece.")
    shape_width = fields.Float(
        "Width", digits='Shape Dimension',
        help="Width, diameter or distance across flats of a piece; the outer diameter of a "
             "pipe, a tube or a ring.")
    shape_inner_diameter = fields.Float("Inner Diameter", digits='Shape Dimension', help="Inner diameter of a ring.")
    shape_pcs = fields.Integer(
        "Number of Pcs", compute='_compute_shape_pcs',
        help="Number of pieces on hand: the quantity on hand divided by the quantity of one piece of this size.")
    shape_weight = fields.Float(
        "Weight (kg)", compute='_compute_shape_weight', digits='Stock Weight',
        help="Weight of the quantity on hand.")

    @api.depends('product_qty', 'product_id.shape_type', *SHAPE_DIMENSION_FIELDS)
    def _compute_shape_pcs(self):
        for lot in self:
            template = lot.product_id.product_tmpl_id
            lot.shape_pcs = template._get_shape_pcs(
                lot.product_qty, template.uom_id, lot._get_shape_dimensions()
            ) if template.shape_type else 0

    @api.depends('product_qty', 'product_id.shape_type', 'product_id.shape_density')
    def _compute_shape_weight(self):
        for lot in self:
            template = lot.product_id.product_tmpl_id
            lot.shape_weight = template._get_shape_weight(lot.product_qty, template.uom_id) if template.shape_type else 0.0

    @api.constrains(*SHAPE_DIMENSION_FIELDS)
    def _check_shape_dimensions(self):
        for lot in self.filtered('product_id.shape_type'):
            lot.product_id.product_tmpl_id._check_shape_dimensions(lot._get_shape_dimensions())

    def _get_shape_dimensions(self):
        self.ensure_one()
        return {fname: self[fname] for fname in SHAPE_DIMENSION_FIELDS}

    def _get_shape_piece_quantity(self, uom=None):
        """Return the quantity of one piece of this lot, in `uom` (the unit of the product by default)."""
        self.ensure_one()
        template = self.product_id.product_tmpl_id
        return template._get_shape_piece_quantity(self._get_shape_dimensions(), uom) if template.shape_type else 0.0
