
from odoo import Command
from odoo.tests import Form, tagged

from odoo.addons.base.tests.common import BaseCommon
from odoo.addons.mail.tests.common import mail_new_test_user
from odoo.addons.stock.tests.common import TestStockCommon


class TestMrpCommon(TestStockCommon):

    @classmethod
    def generate_mo(cls, tracking_final='none', tracking_base_1='none', tracking_base_2='none', qty_final=5, qty_base_1=4, qty_base_2=1, picking_type_id=False):
        """ This function generate a manufacturing order with one final
        product and two consumed product. Arguments allows to choose
        the tracking/qty for each different products. It returns the
        MO, used bom and the tree products.
        """
        product_to_build, product_to_use_1, product_to_use_2 = cls.env['product.product'].create([
            {
                'name': 'Young Tom',
                'type': 'consu',
                'is_storable': True,
                'tracking': tracking_final,
            }, {
                'name': 'Botox',
                'type': 'consu',
                'is_storable': True,
                'tracking': tracking_base_1,
            }, {
                'name': 'Old Tom',
                'type': 'consu',
                'is_storable': True,
                'tracking': tracking_base_2,
            }
        ])
        bom_1 = cls.env['mrp.bom'].create({
            'product_id': product_to_build.id,
            'product_tmpl_id': product_to_build.product_tmpl_id.id,
            'uom_id': cls.uom_unit.id,
            'product_qty': 1.0,
            'type': 'normal',
            'bom_line_ids': [
                Command.create({'product_id': product_to_use_2.id, 'product_qty': qty_base_2}),
                Command.create({'product_id': product_to_use_1.id, 'product_qty': qty_base_1}),
            ],
        })
        mo_form = Form(cls.env['mrp.production'])
        mo_form.product_id = product_to_build
        if picking_type_id:
            mo_form.picking_type_id = picking_type_id
        mo_form.bom_id = bom_1
        mo_form.product_qty = qty_final
        mo = mo_form.save()
        mo.action_confirm()
        return mo, bom_1, product_to_build, product_to_use_1, product_to_use_2

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.group_mrp_routings = cls.quick_ref('mrp.group_mrp_routings')

        # Kept for reduced diff in existing tests, should be dropped someday
        cls.product_7_template = cls.product_template_sofa

        cls.product_7_attr1_v1 = cls.product_7_template.attribute_line_ids[
            0].product_template_value_ids[0]
        cls.product_7_attr1_v2 = cls.product_7_template.attribute_line_ids[
            0].product_template_value_ids[1]
        cls.product_7_attr1_v3 = cls.product_7_template.attribute_line_ids[
            0].product_template_value_ids[2]

        cls.product_7_1 = cls.product_7_template._get_variant_for_combination(
            cls.product_7_attr1_v1)
        cls.product_7_2 = cls.product_7_template._get_variant_for_combination(
            cls.product_7_attr1_v2)
        cls.product_7_3 = cls.product_7_template._get_variant_for_combination(
            cls.product_7_attr1_v3)

        (
            cls.product_4,
            cls.product_5,
            cls.product_6,
            cls.product_8,
        ) = cls.env['product.product'].create([{
            'name': 'Stick',  # product_4
            'uom_id': cls.uom_dozen.id,
        }, {
            'name': 'Stone Tools',  # product_5
        }, {
            'name': 'Door',  # product_6
        }, {
            'name': 'House',  # product_8
        }])

        # Update demo products
        (cls.product_2 | cls.product_3 | cls.product_4 | cls.product_5 | cls.product_6 | cls.product_7_3 | cls.product_8).write({
            'type': 'consu',
            'is_storable': True,
        })

        # User Data: mrp user and mrp manager
        cls.user_mrp_user = mail_new_test_user(
            cls.env,
            name='Hilda Ferachwal',
            login='hilda',
            email='h.h@example.com',
            notification_type='inbox',
            groups='mrp.group_mrp_user, stock.group_stock_user, mrp.group_mrp_byproducts, uom.group_uom',
        )
        cls.user_mrp_manager = mail_new_test_user(
            cls.env,
            name='Gary Youngwomen',
            login='gary',
            email='g.g@example.com',
            notification_type='inbox',
            groups='mrp.group_mrp_manager, stock.group_stock_user, mrp.group_mrp_byproducts, uom.group_uom',
        )
        # Both groups below are required to make fields `uom_id` and
        # `workorder_ids` to be visible in the view of `mrp.production`. The
        # field `uom_id` must be set by many tests, and subviews of
        # `workorder_ids` must be present in many tests to create records.
        cls.env.user.group_ids += cls.group_uom + cls.group_mrp_routings
        cls.picking_type_manu = cls.warehouse_1.manu_type_id
        cls.picking_type_manu.sequence = 5
        cls.route_manufacture = cls.warehouse_1.manufacture_pull_id.route_id

        cls.workcenter_1, cls.workcenter_2, cls.workcenter_3 = cls.env['mrp.workcenter'].create([
            {
                'name': 'Nuclear Workcenter',
                'time_start': 10,
                'time_stop': 5,
                'time_efficiency': 80,
                'tz': 'UTC',
                'resource_calendar_id': cls.env.company.resource_calendar_id.id,
            }, {
                'name': 'Simple Workcenter',
                'time_start': 0,
                'time_stop': 0,
                'time_efficiency': 100,
                'tz': 'UTC',
                'resource_calendar_id': cls.env.company.resource_calendar_id.id,
            }, {
                'name': 'Double Workcenter',
                'time_start': 0,
                'time_stop': 0,
                'time_efficiency': 100,
                'tz': 'UTC',
                'resource_calendar_id': cls.env.company.resource_calendar_id.id,
            }
        ])
        for (workcenter, default_capacity) in [(cls.workcenter_1, 2), (cls.workcenter_2, 1), (cls.workcenter_3, 2)]:
            cls.env['mrp.workcenter.capacity'].create({
                'workcenter_id': workcenter.id,
                'uom_id': cls.uom_unit.id,
                'capacity': default_capacity,
                'time_start': workcenter.time_start,
                'time_stop': workcenter.time_stop,
            })
        cls.bom_1 = cls.env['mrp.bom'].create({
            'product_id': cls.product_4.id,
            'product_tmpl_id': cls.product_4.product_tmpl_id.id,
            'uom_id': cls.uom_unit.id,
            'product_qty': 4.0,
            'operation_ids': [
            ],
            'type': 'normal',
            'bom_line_ids': [
                Command.create({'product_id': cls.product_2.id, 'product_qty': 2}),
                Command.create({'product_id': cls.product_1.id, 'product_qty': 4}),
            ]})
        cls.bom_2 = cls.env['mrp.bom'].create({
            'product_id': cls.product_5.id,
            'product_tmpl_id': cls.product_5.product_tmpl_id.id,
            'uom_id': cls.product_5.uom_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({'name': 'Gift Wrap Maching', 'workcenter_id': cls.workcenter_1.id, 'time_cycle': 15, 'sequence': 1}),
            ],
            'type': 'phantom',
            'sequence': 2,
            'bom_line_ids': [
                Command.create({'product_id': cls.product_4.id, 'product_qty': 2}),
                Command.create({'product_id': cls.product_3.id, 'product_qty': 3}),
            ]})
        cls.bom_3 = cls.env['mrp.bom'].create({
            'product_id': cls.product_6.id,
            'product_tmpl_id': cls.product_6.product_tmpl_id.id,
            'uom_id': cls.uom_dozen.id,
            'ready_to_produce': 'asap',
            'product_qty': 2.0,
            'operation_ids': [
                Command.create({'name': 'Cutting Machine', 'workcenter_id': cls.workcenter_1.id, 'time_cycle': 12, 'sequence': 1}),
                Command.create({'name': 'Weld Machine', 'workcenter_id': cls.workcenter_1.id, 'time_cycle': 18, 'sequence': 2}),
            ],
            'type': 'normal',
            'bom_line_ids': [
                Command.create({'product_id': cls.product_5.id, 'product_qty': 2}),
                Command.create({'product_id': cls.product_4.id, 'product_qty': 8}),
                Command.create({'product_id': cls.product_2.id, 'product_qty': 12}),
            ]})
        cls.bom_4 = cls.env['mrp.bom'].create({
            'product_id': cls.product_6.id,
            'product_tmpl_id': cls.product_6.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [Command.create({
                'name': 'Rub it gently with a cloth',
                'workcenter_id': cls.workcenter_2.id,
                'time_mode_batch': 1,
                'time_mode': "auto",
                'sequence': 1,
            })],
            'type': 'normal',
            'bom_line_ids': [
                Command.create({'product_id': cls.product_1.id, 'product_qty': 1}),
            ]})
        cls.bom_5 = cls.env['mrp.bom'].create({
            'product_id': cls.product_6.id,
            'product_tmpl_id': cls.product_6.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [Command.create({
                'name': 'Rub it gently with a cloth two at once',
                'workcenter_id': cls.workcenter_3.id,
                'time_mode_batch': 2,
                'time_mode': "auto",
                'sequence': 1,
            })],
            'type': 'normal',
            'bom_line_ids': [
                Command.create({'product_id': cls.product_1.id, 'product_qty': 1}),
            ]})
        cls.bom_6 = cls.env['mrp.bom'].create({
            'product_id': cls.product_6.id,
            'product_tmpl_id': cls.product_6.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [Command.create({
                'name': 'Rub it gently with a cloth two at once',
                'workcenter_id': cls.workcenter_3.id,
                'time_mode_batch': 1,
                'time_mode': "auto",
                'sequence': 1,
            })],
            'type': 'normal',
            'bom_line_ids': [
                Command.create({'product_id': cls.product_1.id, 'product_qty': 1}),
            ]})

        cls.stock_location_components = cls.shelf_1

    @classmethod
    def make_bom(cls, p, *cs):
        return cls.env["mrp.bom"].create(
            {
                "product_tmpl_id": p.product_tmpl_id.id,
                "product_id": p.id,
                "product_qty": 1,
                "type": "phantom",
                "uom_id": cls.uom_unit.id,
                "bom_line_ids": [
                    Command.create({
                        "product_id": c.id,
                        "product_qty": 1,
                        "uom_id": cls.uom_unit.id
                    })
                    for c in cs
                ],
            }
        )

    def full_availability(self):
        """set full availability for all calendars"""
        calendar = self.env['resource.calendar'].search([])
        calendar.write({'attendance_ids': [(5, 0, 0)]})
        calendar.write({'attendance_ids': [
            (0, 0, {'dayofweek': '0', 'hour_from': 0, 'hour_to': 24}),
            (0, 0, {'dayofweek': '1', 'hour_from': 0, 'hour_to': 24}),
            (0, 0, {'dayofweek': '2', 'hour_from': 0, 'hour_to': 24}),
            (0, 0, {'dayofweek': '3', 'hour_from': 0, 'hour_to': 24}),
            (0, 0, {'dayofweek': '4', 'hour_from': 0, 'hour_to': 24}),
            (0, 0, {'dayofweek': '5', 'hour_from': 0, 'hour_to': 24}),
            (0, 0, {'dayofweek': '6', 'hour_from': 0, 'hour_to': 24}),
        ]})


