from odoo.addons.product.tests.common import ProductCommon


class ProductShapeCommon(ProductCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.foot_uom = cls.quick_ref('uom.product_uom_foot')
        cls.cubic_foot_uom = cls.quick_ref('uom.product_uom_cubic_foot')
        cls.kg_uom = cls.quick_ref('uom.product_uom_kgm')
        cls.mm_uom = cls.quick_ref('uom.product_uom_millimeter')
        # timber kept in cubic feet, measured in feet
        cls.teak = cls.env['product.product'].create({
            'name': "Teak Wood",
            'type': 'consu',
            'uom_id': cls.cubic_foot_uom.id,
            'shape_type': 'rectangle',
            'shape_density': 650,
            'shape_dimension_uom_id': cls.foot_uom.id,
        })
        # steel kept in kg, measured in millimetres
        cls.round_bar = cls.env['product.product'].create({
            'name': "Round Bar",
            'type': 'consu',
            'uom_id': cls.kg_uom.id,
            'shape_type': 'round',
            'shape_density': 7850,
            'shape_dimension_uom_id': cls.mm_uom.id,
        })
        cls.teak_size = {'shape_height': 6, 'shape_length': 5, 'shape_width': 7}
