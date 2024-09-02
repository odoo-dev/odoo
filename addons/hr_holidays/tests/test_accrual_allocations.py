import datetime
from freezegun import freeze_time
from dateutil.relativedelta import relativedelta

from odoo import Command
from odoo.exceptions import UserError
from odoo.tests import tagged, Form
from odoo.exceptions import ValidationError

from odoo.addons.hr_holidays.tests.common import TestHrHolidaysCommon


@tagged('post_install', '-at_install', 'accruals')
class TestAccrualAllocations(TestHrHolidaysCommon):
    @classmethod
    def setUpClass(cls):
        super(TestAccrualAllocations, cls).setUpClass()
        cls.leave_type = cls.env['hr.leave.type'].create({
            'name': 'Paid Time Off',
            'time_type': 'leave',
            'requires_allocation': 'yes',
            'allocation_validation_type': 'hr',
        })
        cls.leave_type_hour = cls.env['hr.leave.type'].create({
            'name': 'Paid Time Off',
            'time_type': 'leave',
            'requires_allocation': 'yes',
            'allocation_validation_type': 'hr',
            'request_unit': 'hour',
        })

    def setAllocationCreateDate(self, allocation_id, date):
        """ This method is a hack in order to be able to define/redefine the create_date
            of the allocations.
            This is done in SQL because ORM does not allow to write onto the create_date field.
        """
        self.env.cr.execute("""
                       UPDATE
                       hr_leave_allocation
                       SET create_date = '%s'
                       WHERE id = %s
                       """ % (date, allocation_id))

    def test_consistency_between_cap_accrued_time_and_maximum_leave(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'level_ids': [(0, 0, {
                'start_count': 1,
                'start_type': 'day',
                'added_value': 1,
                'added_value_type': 'day',
                'frequency': 'hourly',
                'cap_accrued_time': True,
                'maximum_leave': 10000
            })],
        })
        level = accrual_plan.level_ids
        level.maximum_leave = 10
        self.assertEqual(accrual_plan.level_ids.maximum_leave, 10)

        with self.assertRaises(UserError):
            level.maximum_leave = 0

        level.cap_accrued_time = False
        self.assertEqual(accrual_plan.level_ids.maximum_leave, 0)

    def test_accrual_unlink(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
        })

        allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
            'name': 'Accrual allocation for employee',
            'accrual_plan_id': accrual_plan.id,
            'employee_id': self.employee_emp.id,
            'holiday_status_id': self.leave_type.id,
            'number_of_days': 0,
            'allocation_type': 'accrual',
        })

        with self.assertRaises(ValidationError):
            accrual_plan.unlink()

        allocation.unlink()
        accrual_plan.unlink()

    def test_frequency_hourly_calendar(self):
        with freeze_time("2017-12-5"):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'added_value_type': 'day',
                    'frequency': 'hourly',
                    'cap_accrued_time': True,
                    'maximum_leave': 10000
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()
            self.assertFalse(allocation.nextcall, 'There should be no nextcall set on the allocation.')
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet.')
            allocation._update_accrual()
            tomorrow = datetime.date.today() + relativedelta(days=2)
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet. The accrual starts tomorrow.')

            with freeze_time(tomorrow):
                allocation._update_accrual()
                nextcall = datetime.date.today() + relativedelta(days=1)
                self.assertEqual(allocation.number_of_days, 8, 'There should be 8 day allocated.')
                self.assertEqual(allocation.nextcall, nextcall, 'The next call date of the cron should be in 2 days.')
                allocation._update_accrual()
                self.assertEqual(allocation.number_of_days, 8, 'There should be only 8 day allocated.')

    def test_frequency_hourly_worked_hours(self):
        with freeze_time("2017-12-5"):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'is_based_on_worked_time': True,
                'level_ids': [(0, 0, {
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'added_value_type': 'day',
                    'frequency': 'hourly',
                    'cap_accrued_time': True,
                    'maximum_leave': 10000
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()
            self.assertFalse(allocation.nextcall, 'There should be no nextcall set on the allocation.')
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet.')
            allocation._update_accrual()
            tomorrow = datetime.date.today() + relativedelta(days=2)
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet. The accrual starts tomorrow.')

            leave_type = self.env['hr.leave.type'].create({
                'name': 'Paid Time Off',
                'requires_allocation': 'no',
                'responsible_ids': [(4, self.user_hrmanager_id)],
                'time_type': 'leave',
                'request_unit': 'half_day',
            })
            leave = self.env['hr.leave'].create({
                'name': 'leave',
                'employee_id': self.employee_emp.id,
                'holiday_status_id': leave_type.id,
                'request_date_from': '2017-12-06 08:00:00',
                'request_date_to': '2017-12-06 17:00:00',
                'request_unit_half': True,
                'request_date_from_period': 'am',
            })
            leave.action_validate()

            with freeze_time(tomorrow):
                allocation._update_accrual()
                nextcall = datetime.date.today() + relativedelta(days=1)
                self.assertEqual(allocation.number_of_days, 4, 'There should be 4 day allocated.')
                self.assertEqual(allocation.nextcall, nextcall, 'The next call date of the cron should be in 2 days.')
                allocation._update_accrual()
                self.assertEqual(allocation.number_of_days, 4, 'There should be only 4 day allocated.')

    def test_frequency_daily(self):
        with freeze_time("2017-12-5"):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'added_value_type': 'day',
                    'frequency': 'daily',
                    'cap_accrued_time': True,
                    'maximum_leave': 10000
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()
            self.assertFalse(allocation.nextcall, 'There should be no nextcall set on the allocation.')
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet.')
            allocation._update_accrual()
            tomorrow = datetime.date.today() + relativedelta(days=2)
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet. The accrual starts tomorrow.')

            with freeze_time(tomorrow):
                allocation._update_accrual()
                nextcall = datetime.date.today() + relativedelta(days=1)
                self.assertEqual(allocation.number_of_days, 1, 'There should be 1 day allocated.')
                self.assertEqual(allocation.nextcall, nextcall, 'The next call date of the cron should be in 2 days.')
                allocation._update_accrual()
                self.assertEqual(allocation.number_of_days, 1, 'There should be only 1 day allocated.')

    def test_frequency_weekly(self):
        with freeze_time("2017-12-5"):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'weekly',
                    'cap_accrued_time': True,
                    'maximum_leave': 10000
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2021-09-03',
            })
            with freeze_time(datetime.date.today() + relativedelta(days=2)):
                allocation.action_validate()
                self.assertFalse(allocation.nextcall, 'There should be no nextcall set on the allocation.')
                self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet.')
                allocation._update_accrual()
                nextWeek = allocation.date_from + relativedelta(days=1, weekday=0)
                self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet. The accrual starts tomorrow.')

            with freeze_time(nextWeek):
                allocation._update_accrual()
                nextWeek = datetime.date.today() + relativedelta(days=1, weekday=0)
                # Prorated
                self.assertAlmostEqual(allocation.number_of_days, 0.2857, 4, 'There should be 0.2857 day allocated.')
                self.assertEqual(allocation.nextcall, nextWeek, 'The next call date of the cron should be in 2 weeks')

            with freeze_time(nextWeek):
                allocation._update_accrual()
                nextWeek = datetime.date.today() + relativedelta(days=1, weekday=0)
                self.assertAlmostEqual(allocation.number_of_days, 1.2857, 4, 'There should be 1.2857 day allocated.')
                self.assertEqual(allocation.nextcall, nextWeek, 'The next call date of the cron should be in 2 weeks')

    def test_frequency_bimonthly(self):
        with freeze_time('2021-09-01'):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'bimonthly',
                    'first_day': 1,
                    'second_day': 15,
                    'cap_accrued_time': True,
                    'maximum_leave': 10000,
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2021-09-03',
            })
            self.setAllocationCreateDate(allocation.id, '2021-09-01 00:00:00')
            allocation.action_validate()
            self.assertFalse(allocation.nextcall, 'There should be no nextcall set on the allocation.')
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet.')
            allocation._update_accrual()
            next_date = datetime.date(2021, 9, 15)
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet. The accrual starts tomorrow.')

        with freeze_time(next_date):
            next_date = datetime.date(2021, 10, 1)
            allocation._update_accrual()
            # Prorated
            self.assertAlmostEqual(allocation.number_of_days, 0.7857, 4, 'There should be 0.7857 day allocated.')
            self.assertEqual(allocation.nextcall, next_date, 'The next call date of the cron should be October 1st')

        with freeze_time(next_date):
            allocation._update_accrual()
            # Not Prorated
            self.assertAlmostEqual(allocation.number_of_days, 1.7857, 4, 'There should be 1.7857 day allocated.')

    def test_frequency_monthly(self):
        with freeze_time('2021-09-01'):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'monthly',
                    'cap_accrued_time': True,
                    'maximum_leave': 10000
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2021-08-31',
            })
            self.setAllocationCreateDate(allocation.id, '2021-09-01 00:00:00')
            allocation.action_validate()
            self.assertFalse(allocation.nextcall, 'There should be no nextcall set on the allocation.')
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet.')
            allocation._update_accrual()
            next_date = datetime.date(2021, 10, 1)
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet. The accrual starts tomorrow.')

        with freeze_time(next_date):
            next_date = datetime.date(2021, 11, 1)
            allocation._update_accrual()
            # Prorata = 1 since a whole month passed
            self.assertEqual(allocation.number_of_days, 1, 'There should be 1 day allocated.')
            self.assertEqual(allocation.nextcall, next_date, 'The next call date of the cron should be November 1st')

    def test_frequency_biyearly(self):
        with freeze_time('2021-09-01'):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'biyearly',
                    'cap_accrued_time': True,
                    'maximum_leave': 10000,
                })],
            })
            # this sets up an accrual on the 1st of January and the 1st of July
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            self.setAllocationCreateDate(allocation.id, '2021-09-01 00:00:00')
            allocation.action_validate()
            self.assertFalse(allocation.nextcall, 'There should be no nextcall set on the allocation.')
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet.')
            allocation._update_accrual()
            next_date = datetime.date(2022, 1, 1)
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet. The accrual starts tomorrow.')

        with freeze_time(next_date):
            next_date = datetime.date(2022, 7, 1)
            allocation._update_accrual()
            # Prorated
            self.assertAlmostEqual(allocation.number_of_days, 0.6576, 4, 'There should be 0.6576 day allocated.')
            self.assertEqual(allocation.nextcall, next_date, 'The next call date of the cron should be July 1st')

        with freeze_time(next_date):
            allocation._update_accrual()
            # Not Prorated
            self.assertAlmostEqual(allocation.number_of_days, 1.6576, 4, 'There should be 1.6576 day allocated.')

    def test_frequency_yearly(self):
        with freeze_time('2021-09-01'):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'yearly',
                    'cap_accrued_time': True,
                    'maximum_leave': 10000,
                })],
            })
            # this sets up an accrual on the 1st of January
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            self.setAllocationCreateDate(allocation.id, '2021-09-01 00:00:00')
            allocation.action_validate()
            self.assertFalse(allocation.nextcall, 'There should be no nextcall set on the allocation.')
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet.')
            allocation._update_accrual()
            next_date = datetime.date(2022, 1, 1)
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet. The accrual starts tomorrow.')

        with freeze_time(next_date):
            next_date = datetime.date(2023, 1, 1)
            allocation._update_accrual()
            self.assertAlmostEqual(allocation.number_of_days, 0.3315, 4, 'There should be 0.3315 day allocated.')
            self.assertEqual(allocation.nextcall, next_date, 'The next call date of the cron should be January 1st 2023')

        with freeze_time(next_date):
            allocation._update_accrual()
            self.assertAlmostEqual(allocation.number_of_days, 1.3315, 4, 'There should be 1.3315 day allocated.')

    def test_check_gain(self):
        # 2 accruals, one based on worked time, one not
        # check gain
        with freeze_time('2021-08-30'):
            attendances = []
            for index in range(5):
                attendances.append((0, 0, {
                    'name': '%s_%d' % ('40 Hours', index),
                    'hour_from': 8,
                    'hour_to': 12,
                    'dayofweek': str(index),
                    'day_period': 'morning'
                }))
                attendances.append((0, 0, {
                    'name': '%s_%d' % ('40 Hours', index),
                    'hour_from': 12,
                    'hour_to': 13,
                    'dayofweek': str(index),
                    'day_period': 'lunch'
                }))
                attendances.append((0, 0, {
                    'name': '%s_%d' % ('40 Hours', index),
                    'hour_from': 13,
                    'hour_to': 17,
                    'dayofweek': str(index),
                    'day_period': 'afternoon'
                }))
            calendar_emp = self.env['resource.calendar'].create({
                'name': '40 Hours',
                'tz': self.employee_emp.tz,
                'attendance_ids': attendances,
            })
            self.employee_emp.resource_calendar_id = calendar_emp.id

            accrual_plan_not_based_on_worked_time = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 5,
                    'frequency': 'weekly',
                    'cap_accrued_time': True,
                    'maximum_leave': 10000,
                })],
            })
            accrual_plan_based_on_worked_time = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'is_based_on_worked_time': True,
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 5,
                    'frequency': 'weekly',
                    'cap_accrued_time': True,
                    'maximum_leave': 10000,
                })],
            })
            allocation_not_worked_time = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan_not_based_on_worked_time.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'state': 'confirm',
            })
            allocation_worked_time = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan_based_on_worked_time.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'state': 'confirm',
            })
            (allocation_not_worked_time | allocation_worked_time).action_validate()
            self.setAllocationCreateDate(allocation_not_worked_time.id, '2021-08-01 00:00:00')
            self.setAllocationCreateDate(allocation_worked_time.id, '2021-08-01 00:00:00')
            leave_type = self.env['hr.leave.type'].create({
                'name': 'Paid Time Off',
                'requires_allocation': 'no',
                'responsible_ids': [Command.link(self.user_hrmanager_id)],
                'time_type': 'leave',
            })
            leave = self.env['hr.leave'].create({
                'name': 'leave',
                'employee_id': self.employee_emp.id,
                'holiday_status_id': leave_type.id,
                'request_date_from': '2021-09-02',
                'request_date_to': '2021-09-02',
            })
            leave.action_validate()
            self.assertFalse(allocation_not_worked_time.nextcall, 'There should be no nextcall set on the allocation.')
            self.assertFalse(allocation_worked_time.nextcall, 'There should be no nextcall set on the allocation.')
            self.assertEqual(allocation_not_worked_time.number_of_days, 0, 'There should be no days allocated yet.')
            self.assertEqual(allocation_worked_time.number_of_days, 0, 'There should be no days allocated yet.')

        next_date = datetime.date(2021, 9, 6)
        with freeze_time(next_date):
            # next_date = datetime.date(2021, 9, 13)
            self.env['hr.leave.allocation']._update_accrual()
            # Prorated
            self.assertAlmostEqual(allocation_not_worked_time.number_of_days, 4.2857, 4, 'There should be 4.2857 days allocated.')
            # 3.75 -> starts 1 day after allocation date -> 31/08-3/09 => 4 days - 1 days time off => (3 / 4) * 5 days
            # ^ result without prorata
            # Prorated
            self.assertAlmostEqual(allocation_worked_time.number_of_days, 3, 4, 'There should be 3 days allocated.')
            self.assertEqual(allocation_not_worked_time.nextcall, datetime.date(2021, 9, 13), 'The next call date of the cron should be the September 13th')
            self.assertEqual(allocation_worked_time.nextcall, datetime.date(2021, 9, 13), 'The next call date of the cron should be the September 13th')

        with freeze_time(next_date + relativedelta(days=7)):
            next_date = datetime.date(2021, 9, 20)
            self.env['hr.leave.allocation']._update_accrual()
            self.assertAlmostEqual(allocation_not_worked_time.number_of_days, 9.2857, 4, 'There should be 9.2857 days allocated.')
            self.assertEqual(allocation_not_worked_time.nextcall, next_date, 'The next call date of the cron should be September 20th')
            self.assertAlmostEqual(allocation_worked_time.number_of_days, 8, 4, 'There should be 8 days allocated.')
            self.assertEqual(allocation_worked_time.nextcall, next_date, 'The next call date of the cron should be September 20th')

    def test_check_max_value(self):
        with freeze_time("2017-12-5"):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'daily',
                    'cap_accrued_time': True,
                    'maximum_leave': 1,
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()
            allocation._update_accrual()
            tomorrow = datetime.date.today() + relativedelta(days=2)
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet. The accrual starts tomorrow.')

            with freeze_time(tomorrow):
                allocation._update_accrual()
                nextcall = datetime.date.today() + relativedelta(days=1)
                allocation._update_accrual()
                self.assertEqual(allocation.number_of_days, 1, 'There should be only 1 day allocated.')

            with freeze_time(nextcall):
                allocation._update_accrual()
                nextcall = datetime.date.today() + relativedelta(days=1)
                # The maximum value is 1 so this shouldn't change anything
                allocation._update_accrual()
                self.assertEqual(allocation.number_of_days, 1, 'There should be only 1 day allocated.')

    def test_check_max_value_hours(self):
        with freeze_time("2017-12-5"):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'hour',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'daily',
                    'cap_accrued_time': True,
                    'maximum_leave': 4,
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()
            allocation._update_accrual()
            tomorrow = datetime.date.today() + relativedelta(days=2)
            self.assertEqual(allocation.number_of_days, 0, 'There should be no days allocated yet. The accrual starts tomorrow.')

            with freeze_time(tomorrow):
                allocation._update_accrual()
                nextcall = datetime.date.today() + relativedelta(days=10)
                allocation._update_accrual()
                self.assertEqual(allocation.number_of_days, 0.125, 'There should be only 0.125 days allocated.')

            with freeze_time(nextcall):
                allocation._update_accrual()
                nextcall = datetime.date.today() + relativedelta(days=1)
                # The maximum value is 1 so this shouldn't change anything
                allocation._update_accrual()
                self.assertEqual(allocation.number_of_days, 0.5, 'There should be only 0.5 days allocated.')

    def test_accrual_transition_immediately(self):
        with freeze_time("2017-12-5"):
            # 1 accrual with 2 levels and level transition immediately
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'transition_mode': 'immediately',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'weekly',
                    'cap_accrued_time': True,
                    'maximum_leave': 1,
                }), (0, 0, {
                    'start_count': 10,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'weekly',
                    'cap_accrued_time': True,
                    'maximum_leave': 1,
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()
            next_date = datetime.date.today() + relativedelta(days=11)
            second_level = self.env['hr.leave.accrual.level'].search([('accrual_plan_id', '=', accrual_plan.id), ('start_count', '=', 10)])
            self.assertEqual(allocation._get_current_accrual_plan_level_id(next_date)[0], second_level, 'The second level should be selected')

    def test_accrual_transition_after_period(self):
        with freeze_time("2017-12-5"):
            # 1 accrual with 2 levels and level transition after
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'transition_mode': 'end_of_accrual',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'weekly',
                    'cap_accrued_time': True,
                    'maximum_leave': 1,
                }), (0, 0, {
                    'start_count': 10,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'weekly',
                    'cap_accrued_time': True,
                    'maximum_leave': 1,
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()
            next_date = datetime.date.today() + relativedelta(days=11)
            second_level = self.env['hr.leave.accrual.level'].search([('accrual_plan_id', '=', accrual_plan.id), ('start_count', '=', 10)])
            self.assertEqual(allocation._get_current_accrual_plan_level_id(next_date)[0], second_level, 'The second level should be selected')

    def test_unused_accrual_lost(self):
        """
        Create an accrual plan:
            - Carryover date:  January 1st.
        Create a milestone:
            - Number of accrued days: 1
            - Frequency: daily
            - Start accrual 1 day after the allocation start date.
            - Carryover policy: No days carry over.
            - Accrued days cap: 20 days.
        Create an allocation:
            - Start date: 15/12/2021
            - Type: Accrual
            - Accrual Plan: Use the one defined above.
            - Number of days (given to the employee on the first run of the accrual plan): 10 days

        The employee is given 10 days on the first run of the accrual plan.
        From 15/12/2021, to 31/12/2021 10 days are accrued to the employee (It should be 16 but the accrued days cap is 20 days).
        On 01/01/2022
            - No days will carry over from the 25 days that the employee has.
            - 1 day is accrued.
            - The total number of days that the employee has is 1 day.
        """
        with freeze_time('2021-12-15'):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'daily',
                    'cap_accrued_time': True,
                    'maximum_leave': 20,
                    'action_with_unused_accruals': 'lost',
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 10,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()

        # Reset the cron's lastcall
        accrual_cron = self.env['ir.cron'].sudo().env.ref('hr_holidays.hr_leave_allocation_cron_accrual')
        accrual_cron.lastcall = datetime.date(2021, 12, 15)
        with freeze_time('2022-01-01'):
            allocation._update_accrual()
            self.assertEqual(allocation.number_of_days, 1,
                             'The number of days should reset and 1 day will be accrued on 01/01/2022.')

    def test_unused_accrual_postponed(self):
        # 1 accrual with 2 levels and level transition after
        # This also tests retroactivity
        with freeze_time('2021-12-15'):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'daily',
                    'cap_accrued_time': True,
                    'maximum_leave': 25,
                    'action_with_unused_accruals': 'all',
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 10,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()

        # Reset the cron's lastcall
        accrual_cron = self.env['ir.cron'].sudo().env.ref('hr_holidays.hr_leave_allocation_cron_accrual')
        accrual_cron.lastcall = datetime.date(2021, 12, 15)
        with freeze_time('2022-01-01'):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 25, 'The maximum number of days should be reached and kept.')

    def test_unused_accrual_postponed_2(self):
        with freeze_time('2021-01-01'):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 0,
                    'start_type': 'day',
                    'added_value': 2,
                    'frequency': 'yearly',
                    'cap_accrued_time': True,
                    'maximum_leave': 100,
                    'action_with_unused_accruals': 'maximum',
                    'postpone_max_days': 10,
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()

        # Reset the cron's lastcall
        accrual_cron = self.env['ir.cron'].sudo().env.ref('hr_holidays.hr_leave_allocation_cron_accrual')
        accrual_cron.lastcall = datetime.date(2021, 1, 1)
        with freeze_time('2023-01-26'):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 4, 'The maximum number of days should be reached and kept.')

    def test_unused_accrual_postponed_limit(self):
        """
        Create an accrual plan:
            - Carryover date:  January 1st.
            - The days are accrued at the start of the accrual period.
        Create a milestone:
            - Number of accrued days: 1
            - Frequency: daily
            - Start accrual 1 day after the allocation start date.
            - Carryover policy: Carryover with a maximum
            - Carryover limit: 15 days
            - Accrued days cap: 25 days.
        Create an allocation:
            - Start date: 15/12/2021
            - Type: Accrual
            - Accrual Plan: Use the one defined above.
            - Number of days (given to the employee on the first run of the accrual plan): 10 days

        The employee is given 10 days on the first run of the accrual plan.
        From 15/12/2021, to 31/12/2021 15 days are accrued to the employee (It should be 16 but the accrued days cap is 25 days).
        On 01/01/2022
            - Only 15 days carry over from the 25 days that the employee has.
            - 1 Additional day is accrued.
            - The total number of days that the employee has is 16 days.
        """
        # 1 accrual with 2 levels and level transition after
        # This also tests retroactivity
        with freeze_time('2021-12-15'):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'accrued_gain_time': 'start',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'daily',
                    'cap_accrued_time': True,
                    'maximum_leave': 25,
                    'action_with_unused_accruals': 'maximum',
                    'postpone_max_days': 15,
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 10,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()

        # Reset the cron's lastcall
        accrual_cron = self.env['ir.cron'].sudo().env.ref('hr_holidays.hr_leave_allocation_cron_accrual')
        accrual_cron.lastcall = datetime.date(2021, 12, 15)
        with freeze_time('2022-01-01'):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 16,
                          '15 days carryover. 1 day is accrued for the new accrual period. The total is 16 days.')

    def test_unused_accrual_postponed_limit_2(self):
        """
        Create an accrual plan:
            - Carryover date:  January 1st.
        Create a milestone:
            - Number of accrued days: 15
            - Frequency: Yearly
            - Accrual date: January 1st
            - Carryover policy: Carryover with a maximum
            - Carryover limit: 7 days
        Create an allocation:
            - Start date: 01/01/2021
            - Type: Accrual
            - Accrual Plan: Use the one defined above.

        On 01/01/2022, 15 days are accrued to the employee.
        On 01/01/2023:
            - Only 7 days carry over from the 15 days that the employee has.
            - 15 Additional days are accrued.
            - The total number of days that the employee has is 22 days.
        """
        with freeze_time('2021-01-01'):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
                'level_ids': [(0, 0, {
                    'added_value_type': 'day',
                    'start_count': 0,
                    'start_type': 'day',
                    'added_value': 15,
                    'frequency': 'yearly',
                    'cap_accrued_time': True,
                    'maximum_leave': 100,
                    'action_with_unused_accruals': 'maximum',
                    'postpone_max_days': 7,
                })],
            })
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()

        # Reset the cron's lastcall
        accrual_cron = self.env['ir.cron'].sudo().env.ref('hr_holidays.hr_leave_allocation_cron_accrual')
        accrual_cron.lastcall = datetime.date(2021, 1, 1)
        with freeze_time('2023-01-26'):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 22,
                         '7 days carryover from the previous accrual period. 15 days are accrued for the new accrual period. The total is 22 days.')

    def test_accrual_skipped_period(self):
        # Test that when an allocation is made in the past and the second level is technically reached
        #  that the first level is not skipped completely.
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 15,
                'frequency': 'biyearly',
                'cap_accrued_time': True,
                'maximum_leave': 100,
                'action_with_unused_accruals': 'all',
            }), (0, 0, {
                'start_count': 4,
                'start_type': 'month',
                'added_value': 10,
                'frequency': 'biyearly',
                'cap_accrued_time': True,
                'maximum_leave': 500,
                'action_with_unused_accruals': 'all',
            })],
        })
        with freeze_time('2020-8-16'):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual Allocation - Test',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': datetime.date(2020, 8, 16),
            })
            allocation.action_validate()
        with freeze_time('2022-1-10'):
            allocation._update_accrual()
        self.assertAlmostEqual(allocation.number_of_days, 30.82, 2, "Invalid number of days")

    def test_three_levels_accrual(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 2,
                'start_type': 'month',
                'added_value': 3,
                'frequency': 'monthly',
                'cap_accrued_time': True,
                'maximum_leave': 3,
                'action_with_unused_accruals': 'all',
                'first_day': 31,
            }), (0, 0, {
                'start_count': 3,
                'start_type': 'month',
                'added_value': 6,
                'frequency': 'monthly',
                'cap_accrued_time': True,
                'maximum_leave': 6,
                'action_with_unused_accruals': 'all',
                'first_day': 31,
            }), (0, 0, {
                'start_count': 4,
                'start_type': 'month',
                'added_value': 1,
                'frequency': 'monthly',
                'cap_accrued_time': True,
                'maximum_leave': 100,
                'action_with_unused_accruals': 'all',
                'first_day': 31,
            })],
        })
        with freeze_time('2022-1-31'):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual Allocation - Test',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': datetime.date(2022, 1, 31),
            })
            allocation.action_validate()
        with freeze_time('2022-7-20'):
            allocation._update_accrual()
        # The first level gives 3 days
        # The second level could give 6 days but since the first level was already giving
        # 3 days, the second level gives 3 days to reach the second level's limit.
        # The third level gives 1 day since it only counts for one iteration.
        self.assertAlmostEqual(allocation.number_of_days, 7, 2)

    def test_accrual_lost_previous_days(self):
        """
        Test that when an allocation with two levels is made and that the first level has it's action
        with unused accruals set as lost that the days are effectively lost
        Create an accrual plan:
            - Carryover date:  January 1st.
        Create first milestone:
            - Number of accrued days: 1
            - Frequency: monthly
            - Start accrual 0 day after the allocation start date.
            - Carryover policy: No days carry over
            - Accrued days cap: 12 days.
        Create second milestone:
            - Same as the first milestone but it starts after 1 year of the allocation start date
        Create an allocation:
            - Start date: 01/01/2021
            - Type: Accrual
            - Accrual Plan: Use the one defined above.

        From 01/01/2021, to 01/12/2021 11 days are accrued to the employee.

        On 01/01/2022:
            - No days carry over.
            - 1 day is accrued (for the period from 01/12/2021 to 31/12/2021).

        From 01/01/2022, to 01/04/2022 3 days are accrued to the employee.
        The total number of days that the employee has is 1 + 3 = 4 days.
        """
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'level_ids': [
                (0, 0, {
                    'added_value_type': 'day',
                    'start_count': 0,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'monthly',
                    'cap_accrued_time': True,
                    'maximum_leave': 12,
                    'action_with_unused_accruals': 'lost',
                }),
                (0, 0, {
                    'start_count': 1,
                    'start_type': 'year',
                    'added_value': 1,
                    'frequency': 'monthly',
                    'cap_accrued_time': True,
                    'maximum_leave': 12,
                    'action_with_unused_accruals': 'lost',
                }),
            ],
        })
        with freeze_time('2021-1-1'):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual Allocation - Test',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': datetime.date(2021, 1, 1),
            })
            allocation.action_validate()
        with freeze_time('2022-4-4'):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 4, "Invalid number of days")

    def test_accrual_lost_first_january(self):
        """
        Create an accrual plan:
            - Carryover date:  January 1st.
            - The days are accrued at the start of the accrual period.
        Create a milestone:
            - Number of accrued days: 3
            - Frequency: yearly
            - Start accrual immediately on the allocation start date.
            - Carryover policy: No days carry over
            - Accrued days cap: 12 days.
        Create an allocation:
            - Start date: 01/01/2019
            - Type: Accrual
            - Accrual Plan: Use the one defined above.

        On 01/01/2019, 3 days are accrued.
        On 01/01/2020, the previous 3 days are lost due to carryover. 3 days are accrued.
        On 01/01/2021, the previous 3 days are lost due to carryover. 3 days are accrued.
        On 01/01/2022, the previous 3 days are lost due to carryover. 3 days are accrued.
        The total number of days should be 3.
        """
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'accrued_gain_time': 'start',
            'level_ids': [
                (0, 0, {
                    'added_value_type': 'day',
                    'start_count': 0,
                    'start_type': 'day',
                    'added_value': 3,
                    'frequency': 'yearly',
                    'cap_accrued_time': True,
                    'maximum_leave': 12,
                    'action_with_unused_accruals': 'lost',
                })
            ],
        })
        with freeze_time('2019-1-1'):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual Allocation - Test',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': datetime.date(2019, 1, 1),
            })
            allocation.action_validate()

        with freeze_time('2022-4-1'):
            allocation._update_accrual()
        self.assertAlmostEqual(allocation.number_of_days, 3, 2, "Invalid number of days")

    def test_accrual_maximum_leaves(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 1,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'daily',
                'cap_accrued_time': True,
                'maximum_leave': 5,
            })],
        })
        with freeze_time("2021-9-3"):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2021-09-03',
            })

        with freeze_time("2021-10-3"):
            allocation.action_validate()
            allocation._update_accrual()

            self.assertEqual(allocation.number_of_days, 5, "Should accrue maximum 5 days")

    def test_accrual_maximum_leaves_no_limit(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 1,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'daily',
                'cap_accrued_time': False,
            })],
        })
        with freeze_time("2021-9-3"):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2021-09-03',
            })

        with freeze_time("2021-10-3"):
            allocation.action_validate()
            allocation._update_accrual()

            self.assertEqual(allocation.number_of_days, 29, "No limits for accrued days")

    def test_accrual_leaves_taken_maximum(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'weekly',
                'week_day': 'mon',
                'cap_accrued_time': True,
                'maximum_leave': 5,
            })],
        })
        with freeze_time("2022-1-1"):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2022-01-01',
            })
            allocation.action_validate()

        with freeze_time("2022-3-2"):
            allocation._update_accrual()

        self.assertEqual(allocation.number_of_days, 5, "Maximum of 5 days accrued")

        leave = self.env['hr.leave'].create({
            'name': 'leave',
            'employee_id': self.employee_emp.id,
            'holiday_status_id': self.leave_type.id,
            'request_date_from': '2022-03-07',
            'request_date_to': '2022-03-11',
        })
        leave.action_validate()

        with freeze_time("2022-6-1"):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 10, "Should accrue 5 additional days")

    def test_accrual_leaves_taken_maximum_hours(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'level_ids': [(0, 0, {
                'added_value_type': 'hour',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'weekly',
                'week_day': 'mon',
                'cap_accrued_time': True,
                'maximum_leave': 10,
            })],
        })
        with freeze_time(datetime.date(2022, 1, 1)):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type_hour.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2022-01-01',
            })
            allocation.action_validate()

        with freeze_time(datetime.date(2022, 4, 1)):
            allocation._update_accrual()

        self.assertEqual(allocation.number_of_days, 10 / self.hours_per_day, "Maximum of 10 hours accrued")

        leave = self.env['hr.leave'].create({
            'name': 'leave',
            'employee_id': self.employee_emp.id,
            'holiday_status_id': self.leave_type_hour.id,
            'request_date_from': '2022-03-07',
            'request_date_to': '2022-03-07',
        })
        leave.action_validate()

        with freeze_time(datetime.date(2022, 6, 1)):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 18 / self.hours_per_day, "Should accrue 8 additional hours")

    def test_accrual_period_start(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'accrued_gain_time': 'end',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'weekly',
                'week_day': 'mon',
                'cap_accrued_time': True,
                'maximum_leave': 5,
            })],
        })
        with freeze_time("2023-4-24"):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2023-04-24',
            })
            allocation.action_validate()

            allocation._update_accrual()

        self.assertEqual(allocation.number_of_days, 0, "Should accrue 0 days, because the period is not done yet.")

        accrual_plan.accrued_gain_time = 'start'
        with freeze_time("2023-4-24"):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2023-04-24',
            })
            allocation.action_validate()

            allocation._update_accrual()

        self.assertEqual(allocation.number_of_days, 1, "Should accrue 1 day, at the start of the period.")

    def test_accrual_period_start_multiple_runs(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'accrued_gain_time': 'start',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1.5,
                'frequency': 'monthly',
                'first_day': 13,
                'cap_accrued_time': True,
                'maximum_leave': 15,
            })],
        })
        with freeze_time("2023-4-13"):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2023-04-13',
            })
            allocation.action_validate()
            allocation._update_accrual()

        self.assertAlmostEqual(allocation.number_of_days, 1.5, 2)

        with freeze_time("2023-9-13"):
            allocation._update_accrual()

        self.assertAlmostEqual(allocation.number_of_days, 9, 2)

    def test_accrual_period_start_level_transfer(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'accrued_gain_time': 'start',
            'level_ids': [
                (0, 0, {
                    'added_value_type': 'day',
                    'start_count': 0,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'weekly',
                    'week_day': 'wed',
                    'cap_accrued_time': True,
                    'maximum_leave': 10,
                }),
                (0, 0, {
                    'start_count': 3,
                    'start_type': 'month',
                    'added_value': 2,
                    'frequency': 'weekly',
                    'week_day': 'wed',
                    'cap_accrued_time': True,
                    'maximum_leave': 5,
                })
            ],
        })
        with freeze_time("2023-4-26"):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2023-04-26',
            })
            allocation.action_validate()
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 1, "Should accrue 1 day, at the start of the period.")

        with freeze_time("2023-7-5"):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 10, "Should accrue 10 days, days received, but not over limit.")

        # first wednesday at the second level
        with freeze_time("2023-8-02"):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 5, "Should accrue 5 days, after level transfer 10 are cut to 5")

    def test_accrual_carryover_at_allocation(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'accrued_gain_time': 'start',
            'carryover_date': 'allocation',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'monthly',
                'first_day': 27,
                'cap_accrued_time': False,
                'action_with_unused_accruals': 'lost',
            })],
        })
        with freeze_time("2023-4-26"):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2023-04-26',
            })
            allocation.action_validate()
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 0, "Should accrue 0 days, days are added on 27th.")

        with freeze_time("2023-4-27"):
            allocation._update_accrual()
        self.assertAlmostEqual(allocation.number_of_days, 1.03, 2, "Should accrue 1 day, days are added on 27th.")

        with freeze_time("2023-12-27"):
            allocation._update_accrual()
        self.assertAlmostEqual(allocation.number_of_days, 9.03, 2, "Should accrue 9 day, after 8 months.")

        with freeze_time("2024-04-26"):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 0, "Allocations not lost on 1st of January, but on allocation date.")

        with freeze_time("2024-04-27"):
            allocation._update_accrual()
        self.assertAlmostEqual(allocation.number_of_days, 1, "Allocations lost, then 1 accrued.")

    def test_accrual_carryover_at_other(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'accrued_gain_time': 'start',
            'carryover_date': 'other',
            'carryover_day': 20,
            'carryover_month': 'apr',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 10,
                'frequency': 'monthly',
                'first_day': 11,
                'cap_accrued_time': False,
                'action_with_unused_accruals': 'maximum',
                'postpone_max_days': 69,
            })],
        })
        with freeze_time("2023-04-20"):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 0,
                'allocation_type': 'accrual',
                'date_from': '2023-04-20',
            })
            allocation.action_validate()

        with freeze_time("2024-04-20"):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 69, "Carryover at other date, level's maximum leave is 69.")

    def test_accrual_carrover_other_period_end_multi_level(self):
        """
        Create an accrual plan:
            - Carryover date:  June 5th.
        Create first milestone:
            - Number of accrued days: 1
            - Frequency: monthly on the 9th day.
            - Start accrual 5 days after the allocation start date.
            - Carryover policy: Carryover with a maximum
            - Carryover limit: 13 days
            - Accrued days cap: 15 days.
        Create second milestone:
            - Number of accrued days: 2
            - Frequency: biyearly, on the 17th of February and on the 29th of October
            - Start accrual 9 months after the allocation start date.
            - Carryover policy: Carryover with a maximum
            - Carryover limit: 20 days
            - Accrued days cap: 10 days.
        Create third milestone:
            - Number of accrued days: 12
            - Frequency: yearly on the 15th of July
            - Start accrual 17 months after the allocation start date.
            - Carryover policy: No days carry over
            - Accrued days cap: 21 days.
        Create an allocation:
            - Start date: 04/04/2023
            - Type: Accrual
            - Accrual Plan: Use the one defined above.
            - Number of days (given to the employee on the first run of the accrual plan): 9 days

        Quick Overview:
        - On 05/06/2026 (carryover date): The allocation will be on the third milestone. All the accrued days will be lost due to the carryover policy.
        - On 15/07/2026, 12 days will be accrued.
        The the employee should have 12 days on 01/08/2026

        The detailed execution of the accrual plan is as follows:
        - The employee is given 9 days at the first run of the accrual plan.
        - From 09/04/2023, to 09/05/2023 1 day is accrued to the employee.
        - On 05/06/2023 (carryover date): The employee has 10 days < the carryover limit of 13 days. All days will carry over.
        - From 09/06/2023 to 09/12/2023: 5 days are accrued to the employee (should be 7 days but the accrued days cap is 15 days).
        - On 04/01/2024:
            * 0.7 days are accrued for the period from 09/12/2023 to 04/01/2024.
            * Total number of days will remain 15 days given that the employee has reached the accrued days cap.
            * The accrual plan transitions to the second milestone.

        - On 17/02/2024, No days will be accrued to the employee because he has 15 days and the accrued days cap is 10 days. Instead 5 days will be lost.
        - On 05/06/2024 (carryover date): The employee has 10 days < the carryover limit of 20 days. All days will carry over.
        - On 04/09/2024
            * No days will be accrued for the period from 17/02/2024 to 04/09/2024 due to accrued days cap.
            * Total number of days will remain 10 days.
            * The accrual plan transitions to the third milestone.

        - On 05/06/2025 (carryover date): All the accrued days will be lost.
        - On 15/07/2025, around 10 days will be accrued.
        - On 05/06/2026 (carryover date): All the accrued days will be lost.
        - On 15/07/2026, 12 days will be accrued.
        The the employee should have 12 days on 01/08/2026
        """
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Accrual Plan For Test',
            'accrued_gain_time': 'end',
            'carryover_date': 'other',
            'carryover_day': 5,
            'carryover_month': 'jun',
            'level_ids': [
                (0, 0, {
                    'added_value_type': 'day',
                    'start_count': 5,
                    'start_type': 'day',
                    'added_value': 1,
                    'frequency': 'monthly',
                    'first_day': 9,
                    'cap_accrued_time': True,
                    'maximum_leave': 15,
                    'action_with_unused_accruals': 'maximum',
                    'postpone_max_days': 13,
                }),
                (0, 0, {
                    'start_count': 9,
                    'start_type': 'month',
                    'added_value': 2,
                    'frequency': 'biyearly',
                    'first_month_day': 17,
                    'first_month': 'feb',
                    'second_month_day': 29,
                    'second_month': 'oct',
                    'cap_accrued_time': True,
                    'maximum_leave': 10,
                    'action_with_unused_accruals': 'maximum',
                    'postpone_max_days': 20,
                }),
                (0, 0, {
                    'start_count': 17,
                    'start_type': 'month',
                    'added_value': 12,
                    'frequency': 'yearly',
                    'yearly_month': 'jul',
                    'yearly_day': 15,
                    'cap_accrued_time': True,
                    'maximum_leave': 21,
                    'action_with_unused_accruals': 'lost',
                }),
            ],
        })
        with freeze_time("2023-04-04"):
            allocation = self.env['hr.leave.allocation'].with_user(self.user_hrmanager_id).with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 9,
                'allocation_type': 'accrual',
                'date_from': '2023-04-4',
            })
            allocation.action_validate()

        with freeze_time("2026-08-01"):
            allocation._update_accrual()
        self.assertEqual(allocation.number_of_days, 12)

    def test_accrual_creation_on_anterior_date(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Weekly accrual',
            'carryover_date': 'allocation',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'weekly',
                'cap_accrued_time': False,
                'action_with_unused_accruals': 'lost',
            })],
        })
        with freeze_time('2023-09-01'):
            accrual_allocation = self.env['hr.leave.allocation'].new({
                'name': 'Employee allocation',
                'holiday_status_id': self.leave_type.id,
                'date_from': '2023-01-01',
                'employee_id': self.employee_emp.id,
                'allocation_type': 'accrual',
                'accrual_plan_id': accrual_plan.id,
            })
            # As the duration is set to a onchange, we need to force that onchange to run
            accrual_allocation._onchange_date_from()
            accrual_allocation.action_validate()
            # The amount of days should be computed as if it was accrued since
            # the start date of the allocation.
            self.assertAlmostEqual(accrual_allocation.number_of_days, 34.0, places=0)
            self.assertFalse(accrual_allocation.lastcall == accrual_allocation.date_from)
            accrual_allocation._update_accrual()
            # The amount being already computed, the amount should stay the same after the cron
            # running on the same day.
            self.assertAlmostEqual(accrual_allocation.number_of_days, 34.0, places=0)

    def test_future_accural_time(self):
        leave_type = self.env['hr.leave.type'].create({
            'name': 'Test Leave Type',
            'time_type': 'leave',
            'requires_allocation': 'yes',
            'allocation_validation_type': 'no_validation',
            'request_unit': 'hour',
        })
        with freeze_time("2023-12-31"):
            accrual_plan = self.env['hr.leave.accrual.plan'].create({
                'name': 'Accrual Plan For Test',
                'is_based_on_worked_time': False,
                'accrued_gain_time': 'end',
                'carryover_date': 'year_start',
                'level_ids': [(0, 0, {
                    'start_count': 1,
                    'start_type': 'day',
                    'added_value': 1,
                    'added_value_type': 'hour',
                    'frequency': 'monthly',
                    'cap_accrued_time': True,
                    'maximum_leave': 100,
                })],
            })
            allocation = self.env['hr.leave.allocation'].create({
                'name': 'Accrual allocation for employee',
                'accrual_plan_id': accrual_plan.id,
                'employee_id': self.employee_emp.id,
                'holiday_status_id': leave_type.id,
                'number_of_days': 0.125,
                'allocation_type': 'accrual',
            })
            allocation.action_validate()
            allocation_data = leave_type.get_allocation_data(self.employee_emp, datetime.date(2024, 2, 1))
            self.assertEqual(allocation_data[self.employee_emp][0][1]['virtual_remaining_leaves'], 2)

    def test_added_type_during_onchange(self):
        """
            The purpose is to test whether the value of the `added_value_type`
            field is correctly propagated from the first level to the second
            during creation on the dialog form view.
        """
        accrual_plan = self.env['hr.leave.accrual.plan'].create({
            'name': 'Accrual Plan For Test',
            'is_based_on_worked_time': False,
            'accrued_gain_time': 'end',
            'carryover_date': 'year_start',
            'level_ids': [(0, 0, {
                'start_count': 1,
                'start_type': 'day',
                'added_value': 4,
                'added_value_type': 'hour',
                'frequency': 'monthly',
                'cap_accrued_time': True,
                'maximum_leave': 100,
            })],
        })
        # Simulate the onchange of the dialog form view
        # Trigger the `_compute_added_value_type` method (with virtual records)
        res = self.env['hr.leave.accrual.level'].onchange({'accrual_plan_id': {'id': accrual_plan.id}}, [], {'added_value_type': {}})
        self.assertEqual(res['value']['added_value_type'], accrual_plan.level_ids[0].added_value_type)

    def test_accrual_immediate_cron_run(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Weekly accrual',
            'carryover_date': 'allocation',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'daily',
                'cap_accrued_time': False,
                'action_with_unused_accruals': 'lost',
            })],
        })
        with freeze_time('2023-09-01'):
            accrual_allocation = self.env['hr.leave.allocation'].new({
                'name': 'Employee allocation',
                'holiday_status_id': self.leave_type.id,
                'date_from': '2023-08-01',
                'employee_id': self.employee_emp.id,
                'allocation_type': 'accrual',
                'accrual_plan_id': accrual_plan.id,
            })
            # As the duration is set to a onchange, we need to force that onchange to run
            accrual_allocation._onchange_date_from()
            accrual_allocation.action_validate()
            # The amount of days should be computed as if it was accrued since
            # the start date of the allocation.
            self.assertEqual(accrual_allocation.number_of_days, 31.0, "The allocation should have given 31 days")
            accrual_allocation._update_accrual()
            self.assertEqual(accrual_allocation.number_of_days, 31.0,
                "the amount shouldn't have changed after running the cron")

    def test_accrual_creation_for_history(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Monthly accrual',
            'carryover_date': 'year_start',
            'accrued_gain_time': 'end',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'monthly',
                'first_day_display': 'last',
                'cap_accrued_time': False,
                'action_with_unused_accruals': 'lost',
            })],
        })
        with freeze_time('2024-03-02'):
            accrual_allocation = self.env['hr.leave.allocation'].new({
                'name': 'History allocation',
                'holiday_status_id': self.leave_type.id,
                'date_from': '2024-03-01',
                'employee_id': self.employee_emp.id,
                'allocation_type': 'accrual',
                'accrual_plan_id': accrual_plan.id,
            })
            # As the duration is set to an onchange, we need to force that onchange to run
            accrual_allocation._onchange_date_from()
            self.assertAlmostEqual(accrual_allocation.number_of_days, 0, places=0)

            # Yearly Report lost
            accrual_allocation.write({'date_from': '2022-01-01'})
            accrual_allocation._onchange_date_from()
            self.assertAlmostEqual(accrual_allocation.number_of_days, 2, places=0)

            # Update date_to
            accrual_allocation.write({'date_to': '2022-12-31'})
            accrual_allocation._onchange_date_from()
            self.assertAlmostEqual(accrual_allocation.number_of_days, 12, places=0)

    def test_accrual_with_report_creation_for_history(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Monthly accrual',
            'carryover_date': 'year_start',
            'accrued_gain_time': 'end',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'monthly',
                'first_day_display': 'last',
                'cap_accrued_time': False,
                'action_with_unused_accruals': 'maximum',
                'postpone_max_days': 5
            })],
        })
        with freeze_time('2024-03-02'):
            accrual_allocation = self.env['hr.leave.allocation'].new({
                'name': 'History allocation',
                'holiday_status_id': self.leave_type.id,
                'date_from': '2024-03-01',
                'employee_id': self.employee_emp.id,
                'allocation_type': 'accrual',
                'accrual_plan_id': accrual_plan.id,
            })
            # As the duration is set to an onchange, we need to force that onchange to run
            accrual_allocation._onchange_date_from()
            self.assertAlmostEqual(accrual_allocation.number_of_days, 0, places=0)

            # Yearly Report capped to 5 after 2022 and after 2023
            accrual_allocation.write({'date_from': '2022-01-01'})
            accrual_allocation._onchange_date_from()
            self.assertAlmostEqual(accrual_allocation.number_of_days, 7, places=0)

            # Update date_to
            accrual_allocation.write({'date_to': '2022-12-31'})
            accrual_allocation._onchange_date_from()
            self.assertAlmostEqual(accrual_allocation.number_of_days, 12, places=0)

    def test_accrual_period_start_past_start_date(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Monthly accrual',
            'carryover_date': 'year_start',
            'accrued_gain_time': 'start',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'monthly',
                'first_day_display': '1',
                'cap_accrued_time': False,
            })],
        })
        with freeze_time('2024-03-01'):
            with Form(self.env['hr.leave.allocation']) as f:
                f.allocation_type = "accrual"
                f.accrual_plan_id = accrual_plan
                f.employee_id = self.employee_emp
                f.holiday_status_id = self.leave_type
                f.date_from = '2024-01-01'
                f.name = "Employee Allocation"

            accrual_allocation = f.record
            accrual_allocation.action_validate()
            self.assertAlmostEqual(accrual_allocation.number_of_days, 3.0, places=0)

        with freeze_time('2024-04-01'):
            accrual_allocation._update_accrual()
            self.assertAlmostEqual(accrual_allocation.number_of_days, 4.0, places=0)

    def test_cancel_invalid_leaves_with_regular_and_accrual_allocations(self):
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Monthly accrual',
            'carryover_date': 'year_start',
            'accrued_gain_time': 'start',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'monthly',
                'first_day_display': '1',
                'cap_accrued_time': False,
            })],
        })
        allocations = self.env['hr.leave.allocation'].create([
            {
                'name': 'Regular allocation',
                'allocation_type': 'regular',
                'date_from': '2024-05-01',
                'holiday_status_id': self.leave_type.id,
                'employee_id': self.employee_emp.id,
                'number_of_days': 2,
            },
            {
                'name': 'Accrual allocation',
                'allocation_type': 'accrual',
                'date_from': '2024-05-01',
                'holiday_status_id': self.leave_type.id,
                'employee_id': self.employee_emp.id,
                'accrual_plan_id': accrual_plan.id,
                'number_of_days': 3,
            }
        ])
        allocations.action_validate()
        leave = self.env['hr.leave'].create({
                'name': 'Leave',
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'request_date_from': '2024-05-13',
                'request_date_to': '2024-05-17',
            })
        leave.action_validate()
        with freeze_time('2024-05-06'):
            self.env['hr.leave']._cancel_invalid_leaves()
        self.assertEqual(leave.state, 'validate', "Leave must not be canceled")

    def test_accrual_leaves_cancel_cron(self):
        leave_type_no_negative = self.env['hr.leave.type'].create({
            'name': 'Test Accrual - No negative',
            'time_type': 'leave',
            'requires_allocation': 'yes',
            'allocation_validation_type': 'no_validation',
            'leave_validation_type': 'no_validation',
            'allows_negative': False,
        })
        leave_type_negative = self.env['hr.leave.type'].create({
            'name': 'Test Accrual - Negative',
            'time_type': 'leave',
            'requires_allocation': 'yes',
            'allocation_validation_type': 'no_validation',
            'leave_validation_type': 'no_validation',
            'allows_negative': True,
            'max_allowed_negative': 1,
        })
        accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
            'name': 'Monthly accrual',
            'carryover_date': 'year_start',
            'accrued_gain_time': 'end',
            'level_ids': [(0, 0, {
                'added_value_type': 'day',
                'start_count': 0,
                'start_type': 'day',
                'added_value': 1,
                'frequency': 'monthly',
                'first_day_display': 'last',
                'cap_accrued_time': False,
                'action_with_unused_accruals': 'maximum',
                'postpone_max_days': 5
            })],
        })

        with freeze_time("2024-01-01"):
            self.env['hr.leave.allocation'].create([{
                'employee_id': self.employee_emp.id,
                'holiday_status_id': leave_type_no_negative.id,
                'allocation_type': 'accrual',
                'accrual_plan_id': accrual_plan.id,
                'number_of_days': 1,
            }, {
                'employee_id': self.employee_emp.id,
                'holiday_status_id': leave_type_negative.id,
                'allocation_type': 'accrual',
                'accrual_plan_id': accrual_plan.id,
                'number_of_days': 1,
            }])

            excess_leave = self.env['hr.leave'].create([{
                'employee_id': self.employee_emp.id,
                'holiday_status_id': leave_type_no_negative.id,
                'request_date_from': '2024-01-05',
                'request_date_to': '2024-01-05',
            }])
            allowed_negative_leave = self.env['hr.leave'].create([{
                'employee_id': self.employee_emp.id,
                'holiday_status_id': leave_type_negative.id,
                'request_date_from': '2024-01-12',
                'request_date_to': '2024-01-12',
            }])

            # As accrual allocation don't take into account future leaves,
            # it should be possible to take both leaves.
            self.env['hr.leave'].create([{
                'employee_id': self.employee_emp.id,
                'holiday_status_id': leave_type_no_negative.id,
                'request_date_from': '2024-01-04',
                'request_date_to': '2024-01-04',
            }, {
                'employee_id': self.employee_emp.id,
                'holiday_status_id': leave_type_negative.id,
                'request_date_from': '2024-01-11',
                'request_date_to': '2024-01-11',
            }])
            self.env.flush_all()

            self.env['hr.leave']._cancel_invalid_leaves()

            # Since both leave are outside an allocation validity,
            # they are detected as discrepancies. However, the
            # leave that is not exceeding the negative amount should be kept
            # as it is valid according to the configuration.
            self.assertEqual(excess_leave.state, 'cancel')
            self.assertEqual(allowed_negative_leave.state, 'validate')

            self.env['hr.leave'].create([{
                'employee_id': self.employee_emp.id,
                'holiday_status_id': leave_type_negative.id,
                'request_date_from': '2024-01-10',
                'request_date_to': '2024-01-10',
            }])

            self.env['hr.leave']._cancel_invalid_leaves()

            # The last added leave creates a discrepancy that exceeds the
            # maximum amount allowed in negative.
            self.assertEqual(allowed_negative_leave.state, 'cancel')

    def test_check_lastcall_change_regular_to_accrual(self):
        with freeze_time("2017-12-5"):
            accrual_plan = self.env['hr.leave.accrual.plan'].with_context(tracking_disable=True).create({
                'name': 'Accrual Plan For Test',
            })
            allocation = self.env['hr.leave.allocation'].with_context(tracking_disable=True).create({
                'name': 'Accrual allocation for employee',
                'employee_id': self.employee_emp.id,
                'holiday_status_id': self.leave_type.id,
                'number_of_days': 10,
                'allocation_type': 'regular',
            })
            allocation.action_validate()

            self.assertEqual(allocation.lastcall, False)

            allocation.action_refuse()
            allocation.write({
                'allocation_type': 'accrual',
                'accrual_plan_id': accrual_plan.id,
            })

            self.assertEqual(allocation.lastcall, datetime.date(2017, 12, 5))
