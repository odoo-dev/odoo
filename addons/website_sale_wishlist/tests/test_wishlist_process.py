# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.fields import Command
from odoo.tests import HttpCase, tagged


@tagged('-at_install', 'post_install')
class TestWishlistProcess(HttpCase):

    def test_01_wishlist_tour(self):
        self.env['product.template'].search([]).write({'website_published': False})
        # Setup attributes and attributes values
        attributes = self.env['product.attribute'].create([
            {
                'name': 'Legs',
                'sequence': 10,
                'value_ids': [
                    Command.create({
                        'name': 'Steel',
                        'sequence': 1,
                    }),
                    Command.create({
                        'name': 'Aluminium',
                        'sequence': 2,
                    }),
                ],
            }, {
                'name': 'Color',
                'sequence': 20,
                'value_ids': [
                    Command.create({
                        'name': 'White',
                        'sequence': 1,
                    }),
                    Command.create({
                        'name': 'Black',
                        'sequence': 2,
                    }),
                ],
            },
        ])

        # Create product template
        self.env['product.template'].create({
            'name': 'Customizable Desk (TEST)',
            'standard_price': 500.0,
            'list_price': 750.0,
            'website_published': True,
            'attribute_line_ids': [
                Command.create({
                    'attribute_id': attribute.id,
                    'value_ids': [Command.set(attribute.value_ids.ids)]
                }) for attribute in attributes
            ],
        })

        self.env.ref('base.user_admin').name = 'Mitchell Admin'

        self.start_tour("/", 'shop_wishlist')

    def test_02_wishlist_admin_tour(self):
        attribute = self.env['product.attribute'].create({
            'name': 'color',
            'display_type': 'color',
            'create_variant': 'always',
            'value_ids': [
                Command.create({'name': 'red'}),
                Command.create({'name': 'blue'}),
                Command.create({'name': 'black'}),
            ]
        })
        self.env['product.template'].create({
            'name': 'Rock',
            'is_published': True,
            'attribute_line_ids': [
                Command.create({
                    'attribute_id': attribute.id,
                    'value_ids': [Command.set(attribute.value_ids.ids)],
                }),
            ],
        })
        self.start_tour("/", 'shop_wishlist_admin', login="admin")

    def test_03_wishlist_tour_for_unpublished_product(self):

        self.env['product.template'].search([]).write({'website_published': False})
        # Setup attributes and attributes values
        product_attribute_2 = self.env['product.attribute'].create({
            'name': 'Color',
            'sequence': 20,
        })
        product_attribute_value_3 = self.env['product.attribute.value'].create({
            'name': 'White',
            'attribute_id': product_attribute_2.id,
            'sequence': 1,
        })
        product_attribute_value_4 = self.env['product.attribute.value'].create({
            'name': 'Black',
            'attribute_id': product_attribute_2.id,
            'sequence': 2,
        })

        # Create product template
        self.product_product_4_product_template = self.env['product.template'].create({
            'name': 'Flipover (TEST)',
            'standard_price': 1959.0,
            'list_price': 750.0,
            'website_published': False,
        })

        # Generate variants
        self.env['product.template.attribute.line'].create([{
            'product_tmpl_id': self.product_product_4_product_template.id,
            'attribute_id': product_attribute_2.id,
            'value_ids': [(4, product_attribute_value_3.id), (4, product_attribute_value_4.id)],

        }])

        self.env.ref('base.user_admin').name = 'Mitchell Admin'

        self.start_tour("/", 'check_shop_wishlist_icon', login="admin")
