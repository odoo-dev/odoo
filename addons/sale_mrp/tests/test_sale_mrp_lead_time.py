# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from odoo import fields
from odoo.addons.stock.tests.common2 import TestStockCommon

from odoo.tests import Form


class TestSaleMrpLeadTime(TestStockCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.ref('stock.route_warehouse0_mto').active = True
        # Update the product_1 with type, route, Manufacturing Lead Time and Customer Lead Time
        with Form(cls.product_1) as p1:
            p1.type = 'product'
            p1.produce_delay = 5.0
            p1.sale_delay = 5.0
            p1.route_ids.clear()
            p1.route_ids.add(cls.warehouse_1.manufacture_pull_id.route_id)
            p1.route_ids.add(cls.warehouse_1.mto_pull_id.route_id)

        # Update the product_2 with type
        with Form(cls.product_2) as p2:
            p2.type = 'consu'

        # Create Bill of materials for product_1
        with Form(cls.env['mrp.bom']) as bom:
            bom.product_tmpl_id = cls.product_1.product_tmpl_id
            bom.product_qty = 2
            with bom.bom_line_ids.new() as line:
                line.product_id = cls.product_2
                line.product_qty = 4

    def test_00_product_company_level_delays(self):
        """ In order to check schedule date, set product's Manufacturing Lead Time
            and Customer Lead Time and also set company's Manufacturing Lead Time
            and Sales Safety Days."""

        company = self.env.ref('base.main_company')

        # Update company with Manufacturing Lead Time and Sales Safety Days
        company.write({'manufacturing_lead': 3.0,
                       'security_lead': 3.0})

        # Create sale order of product_1
        order_form = Form(self.env['sale.order'])
        order_form.partner_id = self.partner_1
        with order_form.order_line.new() as line:
            line.product_id = self.product_1
            line.product_uom_qty = 10
        order = order_form.save()
        # Confirm sale order
        order.action_confirm()

        # Check manufacturing order created or not
        manufacturing_order = self.env['mrp.production'].search([('product_id', '=', self.product_1.id), ('move_dest_ids', 'in', order.picking_ids[0].move_ids.ids)])
        self.assertTrue(manufacturing_order, 'Manufacturing order should be created.')

        # Check schedule date of picking
        deadline_picking = order.date_order + timedelta(days=self.product_1.sale_delay)
        out_date = deadline_picking - timedelta(days=company.security_lead)
        self.assertAlmostEqual(
            order.picking_ids[0].scheduled_date, out_date,
            delta=timedelta(seconds=61),
            msg='Schedule date of picking should be equal to: Order date + Customer Lead Time - Sales Safety Days.'
        )
        self.assertAlmostEqual(
            order.picking_ids[0].date_deadline, deadline_picking,
            delta=timedelta(seconds=61),
            msg='Deadline date of picking should be equal to: Order date + Customer Lead Time.'
        )

        # Check schedule date and deadline of manufacturing order
        mo_scheduled = out_date - timedelta(days=self.product_1.produce_delay) - timedelta(days=company.manufacturing_lead)
        self.assertAlmostEqual(
            fields.Datetime.from_string(manufacturing_order.date_planned_start), mo_scheduled,
            delta=timedelta(seconds=61),
            msg="Schedule date of manufacturing order should be equal to: Schedule date of picking - product's Manufacturing Lead Time - company's Manufacturing Lead Time."
        )
        self.assertAlmostEqual(
            fields.Datetime.from_string(manufacturing_order.date_deadline), deadline_picking,
            delta=timedelta(seconds=61),
            msg="Deadline date of manufacturing order should be equal to the deadline of sale picking"
        )

    def test_01_product_route_level_delays(self):
        """ In order to check schedule dates, set product's Manufacturing Lead Time
            and Customer Lead Time and also set warehouse route's delay."""

        # Update warehouse_1 with Outgoing Shippings pick + pack + ship
        self.warehouse_1.write({'delivery_steps': 'pick_pack_ship'})

        # Set delay on pull rule
        for pull_rule in self.warehouse_1.delivery_route_id.rule_ids:
            pull_rule.write({'delay': 2})

        # Create sale order of product_1
        order_form = Form(self.env['sale.order'])
        order_form.partner_id = self.partner_1
        order_form.warehouse_id = self.warehouse_1
        with order_form.order_line.new() as line:
            line.product_id = self.product_1
            line.product_uom_qty = 6
        order = order_form.save()
        # Confirm sale order
        order.action_confirm()

        # Run scheduler
        self.env['procurement.group'].run_scheduler()

        # Check manufacturing order created or not
        manufacturing_order = self.env['mrp.production'].search([('product_id', '=', self.product_1.id)]) 
        self.assertTrue(manufacturing_order, 'Manufacturing order should be created.')

        # Check the picking crated or not
        self.assertTrue(order.picking_ids, "Pickings should be created.")

        # Check schedule date of ship type picking
        out = order.picking_ids.filtered(lambda r: r.picking_type_id == self.warehouse_1.out_type_id)
        out_min_date = out.scheduled_date
        out_date = order.date_order + timedelta(days=self.product_1.sale_delay) - timedelta(days=out.move_ids[0].rule_id.delay)
        self.assertAlmostEqual(
            out_min_date, out_date,
            delta=timedelta(seconds=70),
            msg='Schedule date of ship type picking should be equal to: order date + Customer Lead Time - pull rule delay.'
        )

        # Check schedule date of pack type picking
        pack = order.picking_ids.filtered(lambda r: r.picking_type_id == self.warehouse_1.pack_type_id)
        pack_min_date = pack.scheduled_date
        pack_date = out_date - timedelta(days=pack.move_ids[0].rule_id.delay)
        self.assertAlmostEqual(
            pack_min_date, pack_date,
            delta=timedelta(seconds=70),
            msg='Schedule date of pack type picking should be equal to: Schedule date of ship type picking - pull rule delay.'
        )

        # Check schedule date of pick type picking
        pick = order.picking_ids.filtered(lambda r: r.picking_type_id == self.warehouse_1.pick_type_id)
        pick_min_date = pick.scheduled_date
        self.assertAlmostEqual(
            pick_min_date, pack_date,
            delta=timedelta(seconds=70),
            msg='Schedule date of pick type picking should be equal to: Schedule date of pack type picking.'
        )

        # Check schedule date and deadline date of manufacturing order
        mo_scheduled = out_date - timedelta(days=self.product_1.produce_delay) - timedelta(days=self.warehouse_1.delivery_route_id.rule_ids[0].delay) - timedelta(days=self.env.ref('base.main_company').manufacturing_lead)
        self.assertAlmostEqual(
            manufacturing_order.date_planned_start, mo_scheduled,
            delta=timedelta(seconds=61),
            msg="Schedule date of manufacturing order should be equal to: Schedule date of picking - product's Manufacturing Lead Time- delay pull_rule."
        )
        self.assertAlmostEqual(
            manufacturing_order.date_deadline, order.picking_ids[0].date_deadline,
            delta=timedelta(seconds=61),
            msg="Deadline date of manufacturing order should be equal to the deadline of sale picking"
        )
