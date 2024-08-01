# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.fields import Command
from odoo.tests import HttpCase, tagged

from odoo.addons.website_sale.tests.common import WebsiteSaleCommon, mock_website_sale_request
from odoo.addons.website_sale_loyalty.controllers.main import WebsiteSale


@tagged('post_install', '-at_install')
class TestFreeProductReward(HttpCase, WebsiteSaleCommon):

    def setUp(self):
        super().setUp()

        self.WebsiteSaleController = WebsiteSale()

        # Disable any other program
        self.program = self.env['loyalty.program'].search([]).write({'active': False})

        self.sofa, self.carpet = self.env['product.product'].create([
            {
                'name': 'Test Sofa',
                'list_price': 2950.0,
                'website_published': True,
            }, {
                'name': 'Test Carpet',
                'list_price': 500.0,
                'website_published': True,
            },
        ])
        self.program = self.env['loyalty.program'].create({
            'name': 'Get a product for free',
            'program_type': 'promotion',
            'applies_on': 'current',
            'trigger': 'auto',
            'rule_ids': [Command.create({
                'minimum_qty': 1,
                'minimum_amount': 0.00,
                'reward_point_amount': 1,
                'reward_point_mode': 'order',
                'product_ids': self.sofa,
            })],
            'reward_ids': [Command.create({
                'reward_type': 'product',
                'reward_product_id': self.carpet.id,
                'reward_product_qty': 1,
                'required_points': 1,
            })],
        })

        installed_modules = set(self.env['ir.module.module'].search([
            ('state', '=', 'installed'),
        ]).mapped('name'))
        for _ in http._generate_routing_rules(installed_modules, nodb_only=False):
            pass

    def test_add_product_to_cart_when_it_exist_as_free_product(self):
        # This test the flow when we claim a reward in the cart page and then we
        # want to add the product again
        with mock_website_sale_request(self.env, website=self.website) as request:
            self.WebsiteSaleController.cart_update_json(self.sofa.id, set_qty=1)
            self.WebsiteSaleController.claim_reward(self.program.reward_ids[0].id)
            self.WebsiteSaleController.cart_update_json(self.carpet.id, set_qty=1)
            sofa_line = request.cart.order_line.filtered(lambda line: line.product_id.id == self.sofa.id)
            carpet_reward_line = request.cart.order_line.filtered(lambda line: line.product_id.id == self.carpet.id and line.is_reward_line)
            carpet_line = request.cart.order_line.filtered(lambda line: line.product_id.id == self.carpet.id and not line.is_reward_line)
            self.assertEqual(sofa_line.product_uom_qty, 1, "Should have only 1 qty of Sofa")
            self.assertEqual(carpet_reward_line.product_uom_qty, 1, "Should have only 1 qty for the carpet as reward")
            self.assertEqual(carpet_line.product_uom_qty, 1, "Should have only 1 qty for carpet as non reward")