@tagged('post_install', '-at_install') # LEGACY at_install
class TestBomCostCommon(BaseCommon):
    """A common setup used by the BOM cost tests.
    """

    @classmethod
    def _create_product(cls, name, price, quantity=100, category=None):
        vals = {
            'name': name,
            'is_storable': True,
            'standard_price': price,
            'qty_available': quantity,
        }
        if category:
            vals['categ_id'] = category.id
        return cls.env['product.product'].create(vals)

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Required for `uom_id ` to be visible in the view
        cls.env.user.group_ids += cls.env.ref('uom.group_uom')
        # Required for `product_id ` to be visible in the view
        cls.env.user.group_ids += cls.env.ref('product.group_product_variant')
        # re-use some helpers from TestMrpCommon
        cls.Product = cls.env['product.product']
        cls.Bom = cls.env['mrp.bom']

         # Products.
        cls.dining_table = cls._create_product('Dining Table', 1000, quantity=0)
        cls.table_head = cls._create_product('Table Head', 300)
        cls.screw = cls._create_product('Screw', 10)
        cls.leg = cls._create_product('Leg', 25)
        cls.glass = cls._create_product('Glass', 100, quantity=0)

        # Unit of Measure.
        cls.dozen = cls.env.ref("uom.product_uom_dozen")

        # Bills Of Materials.
        # -------------------------------------------------------------------------------
        # Cost of BoM (Dining Table 1 Unit)
        # Component Cost =  Table Head   1 Unit * 300 = 300 (468.75 from it's components)
        #                   Screw        5 Unit *  10 =  50
        #                   Leg          4 Unit *  25 = 100
        #                   Glass        1 Unit * 100 = 100
        # Total = 550 [718.75 if components of Table Head considered] (for 1 Unit)
        # -------------------------------------------------------------------------------

        bom_form = Form(cls.Bom)
        bom_form.product_id = cls.dining_table
        bom_form.product_tmpl_id = cls.dining_table.product_tmpl_id
        bom_form.product_qty = 1.0
        bom_form.type = 'normal'
        with bom_form.bom_line_ids.new() as line:
            line.product_id = cls.table_head
            line.product_qty = 1
        with bom_form.bom_line_ids.new() as line:
            line.product_id = cls.screw
            line.product_qty = 5
        with bom_form.bom_line_ids.new() as line:
            line.product_id = cls.leg
            line.product_qty = 4
        with bom_form.bom_line_ids.new() as line:
            line.product_id = cls.glass
            line.product_qty = 1
        cls.bom_1 = bom_form.save()

        # Table Head's components.
        cls.plywood_sheet = cls._create_product('Plywood Sheet', 200)
        cls.bolt = cls._create_product('Bolt', 10)
        cls.colour = cls._create_product('Colour', 100)
        cls.corner_slide = cls._create_product('Corner Slide', 25)

        # -----------------------------------------------------------------
        # Cost of BoM (Table Head 1 Dozen)
        # Component Cost =  Plywood Sheet   12 Unit * 200 = 2400
        #                   Bolt            60 Unit *  10 =  600
        #                   Colour          12 Unit * 100 = 1200
        #                   Corner Slide    57 Unit * 25  = 1425
        #                                           Total = 5625
        #                          1 Unit price (5625/12) =  468.75
        # -----------------------------------------------------------------

        bom_form2 = Form(cls.Bom)
        bom_form2.product_id = cls.table_head
        bom_form2.product_tmpl_id = cls.table_head.product_tmpl_id
        bom_form2.product_qty = 1.0
        bom_form2.uom_id = cls.dozen
        bom_form2.type = 'phantom'
        with bom_form2.bom_line_ids.new() as line:
            line.product_id = cls.plywood_sheet
            line.product_qty = 12
        with bom_form2.bom_line_ids.new() as line:
            line.product_id = cls.bolt
            line.product_qty = 60
        with bom_form2.bom_line_ids.new() as line:
            line.product_id = cls.colour
            line.product_qty = 12
        with bom_form2.bom_line_ids.new() as line:
            line.product_id = cls.corner_slide
            line.product_qty = 57
        cls.bom_2 = bom_form2.save()


