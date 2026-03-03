from datetime import date

from odoo.addons.hr_holidays.tests.common import TestHrHolidaysCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestWorkEntryTypeSearch(TestHrHolidaysCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # Take 2 days of unlimited holidays (virtual_remaining_leaves = 0)
        cls.hr_work_entry_no_alloc = cls.env['hr.work.entry.type'].create({
            'name': 'Test no allocation',
            'code': 'TEST_NO_ALLOC',
            'requires_allocation': False,
            'unit_of_measure': 'day',
        })
        cls.holiday_unlimited = cls.env['hr.leave'].create({
            'name': 'Time Off No Allocation',
            'employee_id': cls.employee_emp.id,
            'work_entry_type_id': cls.hr_work_entry_no_alloc.id,
            'request_date_from': date(2026, 3, 2),
            'request_date_to': date(2026, 3, 3),
        })
        cls.holiday_unlimited.with_user(cls.user_hrmanager).action_approve()

        # Take 2 days among 10 available (virtual_remaining_leaves = 8)
        cls.hr_work_entry_alloc = cls.env['hr.work.entry.type'].create({
            'name': 'Test allocation',
            'code': 'TEST_ALLOC',
            'requires_allocation': True,
            'unit_of_measure': 'day',
        })
        cls.allocation_10 = cls.env['hr.leave.allocation'].create({
            'name': 'Credit 10 days',
            'employee_id': cls.employee_emp.id,
            'work_entry_type_id': cls.hr_work_entry_alloc.id,
            'number_of_days': 10,
        })
        cls.allocation_10.state = 'validate'
        cls.holiday_2 = cls.env['hr.leave'].create({
            'name': 'Time Off 2 days',
            'employee_id': cls.employee_emp.id,
            'work_entry_type_id': cls.hr_work_entry_alloc.id,
            'request_date_from': date(2026, 3, 4),
            'request_date_to': date(2026, 3, 5),
        })
        cls.holiday_2.with_user(cls.user_hrmanager).action_approve()

    def test_search_virtual_remaining_leaves(self):
        '''
        Testing work entry type search on field virtual_remaining_leaves,
        triggering HrWorkEntryType._search_virtual_remaining_leaves method.
        '''
        my_work_entry_type = self.env['hr.work.entry.type'].with_context(employee_id=self.employee_emp.id)

        res = my_work_entry_type.search([('virtual_remaining_leaves', '>', 5)])
        self.assertIn(self.hr_work_entry_alloc, res, "Should find work entry type with more than 5 days remaining.")

        res = my_work_entry_type.search([('virtual_remaining_leaves', '<', 5)])
        self.assertNotIn(self.hr_work_entry_alloc, res, "Should only find work entry type with less than 5 days remaining.")

        res = my_work_entry_type.search([('virtual_remaining_leaves', '=', 0)])
        self.assertIn(self.hr_work_entry_no_alloc, res, "Should find work entry types with exactly 0 days remaining or no allocation.")
