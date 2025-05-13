# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests.common import TransactionCase


class TestProductTemplateCategoryAndAttributes(TransactionCase):
    @classmethod
    def setUpClass(self):
        super().setUpClass()

        self.fifo_category = self.env['product.category'].create({
            'name': 'All/Saleable FIFO',
            'parent_id': self.env.ref('product.product_category_all').id,
            'property_cost_method': 'fifo',
        })

        self.attribute_legs = self.env['product.attribute'].create({
            'name': 'Legs',
            'value_ids': [
                (0, 0, {'name': 'Steel'}),
                (0, 0, {'name': 'Aluminium'}),
            ]
        })

    def test_update_categ_and_add_attributes(self):
        ProductTemplate = self.env['product.template'].with_context(tracking_disable=True)

        product_tmpl = ProductTemplate.create({
            'name': 'Test product template with category',
            'is_storable': True,
            'type': 'consu',
            'standard_price': 20.0,
        })

        product_tmpl.write({
            'categ_id': self.fifo_category.id,
            'attribute_line_ids': [(0, 0, {
                'attribute_id': self.attribute_legs.id,
                'value_ids': [(6, 0, self.attribute_legs.value_ids.ids)]
            })]
        })

        self.assertEqual(len(product_tmpl.product_variant_ids), 2, "Expected 2 product variants after attribute update.")