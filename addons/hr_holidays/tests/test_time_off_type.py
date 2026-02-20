# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.tests import tagged

from odoo.addons.hr_holidays.tests.common import TestHrHolidaysCommon


@tagged('moali_test', '-at_install')
class TestTimeOffType(TestHrHolidaysCommon):

    def test_time_off_type(self):
        """ A test file to check for the time-off type field breaking on time off creation from smart button """
        trackable_enough_leave_type = self.env['hr.leave.type'].create({
            'name': 'Trackable Time Off Type 1',
            'requires_allocation': True,
            'request_unit': 'day',
            'unit_of_measure': 'day',
        })

        trackable_not_enough_leave_type = self.env['hr.leave.type'].create({
            'name': 'Trackable Time Off Type 2',
            'requires_allocation': True,
            'request_unit': 'day',
            'unit_of_measure': 'day',
        })

        untrackable_leave_type = self.env['hr.leave.type'].create({
            'name': 'Untrackable Time Off Type',
            'requires_allocation': False,
            'request_unit': 'day',
            'unit_of_measure': 'day',
        })

        employee = self.env['hr.employee'].create({
            'name': 'Test user',
        })

        enough_allocation = self.env['hr.leave.allocation'].create({
            'employee_id': employee.id,
            'number_of_days': 5,
            'holiday_status_id': trackable_enough_leave_type.id,
            'state': 'confirm',
        }).action_approve()

        not_enough_allocation = self.env['hr.leave.allocation'].create({
            'employee_id': employee.id,
            'number_of_days': 2,
            'holiday_status_id': trackable_not_enough_leave_type.id,
            'state': 'confirm',
        }).action_approve()

        available_types = self.env['hr.leave.type'].with_context(
            employee_id=employee.id).search([('virtual_remaining_leaves', '>', 3)])

        self.assertNotIn(trackable_not_enough_leave_type.id, available_types.ids)
        self.assertIn(trackable_enough_leave_type.id, available_types.ids)
        self.assertIn(untrackable_leave_type.id, available_types.ids)

