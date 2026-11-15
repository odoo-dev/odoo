from math import pi, sqrt

from odoo import api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools import float_round

SHAPE_SELECTION = [
    ('rectangle', "Rectangle"),
    ('sheet', "Sheet"),
    ('plate', "Plate"),
    ('square', "Square"),
    ('pipe', "Pipe"),
    ('tubular', "Tubular"),
    ('round', "Round"),
    ('hexagonal', "Hexagonal"),
    ('octagonal', "Octagonal"),
    ('ring', "Ring"),
]
SHAPE_DIMENSION_FIELDS = ('shape_height', 'shape_length', 'shape_width', 'shape_inner_diameter')

# Dimensions each shape is measured with, in the order they name a size ("6 x 5 x 7"):
# - shape_width: the width, the diameter, or the distance across flats of a hexagon or an
#   octagon; the outer diameter of a pipe, a tube or a ring
# - shape_height: the height or thickness of a rectangle, a sheet or a plate; the wall of a
#   pipe or a tube; the thickness of a ring
# - shape_inner_diameter: the inner diameter of a ring
SHAPE_DIMENSIONS = {
    'rectangle': ('shape_height', 'shape_length', 'shape_width'),
    'sheet': ('shape_height', 'shape_length', 'shape_width'),
    'plate': ('shape_height', 'shape_length', 'shape_width'),
    'square': ('shape_width', 'shape_length'),
    'round': ('shape_width', 'shape_length'),
    'hexagonal': ('shape_width', 'shape_length'),
    'octagonal': ('shape_width', 'shape_length'),
    'pipe': ('shape_width', 'shape_height', 'shape_length'),
    'tubular': ('shape_width', 'shape_height', 'shape_length'),
    'ring': ('shape_width', 'shape_inner_diameter', 'shape_height'),
}


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    def _default_shape_dimension_uom_id(self):
        return self.env.ref('uom.product_uom_millimeter', raise_if_not_found=False)

    shape_type = fields.Selection(
        SHAPE_SELECTION, string="Material Shape",
        help="Shape of the pieces of this product. The pieces are received and issued with "
             "their size and number, which give the quantity, and each size is kept in its own lot.")
    shape_density = fields.Float(
        "Material Density (kg/m³)", digits=(16, 2),
        help="Mass of one cubic metre of the material, to weigh the pieces.")
    shape_dimension_uom_id = fields.Many2one(
        'uom.uom', string="Size Unit", default=_default_shape_dimension_uom_id,
        help="Unit of length the sizes of the pieces are measured in.")

    @api.constrains('shape_type', 'shape_density', 'shape_dimension_uom_id', 'uom_id')
    def _check_shape(self):
        refs = self._get_shape_reference_uoms()
        for template in self.filtered('shape_type'):
            if not template.shape_dimension_uom_id \
                    or not template.shape_dimension_uom_id._has_common_reference(refs['length']):
                raise ValidationError(self.env._(
                    "The sizes of product %(product)s must be measured in a unit of length, such as %(unit)s.",
                    product=template.display_name, unit=refs['length'].name))
            uom_kind = template._get_shape_uom_kind(template.uom_id)
            if not uom_kind:
                raise ValidationError(self.env._(
                    "Product %(product)s has a shape, its unit must be a unit of volume or of weight, such as %(volume)s or %(weight)s.",
                    product=template.display_name, volume=refs['volume'].name, weight=refs['weight'].name))
            if uom_kind == 'weight' and template.shape_density <= 0:
                raise ValidationError(self.env._(
                    "Product %s is counted by weight, give the density of its material.", template.display_name))

    def _get_shape_reference_uoms(self):
        return {
            'length': self.env.ref('uom.product_uom_meter'),
            'volume': self.env.ref('uom.product_uom_cubic_meter'),
            'weight': self.env.ref('uom.product_uom_kgm'),
        }

    def _get_shape_uom_kind(self, uom):
        """Return 'volume' or 'weight' when `uom` measures one of them, else False."""
        refs = self._get_shape_reference_uoms()
        if uom and uom._has_common_reference(refs['volume']):
            return 'volume'
        if uom and uom._has_common_reference(refs['weight']):
            return 'weight'
        return False

    def _check_shape_dimensions(self, dimensions):
        """Raise a ValidationError when `dimensions` cannot describe a piece of this shape.

        :param dict dimensions: {field name: size}, in `shape_dimension_uom_id`
        """
        self.ensure_one()
        if any(value < 0 for value in dimensions.values()):
            raise ValidationError(self.env._("The size of a piece cannot be negative."))
        if self.shape_type in ('pipe', 'tubular') \
                and 2 * dimensions.get('shape_height', 0) > dimensions.get('shape_width', 0) > 0:
            raise ValidationError(self.env._(
                "The wall of a pipe or a tube cannot be thicker than half its outer diameter."))
        if self.shape_type == 'ring' \
                and dimensions.get('shape_inner_diameter', 0) >= dimensions.get('shape_width', 0) > 0:
            raise ValidationError(self.env._(
                "The inner diameter of a ring must be smaller than its outer diameter."))

    def _get_shape_volume(self, dimensions):
        """Return the volume of one piece of this shape, in the cube of `shape_dimension_uom_id`.

        :param dict dimensions: {field name: size}, in `shape_dimension_uom_id`
        """
        self.ensure_one()
        length = dimensions.get('shape_length', 0.0)
        width = dimensions.get('shape_width', 0.0)
        height = dimensions.get('shape_height', 0.0)
        match self.shape_type:
            case 'rectangle' | 'sheet' | 'plate':
                volume = length * width * height
            case 'square':
                volume = width ** 2 * length
            case 'round':
                volume = pi / 4 * width ** 2 * length
            case 'hexagonal':
                volume = sqrt(3) / 2 * width ** 2 * length
            case 'octagonal':
                volume = 2 * (sqrt(2) - 1) * width ** 2 * length
            case 'pipe' | 'tubular':
                volume = pi * (width - height) * height * length
            case 'ring':
                volume = pi / 4 * (width ** 2 - dimensions.get('shape_inner_diameter', 0.0) ** 2) * height
            case _:
                volume = 0.0
        return max(volume, 0.0)

    def _get_shape_piece_quantity(self, dimensions, uom=None):
        """Return the quantity of one piece of the given size, in `uom` (the unit of the
        product by default), or 0 when `uom` is neither a unit of volume nor of weight.
        """
        self.ensure_one()
        uom = uom or self.uom_id
        refs = self._get_shape_reference_uoms()
        metre = self.shape_dimension_uom_id._compute_quantity(1, refs['length'], round=False)
        cubic_metres = self._get_shape_volume(dimensions) * metre ** 3
        match self._get_shape_uom_kind(uom):
            case 'volume':
                return refs['volume']._compute_quantity(cubic_metres, uom, round=False)
            case 'weight':
                return refs['weight']._compute_quantity(cubic_metres * self.shape_density, uom, round=False)
        return 0.0

    def _get_shape_pcs(self, quantity, uom, dimensions):
        """Return the number of pieces of the given size that make `quantity` `uom`."""
        self.ensure_one()
        piece_quantity = self._get_shape_piece_quantity(dimensions, uom)
        if not piece_quantity:
            return 0
        return int(float_round(quantity / piece_quantity, precision_digits=0))

    def _get_shape_weight(self, quantity, uom):
        """Return the weight of `quantity` `uom` of this product, in kg."""
        self.ensure_one()
        refs = self._get_shape_reference_uoms()
        match self._get_shape_uom_kind(uom):
            case 'volume':
                return uom._compute_quantity(quantity, refs['volume'], round=False) * self.shape_density
            case 'weight':
                return uom._compute_quantity(quantity, refs['weight'], round=False)
        return 0.0

    def _get_shape_lot_name(self, dimensions):
        """Return the name of the lot of the pieces of the given size, such as "6 x 5 x 7"."""
        self.ensure_one()
        digits = self.env['decimal.precision'].precision_get('Shape Dimension')
        return " x ".join(
            ('%.*f' % (digits, dimensions.get(fname, 0.0))).rstrip('0').rstrip('.')
            for fname in SHAPE_DIMENSIONS.get(self.shape_type, ())
        )
