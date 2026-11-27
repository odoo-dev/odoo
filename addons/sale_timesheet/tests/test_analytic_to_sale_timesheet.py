from odoo.exceptions import AccessError

from odoo.addons.sale_timesheet.tests.common import TestCommonSaleTimesheet


class TestAnalyticToSaleTimesheet(TestCommonSaleTimesheet):

    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.product_order_timesheet2.reinvoice_policy = 'sales_price'
        cls.product_delivery_timesheet2.reinvoice_policy = 'sales_price'

        cls.timesheet_and_services_sale_order = cls.env['sale.order'].create({
            'partner_id': cls.partner.id,
        })

        cls.invoice_ordered_qty_sol = cls.env['sale.order.line'].create({
            'name': 'Order Quantity Timesheet',
            'product_id': cls.product_order_timesheet2.id,
            'product_uom_qty': 10,
            'order_id': cls.timesheet_and_services_sale_order.id,
        })

        cls.invoice_delivered_qty_sol = cls.env['sale.order.line'].create({
            'name': 'Delivered Quantity Timesheet',
            'product_id': cls.product_delivery_timesheet2.id,
            'product_uom_qty': 10,
            'order_id': cls.timesheet_and_services_sale_order.id,
        })

        cls.timesheet_and_services_sale_order.action_confirm()

        task_order_qty_timesheet = cls.env['project.task'].search(
            [('sale_line_id', '=', cls.timesheet_and_services_sale_order.order_line[0].id)]
        )
        task_delivered_qty_timesheet = cls.env['project.task'].search(
            [('sale_line_id', '=', cls.timesheet_and_services_sale_order.order_line[1].id)]
        )

        # let's log some timesheets
        cls.env['account.analytic.line'].create({
            'name': 'Timesheet Line',
            'project_id': task_order_qty_timesheet.project_id.id,
            'task_id': task_order_qty_timesheet.id,
            'unit_amount': 10,
            'employee_id': cls.employee_manager.id,
        })
        cls.env['account.analytic.line'].create({
            'name': 'Timesheet Line',
            'project_id': task_delivered_qty_timesheet.project_id.id,
            'task_id': task_delivered_qty_timesheet.id,
            'unit_amount': 10,
            'employee_id': cls.employee_manager.id,
        })

    def test_analytic_lines_and_timesheets_aggregates_delivered_qty(self):
        """Ensure that qty_delivered aggregates quantities from timesheets and upsell analytic lines."""

        invoice_ordered_qty_aal = self.env['account.analytic.line'].with_context(from_services_and_material=True).create({
            'name': 'Upsell invoiced on ordered qty service',
            'unit_amount': 5,
            'product_id': self.product_order_timesheet2.id,
            'order_id': self.timesheet_and_services_sale_order.id,
        })
        invoice_delivered_qty_aal = self.env['account.analytic.line'].with_context(from_services_and_material=True).create({
            'name': 'Upsell invoiced on delivered qty service',
            'unit_amount': 5,
            'product_id': self.product_delivery_timesheet2.id,
            'order_id': self.timesheet_and_services_sale_order.id,
        })

        self.assertEqual(
            invoice_ordered_qty_aal.so_line,
            self.invoice_ordered_qty_sol,
            "The upsell AALs should be linked to the same sale order line.",
        )
        self.assertEqual(
            invoice_delivered_qty_aal.so_line,
            self.invoice_delivered_qty_sol,
            "The upsell AALs should be linked to the same sale order line.",
        )

        self.assertEqual(
            self.invoice_ordered_qty_sol.qty_delivered,
            15,
            "The delivered quantity should be sum of timesheet and upsell AALs",
        )
        self.assertEqual(
            self.invoice_delivered_qty_sol.qty_delivered,
            15,
            "The delivered quantity should be sum of timesheet and upsell AALs",
        )

    def test_non_timesheet_analytic_line_write_by_other_user(self):
        """A user without timesheet approver rights can update another user's analytic line
        when it is not a timesheet, but cannot turn it into a timesheet."""
        salesman = self.company_data['default_user_salesman']
        salesman.group_ids += self.env.ref('sales_team.group_sale_salesman_all_leads') + self.env.ref('account.group_account_invoice')
        aal = self.env['account.analytic.line'].with_context(from_services_and_material=True).create({
            'name': 'Upsell line',
            'unit_amount': 1,
            'product_id': self.product_delivery_timesheet2.id,
            'order_id': self.timesheet_and_services_sale_order.id,
        })

        aal.with_user(salesman).with_context(from_services_and_material=True).unit_amount = 2
        self.assertEqual(self.invoice_delivered_qty_sol.qty_delivered, 12)
        with self.assertRaises(AccessError):
            aal.with_user(salesman).project_id = self.project_global
