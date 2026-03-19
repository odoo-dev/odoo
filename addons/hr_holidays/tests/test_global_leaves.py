# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import date, datetime, timedelta
from freezegun import freeze_time

from odoo.exceptions import ValidationError
from odoo.tests import common, tagged

from odoo.addons.mail.tests.common import mail_new_test_user

@tagged('global_leaves')
class TestGlobalLeaves(common.TransactionCase):
    """ Test global leaves for a whole company, conflict resolutions """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.company = cls.env.company
        cls.calendar_40, cls.calendar_20 = cls.env['resource.calendar'].create([
            {
                'name': 'Classic 40h/week',
                'hours_per_day': 8.0,
                'attendance_ids': [
                    (0, 0, {'dayofweek': '0', 'hour_from': 8, 'hour_to': 12}),
                    (0, 0, {'dayofweek': '0', 'hour_from': 13, 'hour_to': 17}),
                    (0, 0, {'dayofweek': '1', 'hour_from': 8, 'hour_to': 12}),
                    (0, 0, {'dayofweek': '1', 'hour_from': 13, 'hour_to': 17}),
                    (0, 0, {'dayofweek': '2', 'hour_from': 8, 'hour_to': 12}),
                    (0, 0, {'dayofweek': '2', 'hour_from': 13, 'hour_to': 17}),
                    (0, 0, {'dayofweek': '3', 'hour_from': 8, 'hour_to': 12}),
                    (0, 0, {'dayofweek': '3', 'hour_from': 13, 'hour_to': 17}),
                    (0, 0, {'dayofweek': '4', 'hour_from': 8, 'hour_to': 12}),
                    (0, 0, {'dayofweek': '4', 'hour_from': 13, 'hour_to': 17}),
                ],
            },{
                'name': 'Classic 20h/week',
                'hours_per_day': 4.0,
                'attendance_ids': [
                    (0, 0, {'dayofweek': '0', 'hour_from': 8, 'hour_to': 12}),
                    (0, 0, {'dayofweek': '1', 'hour_from': 8, 'hour_to': 12}),
                    (0, 0, {'dayofweek': '2', 'hour_from': 8, 'hour_to': 12}),
                    (0, 0, {'dayofweek': '3', 'hour_from': 8, 'hour_to': 12}),
                    (0, 0, {'dayofweek': '4', 'hour_from': 8, 'hour_to': 12}),
                ],
            },
        ])

        cls.employee_emp = cls.env['hr.employee'].create({
            'name': 'Johnny Holiday',
            'company_id': cls.company.id,
            'resource_calendar_id': cls.calendar_40.id,
        })

        cls.work_entry_type = cls.env['hr.work.entry.type'].create({
            'name': 'Paid Time Off',
            'code': 'Paid Time Off',
            'count_as': 'absence',
            'requires_allocation': False,
            'leave_validation_type': 'no_validation',
            'request_unit': 'day',
            'unit_of_measure': 'day',
        })

        cls.global_mon, cls.global_wed = cls.env['resource.public.holiday'].create([
            {
                'name': 'Global Time Off',
                'date': date(2022, 3, 7),  # Monday
                'calendar_ids': cls.calendar_40.ids,
            },
            {
                'name': 'Global Time Off',
                'date': date(2022, 3, 9),  # Wednesday
            }
        ])

    def test_leave_on_global_leave(self):
        with self.assertRaises(ValidationError):
            self.env['resource.public.holiday'].create({
                'name': 'Wrong Time Off',
                'date': date(2022, 3, 7),
                'calendar_ids': self.calendar_40.ids,
            })

        with self.assertRaises(ValidationError):
            self.env['resource.public.holiday'].create({
                'name': 'Wrong Time Off',
                'date': date(2022, 3, 9),
            })

    def test_global_leave_working_schedule_without_company(self):
        """
        Check public holidays for a company apply to employees of this company
        when using a working schedule without a company.
        """
        calendar_no_company = self.env['resource.calendar'].create({
            'name': 'Schedule without company',
            'company_id': False,
        })
        self.employee_emp.resource_calendar_id = calendar_no_company

        self.env['resource.public.holiday'].create({
            'name': 'Public Holiday',
            'date': datetime(2024, 1, 3),
            'company_id': self.employee_emp.company_id.id,
        })
        leave = self.env['hr.leave'].create({
            'name': 'Time Off',
            'employee_id': self.employee_emp.id,
            'work_entry_type_id': self.work_entry_type.id,
            'request_date_from': date(2024, 1, 2),
            'request_date_to': date(2024, 1, 4),
        })

        self.assertEqual(leave.number_of_days, 2, "Public holiday duration should not be included")

    def test_global_leave_number_of_days_with_new(self):
        """
            Check that leaves stored in memory (and not in the database)
            take into account global leaves.
        """
        global_leave = self.env['resource.calendar.leaves'].create({
            'name': 'Global Time Off',
            'date_from': datetime(2024, 1, 3, 6, 0, 0),
            'date_to': datetime(2024, 1, 3, 19, 0, 0),
            'calendar_id': self.calendar_1.id,
        })
        work_entry_type = self.env['hr.work.entry.type'].create({
            'name': 'Paid Time Off',
            'code': 'Paid Time Off',
            'count_as': 'absence',
            'requires_allocation': False,
            'request_unit': 'day',
            'unit_of_measure': 'day',
        })
        self.employee_emp.resource_calendar_id = self.calendar_1.id

        leave = self.env['hr.leave'].with_context(leave_fast_create=True).create({
            'name': 'Test new leave',
            'employee_id': self.employee_emp.id,
            'work_entry_type_id': self.work_entry_type.id,
            'request_date_from': self.global_wed.date,
            'request_date_to': self.global_wed.date,
        })
        self.assertEqual(leave.number_of_days, 0, 'It is a global leave')

        leave = self.env['hr.leave'].new({
            'name': 'Test new leave',
            'employee_id': self.employee_emp.id,
            'work_entry_type_id': self.work_entry_type.id,
            'request_date_from': self.global_wed.date - timedelta(days=1),
            'request_date_to': self.global_wed.date + timedelta(days=1),
        })
        self.assertEqual(leave.number_of_days, 2, 'There is a global leave')

    @freeze_time('2026-03-19')
    def test_load_public_holidays_opens_preview_wizard(self):
        self.company.country_id = self.env.ref('base.be')
        self.company.tz = 'Europe/Brussels'
        self.external_company.country_id = self.env.ref('base.in')
        self.external_company.tz = 'Asia/Kolkata'
        companies = self.company + self.external_company
        public_holidays_domain = [
            ('company_id', 'in', companies.ids),
            ('resource_id', '=', False),
            ('date_from', '>=', datetime(2025, 12, 31, 0, 0, 0)),
            ('date_to', '<=', datetime(2027, 1, 2, 0, 0, 0)),
        ]
        existing_public_holidays = self.env['resource.calendar.leaves'].search(public_holidays_domain)

        action = self.env['resource.calendar.leaves'].with_context(
            allowed_company_ids=companies.ids,
        ).load_public_holidays()

        self.assertEqual(action['res_model'], 'load.public.holiday.wizard')
        self.assertEqual(action['target'], 'new')

        wizard = self.env['load.public.holiday.wizard'].create({})
        self.assertEqual(wizard.year, 2026)
        self.assertTrue(wizard.line_ids.filtered(
            lambda line: line.company_id == self.company
            and line.start_date == date(2026, 1, 1)
            and line.name == "New Year's Day"
        ))
        self.assertTrue(wizard.line_ids.filtered(
            lambda line: line.company_id == self.external_company
            and line.start_date == date(2026, 1, 26)
            and line.name == "Republic Day"
        ))
        self.assertEqual(
            self.env['resource.calendar.leaves'].search(public_holidays_domain),
            existing_public_holidays,
        )

    def test_public_holiday_wizard_add_creates_records_only_on_confirmation(self):
        self.company.country_id = self.env.ref('base.be')
        self.company.tz = 'Europe/Brussels'

        wizard_model = self.env['load.public.holiday.wizard'].with_context(
            allowed_company_ids=self.company.ids,
            params={'view_type': 'list'},
        )
        wizard = wizard_model.create({'year': 2026})

        expected_count = len(wizard.line_ids)
        public_holidays_domain = [
            ('company_id', '=', self.company.id),
            ('resource_id', '=', False),
            ('date_from', '>=', datetime(2025, 12, 31, 0, 0, 0)),
            ('date_to', '<=', datetime(2027, 1, 2, 0, 0, 0)),
        ]
        existing_public_holidays = self.env['resource.calendar.leaves'].search(public_holidays_domain)

        action = wizard.action_add_public_holidays()

        self.assertEqual(action['type'], 'ir.actions.client')
        public_holidays = self.env['resource.calendar.leaves'].search(public_holidays_domain)
        created_leaves = public_holidays - existing_public_holidays
        self.assertEqual(len(created_leaves), expected_count)
        self.assertTrue(created_leaves.filtered(lambda leave: leave.name == "New Year's Day"))

        second_wizard = wizard_model.create({'year': 2026})

        self.assertFalse(second_wizard.line_ids)
        self.assertIn('All public holidays for 2026 are already present', second_wizard.warning_message)

    @freeze_time('2024-12-01')
    def test_global_leave_keeps_employee_resource_leave(self):
        """
            When a global leave is created, and it happens during a leave period of an employee,
            if the employee's leave is not fully covered by the global leave, the employee's leave
            should still have resource leaves linked to it.
        """
        partially_covered_leave = self.env['hr.leave'].create({
            'name': 'Holiday 1 week',
            'employee_id': self.employee_emp.id,
            'work_entry_type_id': self.work_entry_type.id,
            'request_date_from': datetime(2024, 12, 3),
            'request_date_to': datetime(2024, 12, 5),
        })

        self.env['resource.public.holiday'].with_user(self.env.user).create({
            'name': 'Public holiday',
            'date': date(2024, 12, 4),
            'resource_calendar_id': self.calendar_40.id,
        })

        # retrieve resource leaves linked to the employee's leave
        resource_leaves = self.env['resource.calendar.leaves'].search([
            ('holiday_id', '=', partially_covered_leave.id),
        ])
        self.assertTrue(resource_leaves, 'Resource leaves linked to the employee leave should exist.')

    @freeze_time('2025-05-11')
    def test_employee_leave_with_global_leave(self):
        """
            When an employee's leave is created, if there are any public holidays within the leave period,
            the number of leave days is reduced accordingly.
            eg,.
            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            | Leave Requested  |  Leave State  | Public Holiday days  |  # days leave remains |
            |---------------------------------------------------------------------------------|
            |       5 Days     |    confirm    |        1 Days        |         4 Days        |
            |---------------------------------------------------------------------------------|
            |       4 Days     |   validate1   |        1 Days        |         3 Days        |
            |---------------------------------------------------------------------------------|
            |       3 Days     |    validate   |        1 Days        |         2 Days        |
            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

        """
        user_david = mail_new_test_user(self.env, login='david', groups='base.group_user,hr_holidays.group_hr_holidays_employee')
        user_timeoff_officer_david = mail_new_test_user(self.env, login='timeoff_officer', groups='base.group_user,hr_holidays.group_hr_holidays_employee')
        user_hruser = mail_new_test_user(self.env, login='armande', groups='base.group_user,hr_holidays.group_hr_holidays_user')

        self.employee_emp.user_id = user_hruser

        employee_david = self.env['hr.employee'].create({
            'name': 'David Employee',
            'user_id': user_david.id,
            'leave_manager_id': user_timeoff_officer_david.id,
            'parent_id': self.employee_emp.id,
            'resource_calendar_id': self.calendar_40.id,
        })
        self.work_entry_type.leave_validation_type = 'both'

        employee_leave = self.env['hr.leave'].with_context(leave_fast_create=True).create({
            'name': 'Holiday 5 days',
            'employee_id': employee_david.id,
            'work_entry_type_id': self.work_entry_type.id,
            'request_date_from': datetime(2025, 5, 12),
            'request_date_to': datetime(2025, 5, 16),
        })
        self.env['resource.public.holiday'].create({'name': 'Public holiday day 1', 'date': date(2025, 5, 13)})
        self.assertEqual(employee_leave.number_of_days, 4, 'Leave duration should be reduced because of public holiday day 1')

        employee_leave.with_user(user_timeoff_officer_david).action_approve()
        self.env['resource.public.holiday'].create({'name': 'Public holiday day 2', 'date': date(2025, 5, 14)})
        self.assertEqual(employee_leave.number_of_days, 3, 'Leave duration should be reduced because of public holiday day 2')

        employee_leave.with_user(user_hruser).action_approve()
        self.env['resource.public.holiday'].create({'name': 'Public holiday day 3', 'date': date(2025, 5, 15)})
        self.assertEqual(employee_leave.number_of_days, 2, 'Leave duration should be reduced because of public holiday day 3')

    def test_public_holidays_for_flexible_schedule(self):
        """
        Test that _get_unusual_days return correct value for
        multi-day holidays in flexible schedules
        """

        flex_resource = self.env['resource.resource'].create({
            'name': 'Flexible',
            'calendar_id': False,
            'hours_per_week': 40.0,
            'hours_per_day': 8,
            'tz': 'UTC',
        })

        # tuesday to thursday
        self.env['resource.public.holiday'].create({
            'name': '3 day holiday',
            'date': date(2024, 3, 5),
            'calendar_ids': False,
        })

        # monday to saturday
        start = datetime(2024, 3, 4)
        end = datetime(2024, 3, 10)

        flex_days = self.env['resource.calendar']._get_unusual_days(start, end, resource=flex_resource)

        expected = {
            '2024-03-04': False,
            '2024-03-05': True,
            '2024-03-06': False,
            '2024-03-07': False,
            '2024-03-08': False,
            '2024-03-09': False,
            '2024-03-10': False,
        }
        for day, value in expected.items():
            self.assertEqual(flex_days.get(day), value, f"Day {day} should be {'unusual' if value else 'normal'}")

    def test_public_holidays_for_consecutive_allocations(self):
        employee = self.employee_emp
        self.work_entry_type.requires_allocation = True
        self.env['hr.leave.allocation'].create([
            {
                'name': '2025 allocation',
                'work_entry_type_id': self.work_entry_type.id,
                'number_of_days': 20,
                'employee_id': employee.id,
                'state': 'confirm',
                'date_from': date(2025, 1, 1),
                'date_to': date(2025, 12, 31),
            },
            {
                'name': '2026 allocation',
                'work_entry_type_id': self.work_entry_type.id,
                'number_of_days': 20,
                'employee_id': employee.id,
                'state': 'confirm',
                'date_from': date(2026, 1, 1),
                'date_to': date(2026, 12, 31),
            }
        ]).action_approve()

        leave = self.env['hr.leave'].create({
            'name': 'Holiday 1 week',
            'employee_id': employee.id,
            'work_entry_type_id': self.work_entry_type.id,
            'request_date_from': datetime(2025, 12, 8, 7, 0),
            'request_date_to': datetime(2026, 1, 3, 18, 0),
        })
        self.assertEqual(leave.number_of_days, 20, "Number of days should be 20")

        public_holiday = self.env['resource.public.holiday'].create({
            'name': 'Global Time Off',
            'date': datetime(2025, 12, 31),
        })

        self.assertTrue(public_holiday)
        self.assertEqual(leave.number_of_days, 19, "Number of days should be 19 as one day has been granted back to the"
                                                   "the employee for the public holiday")
