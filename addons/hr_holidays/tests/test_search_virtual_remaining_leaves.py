from odoo.addons.hr_holidays.tests.common import TestHrHolidaysCommon


class TestSearchVirtualRemainingLeaves(TestHrHolidaysCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        
        cls.test_employee = cls.env['hr.employee'].create({
            'name': 'Test Employee for Search',
            'company_id': cls.company.id,
        })
        cls.leave_type_with_allocation = cls.env['hr.leave.type'].create({
            'name': 'Leave Type With Allocation',
            'requires_allocation': True,
            'request_unit': 'day',
            'company_id': cls.company.id,
        })
        
        cls.leave_type_no_allocation = cls.env['hr.leave.type'].create({
            'name': 'Leave Type No Allocation',
            'requires_allocation': False,
            'request_unit': 'day',
            'company_id': cls.company.id,
        })
        
        cls.leave_type_with_hours = cls.env['hr.leave.type'].create({
            'name': 'Leave Type Hours',
            'requires_allocation': True,
            'request_unit': 'hour',
            'company_id': cls.company.id,
        })

    def test_search_virtual_remaining_leaves_greater_than(self):
        allocation = self.env['hr.leave.allocation'].create({
            'name': 'Test Allocation',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'number_of_days': 10,
            'date_from': '2025-01-01',
            'date_to': '2025-12-31',
        })
        allocation.action_approve()
        
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '>', 5)
        ])
        self.assertIn(self.leave_type_with_allocation, leave_types)
        self.assertIn(self.leave_type_no_allocation, leave_types)

    def test_search_virtual_remaining_leaves_less_than(self):
        allocation = self.env['hr.leave.allocation'].create({
            'name': 'Small Allocation',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'number_of_days': 3,
            'date_from': '2025-01-01',
            'date_to': '2025-12-31',
        })
        allocation.action_approve()
        
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '<', 5)
        ])
        self.assertIn(self.leave_type_with_allocation, leave_types)

    def test_search_virtual_remaining_leaves_equal(self):
        allocation = self.env['hr.leave.allocation'].create({
            'name': 'Exact Allocation',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'number_of_days': 15,
            'date_from': '2025-01-01',
            'date_to': '2025-12-31',
        })
        allocation.action_approve()
        
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '=', 15)
        ])
        self.assertIn(self.leave_type_with_allocation, leave_types)

    def test_search_virtual_remaining_leaves_greater_equal(self):
        allocation = self.env['hr.leave.allocation'].create({
            'name': 'Large Allocation',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'number_of_days': 20,
            'date_from': '2025-01-01',
            'date_to': '2025-12-31',
        })
        allocation.action_approve()
        
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '>=', 20)
        ])
        self.assertIn(self.leave_type_with_allocation, leave_types)
        leave_types_exact = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '>=', 20)
        ])
        
        self.assertIn(self.leave_type_with_allocation, leave_types_exact)

    def test_search_virtual_remaining_leaves_less_equal(self):
        allocation = self.env['hr.leave.allocation'].create({
            'name': 'Medium Allocation',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'number_of_days': 8,
            'date_from': '2025-01-01',
            'date_to': '2025-12-31',
        })
        allocation.action_approve()
        
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '<=', 10)
        ])
        self.assertIn(self.leave_type_with_allocation, leave_types)

    def test_search_virtual_remaining_leaves_not_equal(self):
        allocation = self.env['hr.leave.allocation'].create({
            'name': 'Allocation',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'number_of_days': 12,
            'date_from': '2025-01-01',
            'date_to': '2025-12-31',
        })
        allocation.action_approve()
        
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '!=', 5)
        ])
        self.assertIn(self.leave_type_with_allocation, leave_types)

    def test_search_with_taken_leaves(self):
        allocation = self.env['hr.leave.allocation'].create({
            'name': 'Initial Allocation',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'number_of_days': 15,
            'date_from': '2025-01-01',
            'date_to': '2025-12-31',
        })
        allocation.action_approve()
        leave = self.env['hr.leave'].create({
            'name': 'Test Leave',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'request_date_from': '2025-06-01',
            'request_date_to': '2025-06-05',
            'number_of_days': 5,
        })
        leave.action_approve()
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '>', 0)
        ])
        self.assertIn(self.leave_type_with_allocation, leave_types)
        remaining = self.leave_type_with_allocation.with_context(
            employee_id=self.test_employee.id
        ).virtual_remaining_leaves
        self.assertGreater(remaining, 0)
        self.assertLess(remaining, 15)

    def test_search_without_employee_context(self):
        leave_types = self.env['hr.leave.type'].search([
            ('virtual_remaining_leaves', '>', 0)
        ])
        self.assertTrue(isinstance(leave_types, type(self.env['hr.leave.type'])))

    def test_search_no_allocation_leave_type(self):
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '>=', 0)
        ])
        self.assertIn(self.leave_type_no_allocation, leave_types)

    def test_search_with_multiple_allocations(self):
        allocation1 = self.env['hr.leave.allocation'].create({
            'name': 'First Allocation',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'number_of_days': 10,
            'date_from': '2025-01-01',
            'date_to': '2025-06-30',
        })
        allocation1.action_approve()
        
        allocation2 = self.env['hr.leave.allocation'].create({
            'name': 'Second Allocation',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'number_of_days': 5,
            'date_from': '2025-07-01',
            'date_to': '2025-12-31',
        })
        allocation2.action_approve()
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '>=', 1)
        ])
        self.assertIn(self.leave_type_with_allocation, leave_types)

    def test_search_with_draft_allocation(self):
        self.env['hr.leave.allocation'].create({
            'name': 'Draft Allocation',
            'holiday_status_id': self.leave_type_with_allocation.id,
            'employee_id': self.test_employee.id,
            'number_of_days': 100,
            'date_from': '2025-01-01',
            'date_to': '2025-12-31',
        })
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '>', 50)
        ])
        if self.leave_type_with_allocation in leave_types:
            self.assertLess(
                self.leave_type_with_allocation.with_context(
                    employee_id=self.test_employee.id
                ).virtual_remaining_leaves,
                50
            )

    def test_search_with_hours_unit(self):
        allocation = self.env['hr.leave.allocation'].create({
            'name': 'Hours Allocation',
            'holiday_status_id': self.leave_type_with_hours.id,
            'employee_id': self.test_employee.id,
            'number_of_hours_display': 40,
            'date_from': '2025-01-01',
            'date_to': '2025-12-31',
        })
        allocation.action_approve()
        leave_types = self.env['hr.leave.type'].with_context(
            employee_id=self.test_employee.id
        ).search([
            ('virtual_remaining_leaves', '>', 20)
        ])
        if self.leave_type_with_hours in leave_types:
            remaining = self.leave_type_with_hours.with_context(
                employee_id=self.test_employee.id
            ).virtual_remaining_leaves
            self.assertGreater(remaining, 20)

    def test_search_invalid_operator(self):
        result = self.leave_type_with_allocation._search_virtual_remaining_leaves('invalid_op', 10)
        self.assertEqual(result, NotImplemented)
