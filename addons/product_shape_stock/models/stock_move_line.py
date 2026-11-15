from odoo import api, fields, models

from odoo.addons.product_shape.models.product_template import SHAPE_DIMENSION_FIELDS


class StockMoveLine(models.Model):
    _inherit = 'stock.move.line'

    shape_height = fields.Float(
        "Height", digits='Shape Dimension',
        help="Height or thickness of a piece; the wall of a pipe or a tube; the thickness of a ring.")
    shape_length = fields.Float("Length", digits='Shape Dimension', help="Length of a piece.")
    shape_width = fields.Float(
        "Width", digits='Shape Dimension',
        help="Width, diameter or distance across flats of a piece; the outer diameter of a "
             "pipe, a tube or a ring.")
    shape_inner_diameter = fields.Float("Inner Diameter", digits='Shape Dimension', help="Inner diameter of a ring.")
    shape_pcs = fields.Integer("Number of Pcs", help="Number of pieces of this size.")

    @api.onchange('lot_id')
    def _onchange_shape_lot(self):
        # pieces taken from stock have the size of their lot
        if self.lot_id and self.product_id.shape_type:
            self.update(self.lot_id._get_shape_dimensions())
            self._onchange_shape_quantity()

    @api.onchange('shape_pcs', *SHAPE_DIMENSION_FIELDS)
    def _onchange_shape_quantity(self):
        template = self.product_id.product_tmpl_id
        if not template.shape_type:
            return
        dimensions = self._get_shape_dimensions()
        if not self.lot_id and any(dimensions.values()):
            # received pieces go to the lot of their size
            self.lot_name = template._get_shape_lot_name(dimensions)
        if self.shape_pcs:
            self.quantity = self.shape_pcs * template._get_shape_piece_quantity(dimensions, self.uom_id)

    @api.model_create_multi
    def create(self, vals_list):
        move_lines = super().create(vals_list)
        for move_line, vals in zip(move_lines, vals_list):
            move_line._update_shape_values(vals)
        return move_lines

    def write(self, vals):
        res = super().write(vals)
        if {'lot_id', 'quantity'} & vals.keys():
            for move_line in self:
                move_line._update_shape_values(vals)
        return res

    def _update_shape_values(self, vals):
        """Complete the size and the number of pieces that `vals` does not give: the size of the
        lot, and the number of pieces of the quantity, as for lines reserved by the system.
        """
        self.ensure_one()
        template = self.product_id.product_tmpl_id
        if not template.shape_type:
            return
        shape_vals = {}
        if self.lot_id and not vals.keys() & set(SHAPE_DIMENSION_FIELDS) and not any(self._get_shape_dimensions().values()):
            shape_vals.update(self.lot_id._get_shape_dimensions())
        if 'shape_pcs' not in vals and ('quantity' in vals or shape_vals):
            dimensions = {**self._get_shape_dimensions(), **shape_vals}
            shape_vals['shape_pcs'] = template._get_shape_pcs(self.quantity, self.uom_id, dimensions)
        if shape_vals and any(self[fname] != value for fname, value in shape_vals.items()):
            self.write(shape_vals)

    def _get_shape_dimensions(self):
        self.ensure_one()
        return {fname: self[fname] for fname in SHAPE_DIMENSION_FIELDS}

    def _prepare_new_lot_vals(self):
        vals = super()._prepare_new_lot_vals()
        if self.product_id.shape_type:
            vals.update(self._get_shape_dimensions())
        return vals

    def _create_and_assign_production_lot(self):
        # pieces of a size received before go to its existing lot
        shaped_lines = self.filtered(lambda ml: ml.product_id.shape_type and ml.lot_name)
        if shaped_lines:
            lots = self.env['stock.lot'].search([
                ('product_id', 'in', shaped_lines.product_id.ids),
                ('name', 'in', list(set(shaped_lines.mapped('lot_name')))),
                ('company_id', 'in', shaped_lines.company_id.ids + [False]),
            ])
            lot_by_key = {(lot.product_id.id, lot.name): lot for lot in lots}
            for move_line in shaped_lines:
                if lot := lot_by_key.get((move_line.product_id.id, move_line.lot_name)):
                    move_line.lot_id = lot
        return super(StockMoveLine, self.filtered(lambda ml: not ml.lot_id))._create_and_assign_production_lot()
