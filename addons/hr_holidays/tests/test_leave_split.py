# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import date

from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged('post_install', '-at_install')
class TestLeaveSplitHalfDays(TransactionCase):
    """Half days in ``hr.leave._create_leaves_from_split`` and in the duration of a request.

    The schedule is the standard one: Monday to Friday, 8:00-12:00 and 13:00-17:00. The employee
    is in UTC. 2026-03-02 is a Monday and 2026-03-08 a Sunday.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.calendar = cls.env['resource.calendar'].create({
            'name': 'Standard 40 hours',
            'attendance_ids': [(5, 0, 0)] + [
                (0, 0, {'dayofweek': str(day), 'hour_from': hour_from, 'hour_to': hour_to})
                for day in range(5)
                for hour_from, hour_to in [(8.0, 12.0), (13.0, 17.0)]
            ],
        })
        cls.employee = cls.env['hr.employee'].create({
            'name': 'Half Day Employee',
            'resource_calendar_id': cls.calendar.id,
            'tz': 'UTC',
        })
        cls.first_type, cls.second_type = cls.env['hr.work.entry.type'].create([{
            'name': name,
            'code': code,
            'count_as': 'absence',
            'requires_allocation': False,
            'request_unit': 'half_day',
            'leave_validation_type': 'hr',
        } for name, code in [('First Split Type', 'SPLITTEST1'), ('Second Split Type', 'SPLITTEST2')]])

    def _create_leave(self, date_from, date_to, from_period='am', to_period='pm', work_entry_type=None):
        # leave_fast_create keeps the request waiting for approval: it is not auto-approved.
        leave = self.env['hr.leave'].with_context(leave_fast_create=True).create({
            'employee_id': self.employee.id,
            'work_entry_type_id': (work_entry_type or self.first_type).id,
            'request_date_from': date_from,
            'request_date_from_period': from_period,
            'request_date_to': date_to,
            'request_date_to_period': to_period,
        })
        self.assertEqual(leave.state, 'confirm')
        return leave.with_context(leave_fast_create=False)

    def _get_pieces(self, leaves):
        return [
            (
                leave.work_entry_type_id,
                leave.number_of_days,
                leave.request_date_from,
                leave.request_date_from_period,
                leave.request_date_to,
                leave.request_date_to_period,
            )
            for leave in leaves.sorted('date_from')
        ]

    def test_half_day_piece_starting_in_the_afternoon(self):
        # Monday 2 March afternoon to Tuesday 3 March: 1.5 days.
        leave = self._create_leave(date(2026, 3, 2), date(2026, 3, 3), from_period='pm')
        self.assertEqual(leave.number_of_days, 1.5)

        leaves = leave._create_leaves_from_split([(self.first_type, 0.5), (self.second_type, 1)], use_worked_days=True)

        self.assertEqual(self._get_pieces(leaves), [
            (self.first_type, 0.5, date(2026, 3, 2), 'pm', date(2026, 3, 2), 'pm'),
            (self.second_type, 1, date(2026, 3, 3), 'am', date(2026, 3, 3), 'pm'),
        ])

    def test_whole_day_piece_starting_in_the_afternoon(self):
        # Monday 2 March afternoon to Friday 6 March: 4.5 days.
        leave = self._create_leave(date(2026, 3, 2), date(2026, 3, 6), from_period='pm')
        self.assertEqual(leave.number_of_days, 4.5)

        leaves = leave._create_leaves_from_split([(self.first_type, 4), (self.second_type, 0.5)], use_worked_days=True)

        self.assertEqual(self._get_pieces(leaves), [
            # Monday afternoon to Friday morning: 4 days.
            (self.first_type, 4, date(2026, 3, 2), 'pm', date(2026, 3, 6), 'am'),
            (self.second_type, 0.5, date(2026, 3, 6), 'pm', date(2026, 3, 6), 'pm'),
        ])

    def test_last_piece_keeps_a_morning_end(self):
        # Monday 2 March to Wednesday 4 March morning: 2.5 days.
        leave = self._create_leave(date(2026, 3, 2), date(2026, 3, 4), to_period='am')
        self.assertEqual(leave.number_of_days, 2.5)

        leaves = leave._create_leaves_from_split([(self.first_type, 1), (self.second_type, 1.5)], use_worked_days=True)

        self.assertEqual(self._get_pieces(leaves), [
            (self.first_type, 1, date(2026, 3, 2), 'am', date(2026, 3, 2), 'pm'),
            (self.second_type, 1.5, date(2026, 3, 3), 'am', date(2026, 3, 4), 'am'),
        ])

    def test_half_day_request_on_a_day_off_counts_calendar_days(self):
        calendar_type = self.env['hr.work.entry.type'].create({
            'name': 'Calendar Half Day Type',
            'code': 'SPLITTEST3',
            'count_as': 'absence',
            'requires_allocation': False,
            'request_unit': 'half_day',
            'count_days_as': 'calendar',
            'leave_validation_type': 'hr',
        })
        # Sunday 8 March: the whole day, the morning, then the afternoon.
        for from_period, to_period, expected_days in [('am', 'pm', 1), ('am', 'am', 0.5), ('pm', 'pm', 0.5)]:
            with self.subTest(from_period=from_period, to_period=to_period):
                leave = self._create_leave(
                    date(2026, 3, 8), date(2026, 3, 8),
                    from_period=from_period, to_period=to_period, work_entry_type=calendar_type,
                )
                self.assertEqual(leave.number_of_days, expected_days)
                leave.unlink()
