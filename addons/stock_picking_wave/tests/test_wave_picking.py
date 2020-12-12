# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo.tests import Form
from odoo.tests.common import TransactionCase


class TestWavePicking(TransactionCase):

    def setUp(self):
        """ Create a picking wave from two pickings from stock to customer """
        super().setUp()
        self.stock_location = self.env.ref('stock.stock_location_stock')
        self.customer_location = self.env.ref('stock.stock_location_customers')
        self.picking_type_out = self.env['ir.model.data'].xmlid_to_res_id('stock.picking_type_out')
        self.env['stock.picking.type'].browse(self.picking_type_out).reservation_method = 'manual'
        self.product_a = self.env['product.product'].create({
            'name': 'Product A',
            'type': 'product',
            'categ_id': self.env.ref('product.product_category_all').id,
        })
        self.product_b = self.env['product.product'].create({
            'name': 'Product B',
            'type': 'product',
            'categ_id': self.env.ref('product.product_category_all').id,
        })
        self.child_location_1 = self.env['stock.location'].create({
            'name': 'Child1',
            'location_id': self.env.ref('stock.stock_location_stock').id,
            'usage': 'internal',
        })
        self.child_location_2 = self.env['stock.location'].create({
            'name': 'Child2',
            'location_id': self.env.ref('stock.stock_location_stock').id,
            'usage': 'internal',
        })
        self.child_location_3 = self.env['stock.location'].create({
            'name': 'Child3',
            'location_id': self.env.ref('stock.stock_location_stock').id,
            'usage': 'internal',
        })

        self.env['stock.quant']._update_available_quantity(self.product_a, self.child_location_1, 6.0)
        self.env['stock.quant']._update_available_quantity(self.product_b, self.child_location_1, 4.0)
        self.env['stock.quant']._update_available_quantity(self.product_a, self.child_location_2, 9.0)
        self.env['stock.quant']._update_available_quantity(self.product_b, self.child_location_2, 4.0)
        self.env['stock.quant']._update_available_quantity(self.product_a, self.child_location_3, 2.0)
        self.env['stock.quant']._update_available_quantity(self.product_b, self.child_location_3, 15.0)

        self.picking_client_1 = self.env['stock.picking'].create({
            'location_id': self.stock_location.id,
            'location_dest_id': self.customer_location.id,
            'picking_type_id': self.picking_type_out,
            'company_id': self.env.company.id,
        })

        self.env['stock.move'].create({
            'name': self.product_a.name,
            'product_id': self.product_a.id,
            'product_uom_qty': 17,
            'product_uom': self.product_a.uom_id.id,
            'picking_id': self.picking_client_1.id,
            'location_id': self.stock_location.id,
            'location_dest_id': self.customer_location.id,
        })

        self.picking_client_2 = self.env['stock.picking'].create({
            'location_id': self.stock_location.id,
            'location_dest_id': self.customer_location.id,
            'picking_type_id': self.picking_type_out,
            'company_id': self.env.company.id,
        })

        self.env['stock.move'].create({
            'name': self.product_b.name,
            'product_id': self.product_b.id,
            'product_uom_qty': 13,
            'product_uom': self.product_a.uom_id.id,
            'picking_id': self.picking_client_2.id,
            'location_id': self.stock_location.id,
            'location_dest_id': self.customer_location.id,
        })

        self.picking_client_3 = self.env['stock.picking'].create({
            'location_id': self.stock_location.id,
            'location_dest_id': self.customer_location.id,
            'picking_type_id': self.picking_type_out,
            'company_id': self.env.company.id,
        })

        self.env['stock.move'].create({
            'name': self.product_b.name,
            'product_id': self.product_b.id,
            'product_uom_qty': 10,
            'product_uom': self.product_a.uom_id.id,
            'picking_id': self.picking_client_3.id,
            'location_id': self.stock_location.id,
            'location_dest_id': self.customer_location.id,
        })

        self.all_pickings = self.picking_client_1 | self.picking_client_2 | self.picking_client_3
        self.all_pickings.action_assign()

    def test_simple_wave_with_manual_qty_done(self):
        """ Test a simple wave picking with all quantity for picking available.
        The user set all the quantity_done on picking manually and no wizard are used.
        """
        wave1 = self.env['stock.picking.wave'].create({
            'name': 'Wave 1',
            'company_id': self.env.company.id,
            'move_line_ids': [(6, 0, self.all_pickings.move_line_ids.filtered(lambda line: line.location_id == self.child_location_1).ids)]
        })
        for line in wave1.move_line_ids:
            line.qty_done = line.product_uom_qty
        wave1.action_done()

        self.assertEqual(wave1.state, 'done', 'Wave 1 should be done')

        quant_a = self.env['stock.quant']._gather(self.product_a, self.child_location_1)
        quant_b = self.env['stock.quant']._gather(self.product_b, self.child_location_1)

        # ensure that move_lines are not done
        self.assertFalse(sum(quant_a.mapped('quantity')))
        self.assertFalse(sum(quant_b.mapped('quantity')))

    def test_simple_wave_with_wizard(self):
        """ Test a simple wave picking with all quantity for picking available.
        The user use the wizard in order to complete automatically the quantity_done to
        the initial demand (or reserved quantity in this test).
        """
        wave1 = self.env['stock.picking.wave'].create({
            'name': 'Wave 1',
            'company_id': self.env.company.id,
            'move_line_ids': [(6, 0, self.all_pickings.move_line_ids.filtered(lambda line: line.location_id == self.child_location_1).ids)]
        })
        # Keep initial demand
        move1 = wave1.move_ids[0]
        move2 = wave1.move_ids[1]
        picking_count = self.env['stock.picking'].search_count([])

        self.assertEqual(move1.product_uom_qty, 17)
        self.assertEqual(move2.product_uom_qty, 13)
        # There should be a wizard asking to process picking without quantity done
        immediate_transfer_wizard_dict = wave1.action_done()
        self.assertTrue(immediate_transfer_wizard_dict)
        immediate_transfer_wizard = Form(self.env[(immediate_transfer_wizard_dict.get('res_model'))].with_context(immediate_transfer_wizard_dict['context'])).save()
        immediate_transfer_wizard.process()

        self.assertEqual(wave1.state, 'done', 'Wave 1 should be done')

        quant_a = self.env['stock.quant']._gather(self.product_a, self.child_location_1)
        quant_b = self.env['stock.quant']._gather(self.product_b, self.child_location_1)

        # ensure that quantity for picking has been moved
        self.assertFalse(sum(quant_a.mapped('quantity')))
        self.assertFalse(sum(quant_b.mapped('quantity')))

        # Check Original moves have been split
        self.assertEqual(move1.product_uom_qty, 6)
        self.assertEqual(move2.product_uom_qty, 4)
        self.assertEqual(move1.state, 'done')
        self.assertEqual(move2.state, 'done')

        # Check a new picking has been created with the split move
        new_picking_count = self.env['stock.picking'].search_count([])
        self.assertEqual(picking_count, new_picking_count - 2)

    def test_wave_constrains(self):
        """ Test adding pickings into draft wave will filter the stock move lines depending on the
        wave parameters (location_id, scheduled_date)."""

        wave1 = self.env['stock.picking.wave'].create({
            'name': 'Wave 1',
            'company_id': self.env.company.id,
        })

        now = datetime.now()
        self.assertFalse(wave1.scheduled_date)

        wave1.scheduled_date = now
        wave1.location_id = self.child_location_1
        self.picking_client_1.scheduled_date = now + timedelta(days=2)

        wave1.picking_ids = self.all_pickings
        self.assertEqual(len(wave1.move_line_ids), 1)
        self.assertEqual(wave1.move_line_ids.location_id, self.child_location_1)
        self.assertLess(wave1.move_line_ids.move_id.date, now)
