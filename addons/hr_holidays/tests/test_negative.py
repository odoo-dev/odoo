# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime
from freezegun import freeze_time

from odoo.tests.common import tagged
from odoo.addons.hr_holidays.tests.common import TestHrHolidaysCommon
from odoo.exceptions import ValidationError


@tagged('negative_time_off')
class TestNegative(TestHrHolidaysCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.work_entry_type = cls.env['hr.work.entry.type'].create({
            'name': 'Limited with negative',
            'code': 'Limited with negative',
            'leave_validation_type': 'no_validation',
            'requires_allocation': True,
            'allows_negative': True,
            'max_allowed_negative': 5,
            'request_unit': 'day',
            'unit_of_measure': 'day',
        })

        cls.allocation_2022 = cls.env['hr.leave.allocation'].create({
            'employee_id': cls.employee_emp_id,
            'work_entry_type_id': cls.work_entry_type.id,
            'date_from': '2022-01-01',
            'date_to': '2022-12-31',
            'number_of_days': 1,
        })

        cls.allocation_2023 = cls.env['hr.leave.allocation'].create({
            'employee_id': cls.employee_emp_id,
            'work_entry_type_id': cls.work_entry_type.id,
            'date_from': '2023-01-01',
            'number_of_days': 5,
        })

    def test_negative_time_off(self):
        with freeze_time('2022-10-02'):
            # At the start of 2022, the user receives 1 days, his balance is at 1
            # The first 2022 leave brings the user balance at -4
            self.env['hr.leave'].with_user(self.user_employee_id).create({
                'name': 'first 2022 leave of 5 days',
                'work_entry_type_id': self.work_entry_type.id,
                'employee_id': self.employee_emp.id,
                'request_date_from': datetime(2022, 10, 24),
                'request_date_to': datetime(2022, 10, 28),
            })

        with freeze_time('2023-10-02'):
            # At the start of 2023, the user receives 5 days, his balance is at 1
            # The first leave of 2023 brings the balance at -4
            self.env['hr.leave'].with_user(self.user_employee_id).create({
                'name': 'first 2023 leave of 5 days',
                'work_entry_type_id': self.work_entry_type.id,
                'employee_id': self.employee_emp.id,
                'request_date_from': datetime(2023, 10, 9),
                'request_date_to': datetime(2023, 10, 13),
            })

            # The leave should not be possible to take since it would bring the balance at -9
            with self.assertRaises(ValidationError):
                self.env['hr.leave'].with_user(self.user_employee_id).create({
                    'name': 'not takable leaves of 5 days',
                    'work_entry_type_id': self.work_entry_type.id,
                    'employee_id': self.employee_emp_id,
                    'request_date_from': datetime(2023, 10, 16),
                    'request_date_to': datetime(2023, 10, 20),
                })

            # The second leave of 2023 brings the balance at -5
            one_day_leave = self.env['hr.leave'].with_user(self.user_employee_id).create({
                'name': 'Second 2023 leave of 1 day',
                'work_entry_type_id': self.work_entry_type.id,
                'employee_id': self.employee_emp_id,
                'request_date_from': datetime(2023, 10, 23),
                'request_date_to': datetime(2023, 10, 23),
            })

            # The leave should not be possible to edit since it would bring the balance at -6
            with self.assertRaises(ValidationError):
                one_day_leave.with_user(self.user_hrmanager_id).write({
                    'request_date_to': datetime(2023, 10, 24),
                })

    def test_negative_allocation_not_allowed(self):
        """Negative allocation should fail when leave type doesn't allow it."""
        work_entry_type_no_negative = self.env['hr.work.entry.type'].create({
            'name': 'No Negative Allowed',
            'code': 'No Negative Allowed',
            'requires_allocation': True,
            'allows_negative': False,
        })
        with self.assertRaises(ValidationError):
            self.env['hr.leave.allocation'].create({
                'employee_id': self.employee_emp_id,
                'work_entry_type_id': work_entry_type_no_negative.id,
                'number_of_days': -3,
            })

    def test_negative_allocation_exceeds_limit_days(self):
        """Negative allocation exceeding limit should fail."""
        with self.assertRaises(ValidationError):
            self.env['hr.leave.allocation'].create({
                'employee_id': self.employee_emp_id,
                'work_entry_type_id': self.work_entry_type.id,
                'number_of_days': -6,  # exceeds max_allowed_negative of 5
            })

    def test_negative_allocation_exceeds_limit_hours(self):
        """Negative allocation exceeding limit should fail (hours)."""
        work_entry_type_hours = self.env['hr.work.entry.type'].create({
            'name': 'Negative Hours',
            'code': 'Negative Hours',
            'requires_allocation': True,
            'allows_negative': True,
            'max_allowed_negative': 10,
            'request_unit': 'hour',
            'unit_of_measure': 'hour',
        })
        # hours_per_day is 8, so -2 days = -16 hours (exceeds limit of 10)
        with self.assertRaises(ValidationError):
            self.env['hr.leave.allocation'].create({
                'employee_id': self.employee_emp_id,
                'work_entry_type_id': work_entry_type_hours.id,
                'number_of_days': -2,
            })

    def test_negative_excess_requests_ending_same_day(self):
        """Requests in excess that end on the same day must each be counted."""
        work_entry_type = self.env['hr.work.entry.type'].create({
            'name': 'Half days with negative',
            'code': 'Half days with negative',
            'leave_validation_type': 'no_validation',
            'requires_allocation': True,
            'allows_negative': True,
            'max_allowed_negative': 5,
            'request_unit': 'half_day',
            'unit_of_measure': 'day',
        })
        self.env['hr.leave.allocation'].create({
            'employee_id': self.employee_emp_id,
            'work_entry_type_id': work_entry_type.id,
            'date_from': '2023-01-01',
            'number_of_days': 1,
        })
        with freeze_time('2023-10-02'):
            Leave = self.env['hr.leave'].with_user(self.user_employee_id)
            # consumes the whole allocation
            Leave.create({
                'name': 'Full day',
                'work_entry_type_id': work_entry_type.id,
                'employee_id': self.employee_emp_id,
                'request_date_from': datetime(2023, 10, 9),
                'request_date_to': datetime(2023, 10, 9),
            })
            # two half days in excess, ending the same day
            morning, afternoon = (Leave.create({
                'name': f'Half day {period}',
                'work_entry_type_id': work_entry_type.id,
                'employee_id': self.employee_emp_id,
                'request_date_from': datetime(2023, 10, 10),
                'request_date_to': datetime(2023, 10, 10),
                'request_date_from_period': period,
                'request_date_to_period': period,
            }) for period in ('am', 'pm'))
            self.assertEqual((morning | afternoon).mapped('number_of_days'), [0.5, 0.5])

            data = work_entry_type.get_allocation_data(self.employee_emp, datetime(2023, 10, 10))[self.employee_emp][0][1]
            self.assertEqual(
                {excess['leave_id'] for excess in data['virtual_excess_data'].values()},
                {morning.id, afternoon.id},
                "Both requests in excess should be reported",
            )
            self.assertEqual(data['total_virtual_excess'], 1)
            self.assertEqual(data['virtual_remaining_leaves'], -1)
