# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import odoo

from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon
from odoo.tests.common import Form

@odoo.tests.tagged('post_install', '-at_install')
class TestPoSSale(TestPointOfSaleHttpCommon):
    def test_settle_order_with_kit(self):
        if not self.env["ir.module.module"].search([("name", "=", "mrp"), ("state", "=", "installed")]):
            self.skipTest("mrp module is required for this test")

        self.kit = self.env['product.product'].create({
            'name': 'Pizza Chicken',
            'available_in_pos': True,
            'type': 'product',
            'lst_price': 10.0,
        })

        self.component_a = self.env['product.product'].create({
            'name': 'Chicken',
            'type': 'product',
            'available_in_pos': True,
            'uom_id': self.env.ref('uom.product_uom_gram').id,
            'uom_po_id': self.env.ref('uom.product_uom_gram').id,
            'lst_price': 10.0,
        })
        self.location = self.env['stock.location'].create({
            'name': 'Test location',
            'usage': 'internal',
        })

        self.env['stock.quant']._update_available_quantity(self.component_a, self.location, 100000)

        bom_product_form = Form(self.env['mrp.bom'])
        bom_product_form.product_id = self.kit
        bom_product_form.product_tmpl_id = self.kit.product_tmpl_id
        bom_product_form.product_qty = 1.0
        bom_product_form.type = 'phantom'
        with bom_product_form.bom_line_ids.new() as bom_line:
            bom_line.product_id = self.component_a
            bom_line.product_qty = 300.0
        self.bom_a = bom_product_form.save()

        sale_order = self.env['sale.order'].create({
            'partner_id': self.env.ref('base.res_partner_2').id,
            'order_line': [(0, 0, {
                'product_id': self.kit.id,
                'name': self.kit.name,
                'product_uom_qty': 10,
                'product_uom': self.kit.uom_id.id,
                'price_unit': self.kit.lst_price,
            })],
        })
        sale_order.action_confirm()
        picking = sale_order.picking_ids
        picking.move_ids.quantity_done = 300
        action = picking.button_validate()
        wizard = Form(self.env[action['res_model']].with_context(action['context']))
        wizard.save().process()

        self.assertEqual(sale_order.order_line.qty_delivered, 1)

        self.main_pos_config.open_ui()
        self.start_tour("/pos/ui?config_id=%d" % self.main_pos_config.id, 'PosSettleOrder', login="accountman")

        #assert that sales order qty are correctly updated
        self.assertEqual(sale_order.order_line.qty_delivered, 3)
        self.assertEqual(sale_order.picking_ids[0].move_ids.product_qty, 2100) # 7 left to deliver => 300 * 7 = 2100
        self.assertEqual(sale_order.picking_ids[0].move_ids.quantity_done, 0)
        self.assertEqual(sale_order.picking_ids[1].move_ids.product_qty, 300)
        self.assertEqual(sale_order.picking_ids[1].move_ids.quantity_done, 300) # 1 delivered => 300 * 2 = 600

    def test_settle_order_with_incompatible_partner(self):
        """ If the partner of the sale order is not compatible with the current pos order,
            then a new pos order should be to settle the newly selected sale order.
        """

        product1 = self.env['product.product'].create({
            'name': 'product1',
            'available_in_pos': True,
            'type': 'product',
            'lst_price': 10,
            'taxes_id': [odoo.Command.clear()],
        })
        product2 = self.env['product.product'].create({
            'name': 'product2',
            'available_in_pos': True,
            'type': 'product',
            'lst_price': 11,
            'taxes_id': [odoo.Command.clear()],
        })
        self.env['sale.order'].create({
            'partner_id': self.env.ref('base.res_partner_1').id,
            'partner_shipping_id': self.env.ref('base.res_partner_2').id,
            'order_line': [(0, 0, {'product_id': product1.id})],
        })
        self.env['sale.order'].create({
            'partner_id': self.env.ref('base.res_partner_1').id,
            'partner_shipping_id': self.env.ref('base.res_partner_1').id,
            'order_line': [(0, 0, {'product_id': product2.id})],
        })
        self.main_pos_config.open_ui()
        self.start_tour("/pos/ui?config_id=%d" % self.main_pos_config.id, 'PosSettleOrderIncompatiblePartner', login="accountman")

    def test_settle_order_with_different_product(self):
        """This test create an order and settle it in the PoS. But only one of the product is delivered.
            And we need to make sure the quantity are correctly updated on the sale order.
        """
        #create 2 products
        product_a = self.env['product.product'].create({
            'name': 'Product A',
            'available_in_pos': True,
            'type': 'product',
            'lst_price': 10.0,
        })
        product_b = self.env['product.product'].create({
            'name': 'Product B',
            'available_in_pos': True,
            'type': 'product',
            'lst_price': 10.0,
        })
        #create a sale order with 2 lines
        sale_order = self.env['sale.order'].create({
            'partner_id': self.env.ref('base.res_partner_2').id,
            'order_line': [(0, 0, {
                'product_id': product_a.id,
                'name': product_a.name,
                'product_uom_qty': 1,
                'product_uom': product_a.uom_id.id,
                'price_unit': product_a.lst_price,
            }), (0, 0, {
                'product_id': product_b.id,
                'name': product_b.name,
                'product_uom_qty': 1,
                'product_uom': product_b.uom_id.id,
                'price_unit': product_b.lst_price,
            })],
        })
        sale_order.action_confirm()

        self.assertEqual(sale_order.order_line[0].qty_delivered, 0)
        self.assertEqual(sale_order.order_line[1].qty_delivered, 0)

        self.main_pos_config.open_ui()
        self.start_tour("/pos/ui?config_id=%d" % self.main_pos_config.id, 'PosSettleOrder2', login="accountman")

        self.assertEqual(sale_order.order_line[0].qty_delivered, 1)
        self.assertEqual(sale_order.order_line[1].qty_delivered, 0)
        orderline_product_a = sale_order.order_line.filtered(lambda l: l.product_id.id == product_a.id)
        orderline_product_b = sale_order.order_line.filtered(lambda l: l.product_id.id == product_b.id)
        # nothing to deliver for product a because already handled in pos.
        self.assertEqual(orderline_product_a.move_ids.product_uom_qty, 0)
        # 1 item to deliver for product b.
        self.assertEqual(orderline_product_b.move_ids.product_uom_qty, 1)

    def test_settle_order_with_promotions(self):
        if not self.env["ir.module.module"].search([("name", "=", "pos_coupon"), ("state", "=", "installed")]):
            self.skipTest("pos_coupon module is required for this test")
        if not self.env["ir.module.module"].search([("name", "=", "sale_coupon"), ("state", "=", "installed")]):
            self.skipTest("sale_coupon module is required for this test")

        self.promotion_program = self.env['coupon.program'].create({
            'name': '50% on current order',
            'program_type': 'promotion_program',
            'promo_code_usage': 'no_code_needed',
            'reward_type': 'discount',
            'discount_type': 'percentage',
            'discount_percentage': 50,
            'discount_apply_on': 'on_order',
        })

        self.product = self.env['product.product'].create({
            'name': 'Product',
            'available_in_pos': True,
            'type': 'product',
            'lst_price': 200.0,
            'taxes_id': False,
        })

        sale_order = self.env['sale.order'].create({
            'partner_id': self.env.ref('base.res_partner_2').id,
            'order_line': [(0, 0, {
                'product_id': self.product.id,
                'name': self.product.name,
                'product_uom_qty': 1,
                'product_uom': self.env.ref('uom.product_uom_unit').id,
                'price_unit': self.product.lst_price,
            })],
        })

        #validate the sale order
        sale_order.recompute_coupon_lines()
        sale_order.action_confirm()

        #add the promo program to the pos config
        self.main_pos_config.write({
            'use_coupon_programs': True,
            'promo_program_ids': [(6, 0, [self.promotion_program.id])],
        })
        self.main_pos_config.open_session_cb()
        self.start_tour("/pos/ui?config_id=%d" % self.main_pos_config.id, 'PosSettleOrderWithPromotions', login="accountman")
