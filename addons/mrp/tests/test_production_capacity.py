from odoo.exceptions import AccessError
from odoo.tests import Form, tagged

from odoo.addons.mrp.tests.common import TestMrpCommon


@tagged('post_install', '-at_install')
class TestProductionCapacity(TestMrpCommon):

    _test_user_groups = (
        'mrp.group_mrp_manager',
        'mrp.group_mrp_routings',
    )

    def test_default_capacity_is_company_working_hours(self):
        company = self.env.company
        company.sudo().mrp_weekly_capacity = 0
        wizard = Form(self.env['mrp.production.capacity']).save()
        self.assertEqual(wizard.weekly_capacity, company.resource_calendar_id.hours_per_week)
        self.assertTrue(wizard.weekly_capacity)

    def test_save_capacity(self):
        wizard_form = Form(self.env['mrp.production.capacity'])
        wizard_form.weekly_capacity = 80
        wizard_form.save().action_save()
        self.assertEqual(self.env.company.mrp_weekly_capacity, 80)
        self.assertEqual(Form(self.env['mrp.production.capacity']).weekly_capacity, 80)

    def test_save_capacity_requires_manager(self):
        wizard = self.env['mrp.production.capacity'].create({'weekly_capacity': 10}).with_user(self.user_mrp_user)
        with self.assertRaises(AccessError):
            wizard.action_save()

    def test_weekly_average_output(self):
        self.assertEqual(self.env['mrp.production.capacity'].create({}).weekly_average_output, 0)
        mo = self.env['mrp.production'].create({'product_id': self.product_5.id, 'bom_id': self.bom_2.id, 'product_qty': 1})
        mo.action_confirm()
        mo.qty_producing = 1
        mo.workorder_ids.duration = 120
        mo.workorder_ids.button_finish()
        done_duration = sum(mo.workorder_ids.mapped('duration'))
        self.assertEqual(done_duration, 120 * len(mo.workorder_ids))
        wizard = self.env['mrp.production.capacity'].create({})
        self.assertAlmostEqual(wizard.weekly_average_output, done_duration / 60 / 4)
        action = wizard.action_view_details()
        self.assertEqual(action['res_model'], 'mrp.workorder')
        self.assertEqual(action['context']['group_by'], ['date_start:week'])
        self.assertEqual(self.env['mrp.workorder'].search(action['domain']), mo.workorder_ids)
