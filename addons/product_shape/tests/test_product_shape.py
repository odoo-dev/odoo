from odoo.exceptions import ValidationError
from odoo.tests import tagged

from odoo.addons.product_shape.tests.common import ProductShapeCommon


@tagged('post_install', '-at_install')
class TestProductShape(ProductShapeCommon):

    def test_piece_quantity_by_volume(self):
        """A 6 x 5 x 7 ft piece of a product kept in cubic feet is 210 cubic feet."""
        teak = self.teak.product_tmpl_id
        self.assertAlmostEqual(teak._get_shape_piece_quantity(self.teak_size), 210)
        self.assertEqual(teak._get_shape_pcs(420, self.cubic_foot_uom, self.teak_size), 2)
        self.assertEqual(teak._get_shape_lot_name(self.teak_size), "6 x 5 x 7")
        # 420 ft³ = 11.893 m³ of wood at 650 kg/m³
        self.assertAlmostEqual(teak._get_shape_weight(420, self.cubic_foot_uom), 7730.5, places=0)

    def test_piece_quantity_by_weight(self):
        """A 20 mm round bar of steel kept in kg weighs 2.466 kg per metre."""
        bar = self.round_bar.product_tmpl_id
        size = {'shape_width': 20, 'shape_length': 1000}
        self.assertAlmostEqual(bar._get_shape_piece_quantity(size), 2.46615, places=4)
        self.assertEqual(bar._get_shape_pcs(24.66, self.kg_uom, size), 10)
        self.assertEqual(bar._get_shape_lot_name({'shape_width': 20, 'shape_length': 1000.5}), "20 x 1000.5")

    def test_volume_per_shape(self):
        template = self.round_bar.product_tmpl_id
        for shape, size, volume in [
            ('rectangle', {'shape_height': 2, 'shape_length': 10, 'shape_width': 3}, 60),
            ('sheet', {'shape_height': 2, 'shape_length': 10, 'shape_width': 3}, 60),
            ('plate', {'shape_height': 2, 'shape_length': 10, 'shape_width': 3}, 60),
            ('square', {'shape_width': 3, 'shape_length': 10}, 90),
            ('round', {'shape_width': 20, 'shape_length': 1000}, 314159.27),
            ('hexagonal', {'shape_width': 20, 'shape_length': 1000}, 346410.16),
            ('octagonal', {'shape_width': 20, 'shape_length': 1000}, 331370.85),
            ('pipe', {'shape_width': 50, 'shape_height': 5, 'shape_length': 1000}, 706858.35),
            ('tubular', {'shape_width': 50, 'shape_height': 5, 'shape_length': 1000}, 706858.35),
            ('ring', {'shape_width': 100, 'shape_inner_diameter': 50, 'shape_height': 10}, 58904.86),
        ]:
            with self.subTest(shape=shape):
                template.shape_type = shape
                self.assertAlmostEqual(template._get_shape_volume(size), volume, places=2)

    def test_constraints(self):
        with self.assertRaises(ValidationError):
            self.teak.uom_id = self.uom_unit
        with self.assertRaises(ValidationError):
            self.teak.shape_dimension_uom_id = self.kg_uom
        # a product kept by weight needs the density of its material
        with self.assertRaises(ValidationError):
            self.round_bar.shape_density = 0
        # a product kept by volume does not, it is only weighed with it
        self.teak.shape_density = 0
        self.assertEqual(self.teak.product_tmpl_id._get_shape_weight(420, self.cubic_foot_uom), 0)

        pipe = self.round_bar.product_tmpl_id
        pipe.shape_type = 'pipe'
        with self.assertRaises(ValidationError):
            pipe._check_shape_dimensions({'shape_width': 20, 'shape_height': 11, 'shape_length': 1000})
