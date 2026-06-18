from odoo.addons.hr_holidays.tests.common import TestHrHolidaysCommon


class TestTimeOffType(TestHrHolidaysCommon):

    @classmethod
    def setUpClass(cls):

        super().setUpClass()

        cls.work_entry_type_paid = cls.env['hr.work.entry.type'].create({
            'name': 'Paid Time Off',
            'code': 'Paid Time Off',
            'requires_allocation': True,
            'request_unit': 'day',
            'unit_of_measure': 'day',
            'allows_negative': False,
        })

        cls.allocation = cls.env['hr.leave.allocation'].create({
                'name': 'Regular allocation',
                'date_from': '2024-01-04',
                'work_entry_type_id': cls.work_entry_type_paid.id,
                'employee_id': cls.employee_emp.id,
                'number_of_days': 10,
        })
        cls.allocation.action_approve()

    def test_time_off_type_selection_with_existing_allocations(self):
        self.env['hr.work.entry.type'].with_context(
                default_employee_id=self.employee_emp.id,
        ).search([
            ('virtual_remaining_leaves', '>', 0),
        ])
