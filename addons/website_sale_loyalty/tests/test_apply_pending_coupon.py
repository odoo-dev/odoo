# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.tests import HttpCase, tagged

from odoo.addons.sale_loyalty.tests.common import TestSaleCouponNumbersCommon
from odoo.addons.website_sale.tests.common import WebsiteSaleCommon, mock_website_sale_request
from odoo.addons.website_sale_loyalty.controllers.main import WebsiteSale


@tagged('-at_install', 'post_install')
class TestSaleCouponApplyPending(HttpCase, TestSaleCouponNumbersCommon, WebsiteSaleCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.global_program = cls.p1
        cls.coupon_program = cls.env['loyalty.program'].create({
            'name': 'One Free Product',
            'program_type': 'coupons',
            'rule_ids': [(0, 0, {
                'minimum_qty': 2,
            })],
            'reward_ids': [(0, 0, {
                'reward_type': 'product',
                'reward_product_id': cls.largeCabinet.id,
            })]
        })
        cls.env['loyalty.generate.wizard'].with_context(active_id=cls.coupon_program.id).create({
            'coupon_qty': 1,
            'points_granted': 1,
        }).generate_coupons()
        cls.coupon = cls.coupon_program.coupon_ids[0]
        installed_modules = set(cls.env['ir.module.module'].search([
            ('state', '=', 'installed'),
        ]).mapped('name'))
        for _ in http._generate_routing_rules(installed_modules, nodb_only=False):
            pass

    def setUp(self):
        super().setUp()

        self.WebsiteSaleController = WebsiteSale()

    def test_01_activate_coupon_with_existing_program(self):
        self.env['product.pricelist.item'].search([]).unlink()

        with mock_website_sale_request(self.env, website=self.website) as request:
            self.WebsiteSaleController.cart_update_json(self.largeCabinet.id, set_qty=2)
            self.WebsiteSaleController.pricelist(self.global_program.rule_ids.code)
            self.assertEqual(request.cart.amount_total, 576, "The order total should equal 576: 2*320 - 10% discount ")
            self.assertEqual(len(request.cart.order_line), 2, "There should be 2 lines 1 for the product and 1 for the discount")

            self.WebsiteSaleController.activate_coupon(self.coupon.code)
            promo_code = request.session.get('pending_coupon_code')
            self.assertFalse(promo_code, "The promo code should be removed from the pending coupon dict")
            self.assertEqual(request.cart.amount_total, 576, "The order total should equal 576: 2*320 - 0 (free product) - 10%")
            self.assertEqual(len(request.cart.order_line), 3, "There should be 3 lines 1 for the product, 1 for the free product and 1 for the discount")

    def test_02_pending_coupon_with_existing_program(self):
        self.env['product.pricelist.item'].search([]).unlink()

        with mock_website_sale_request(self.env, website=self.website) as request:
            self.WebsiteSaleController.cart_update_json(self.largeCabinet.id, set_qty=1)
            self.WebsiteSaleController.pricelist(self.global_program.rule_ids.code)
            self.assertEqual(self.largeCabinet.lst_price, 320)
            cabinet_sol = request.cart.order_line.filtered(lambda sol: sol.product_id == self.largeCabinet)
            promo_sol = (request.cart.order_line - cabinet_sol)
            self.assertTrue(cabinet_sol)
            self.assertEqual(cabinet_sol.price_unit, 320)
            self.assertEqual(cabinet_sol.price_total, 320)
            self.assertEqual(promo_sol.price_total, -32)
            self.assertEqual(request.cart.amount_tax, 0)
            self.assertEqual(request.cart.cart_quantity, 1)
            self.assertEqual(request.cart.amount_total, 288, "The order total should equal 288: 320 - 10%")

            self.WebsiteSaleController.activate_coupon(self.coupon.code)
            promo_code = request.session.get('pending_coupon_code')
            self.assertEqual(request.cart.amount_tax, 0)
            self.assertEqual(request.cart.cart_quantity, 1)
            self.assertEqual(request.cart.amount_total, 288, "The order total should still equal 288 as the coupon for free product can't be applied since it requires 2 min qty")
            self.assertEqual(promo_code, self.coupon.code, "The promo code should be set in the pending coupon dict as it couldn't be applied, we save it for later reuse")

            self.WebsiteSaleController.cart_update_json(self.largeCabinet.id, add_qty=1)
            promo_code = request.session.get('pending_coupon_code')
            self.assertFalse(promo_code, "The promo code should be removed from the pending coupon dict as it should have been applied")
            self.assertEqual(request.cart.amount_tax, 0)
            self.assertEqual(request.cart.cart_quantity, 2)
            self.assertEqual(request.cart.amount_total, 576, "The order total should equal 576: 2*320 - 0 (free product) - 10%")