@tagged('post_install', '-at_install') # LEGACY at_install
class TestBomCostOperationCommon(TestBomCostCommon):
    """ Common bom setup with workorder operations"""
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.workcenter = cls.env['mrp.workcenter'].create({
            'name': 'Workcenter',
            'time_efficiency': 80,
            'oee_target': 100,
            'time_start': 15,
            'time_stop': 15,
            'costs_hour': 100,
        })
        cls.env['mrp.workcenter.capacity'].create({
            'product_id': cls.dining_table.id,
            'workcenter_id': cls.workcenter.id,
            'time_start': 17,
            'time_stop': 16,
        })

        # -----------------------------------------------------------------
        # Dinning Table Operation Cost(1 Unit)
        # -----------------------------------------------------------------
        # Operation cost calculate for 1 units
        # Cutting        (15 + 15 + (20 * 100/80) / 60) * 100 =   91.67
        # Drilling       (15 + 15 + (25 * 100/80) / 60) * 100 =  102.08
        # Fitting        (15 + 15 + (30 * 100/80) / 60) * 100 =  112.50
        # Table Capacity (3 operations * (2 + 1)  / 60) * 100 =   15.00
        # ----------------------------------------
        # Operation Cost  1 unit = 321.25
        # -----------------------------------------------------------------

        # --------------------------------------------------------------------------
        # Table Head Operation Cost (1 Dozen)
        # --------------------------------------------------------------------------
        # Operation cost calculate for 1 dozens
        # Cutting        (15 + 15 + (20 * 1 * 100/80) / 60) * 100 =   91.67
        # Drilling       (15 + 15 + (25 * 1 * 100/80) / 60) * 100 =  102.08
        # Fitting        (15 + 15 + (30 * 1 * 100/80) / 60) * 100 =  112.50
        # Table Capacity (3 operations * (2 + 1)      / 60) * 100 =   15.00
        # ----------------------------------------
        # Operation Cost 1 dozen (306.25 + 15 = 321.25 per dozen) and 25.52 for 1 Unit
        # --------------------------------------------------------------------------
        cls.bom_1.write({
            'operation_ids': [
                (0, 0, {
                    'name': 'Cutting',
                    'workcenter_id': cls.workcenter.id,
                    'time_mode': 'manual',
                    'time_cycle_manual': 20,
                    'sequence': 1,
                }),
                (0, 0, {
                    'name': 'Drilling',
                    'workcenter_id': cls.workcenter.id,
                    'time_mode': 'manual',
                    'time_cycle_manual': 25,
                    'sequence': 2,
                }),
                (0, 0, {
                    'name': 'Fitting',
                    'workcenter_id': cls.workcenter.id,
                    'time_mode': 'manual',
                    'time_cycle_manual': 30,
                    'sequence': 3,
                }),
            ],
        })
        cls.bom_2.write({
            'operation_ids': [
                (0, 0, {
                    'name': 'Cutting',
                    'workcenter_id': cls.workcenter.id,
                    'time_mode': 'manual',
                    'time_cycle_manual': 20,
                    'sequence': 1,
                }),
                (0, 0, {
                    'name': 'Drilling',
                    'workcenter_id': cls.workcenter.id,
                    'time_mode': 'manual',
                    'time_cycle_manual': 25,
                    'sequence': 2,
                }),
                (0, 0, {
                    'name': 'Fitting',
                    'workcenter_id': cls.workcenter.id,
                    'time_mode': 'manual',
                    'time_cycle_manual': 30,
                    'sequence': 3,
                }),
            ],
        })

        # byproduct

        # Cost Breakdown.
        # -------------------------------------------------------------------------------
        # Total Cost of BoM = 550 [718.75 if components of Table Head considered] (for 1 Unit)
        # Dining Table 1 Unit = 1 - (25 + 50) / 100 * 550 = 0.25 * 550 = 137.5
        # Scrap Wood 1 Unit = (25 + 50) / 100 * 550 / (8 units + 12 units) = 20.625
        # -------------------------------------------------------------------------------

        cls.scrap_wood = cls._create_product('Scrap Wood', 30, quantity=0)

        # different byproduct line uoms => 20 total units with a total of 75% of cost share
        cls.bom_1.write({
            'byproduct_ids': [
                (0, 0, {
                    'product_id': cls.scrap_wood.id,
                    'product_qty': 8,
                    'bom_id': cls.bom_1.id,
                    'cost_share': 1,
                }),
                (0, 0, {
                    'product_id': cls.scrap_wood.id,
                    'uom_id': cls.dozen.id,
                    'product_qty': 1,
                    'bom_id': cls.bom_1.id,
                    'cost_share': 12,
                }),
            ],
        })