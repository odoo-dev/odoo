from odoo.tests.common import TransactionCase
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestSearchVirtualRemainingLeaves(TransactionCase):

    def test_search_virtual_remaining_leaves(self):
        test_employee = self.env['hr.employee'].create({
            'name': 'Test Employee',
        })

        test_leave_type = self.env['hr.leave.type'].create({
                'name': 'Test Leave Type',
                'requires_allocation': True,
            })

        test_allocation = self.env['hr.leave.allocation'].create({
            'name': 'Test Leave Type Allocation',
            'holiday_status_id': test_leave_type.id,
            'number_of_days': 1,
            'employee_id': test_employee.id,
            'state': 'confirm',
        })
        test_allocation.action_approve()

        result_types = self.env['hr.leave.type'].with_context(employee_id=test_employee.id).search([
                            ('virtual_remaining_leaves', '>', 0)
                        ])

        self.assertIn(test_leave_type, result_types)
