# Part of Odoo. See LICENSE file for full copyright and licensing details.

from pytz import utc

from odoo import api, fields, models, tools
 

class HrLeaveEmployeeReport(models.Model):
    _name = 'hr.leave.employee.report'
    _description = 'Time Off Per Employee Summary / Report'
    _auto = False

    employee_id = fields.Many2one('hr.employee', string="Employee", readonly=True)
    leave_id = fields.Many2one('hr.leave', string="Time Off Request", readonly=True)
    month_aligned_date_from = fields.Datetime(readonly=True)
    month_aligned_date_to = fields.Datetime(readonly=True)
    working_schedule_aligned_date_from = fields.Datetime('Date From', compute='_compute_working_schedule_aligned_dates', readonly=True, store=True)
    working_schedule_aligned_date_to = fields.Datetime('Date To', compute='_compute_working_schedule_aligned_dates', readonly=True, store=True)
    number_of_days = fields.Float(compute='_compute_leave_duration', readonly=True, store=True)
    number_of_hours = fields.Float(compute='_compute_leave_duration', readonly=True, store=True)

    def init(self):
        # 1. Assume a leave request that spans multiple months, for example, From 15/10 to 13/12. This query will return 3
        #    records instead of 1. The records will have the following boundaries: date_from 15/10, date_to 31/10,
        #    date_from 1/11 date_to 30/11 and date_from 1/12, date_to 13/12.
        # 2. The number of days/hours for each record will be computed using _compute_leave_duration.
        # 3. To get the end of a month with HH:mm:ss set as 23:59:59 => month_start + INTERVAL '1 month' - INTERVAL '1 second'.
        # 4. number_of_days, number_of_hours and working_schedules_aligned_date_from/to have to be added to the query. Otherwise,
        #    they won't be stored in the database. These fields have to be stored because graph and pivot views can aggregate
        #    stored fields only. number_of_days and number_of_hours are set to dummy values as they will be computed afterwards and the
        #    report will then be updated. The same applies for working_schedule_aligned_date_from/to.
        tools.drop_view_if_exists(self._cr, 'hr_leave_employee_report')
        self._cr.execute(f"""
                SELECT
                    id, leave_id, employee_id,
                    GREATEST(date_from, month) AS month_aligned_date_from,
                    LEAST(date_to, (month + INTERVAL '1 month' - INTERVAL '1 second')) AS month_aligned_date_to
                FROM (
                    SELECT
                        ROW_NUMBER() OVER(ORDER BY employee_id) AS id,
                        id AS leave_id, employee_id, date_from, date_to,
                        DATE_TRUNC('month', months_included_in_request) AS month
                    FROM hr_leave hl 
                    CROSS JOIN LATERAL GENERATE_SERIES(
                        date_from, 
                        DATE_TRUNC('month', date_to) + INTERVAL '1 month' - INTERVAL '1 second',
                        INTERVAL '1 month'
                    ) AS months_included_in_request
                    WHERE hl.employee_company_id {f"IN {tuple(self.env.companies.ids)}" if len(self.env.companies.ids) > 1 else f"= {self.env.companies.id}"}
                ) AS leave_data; 
        """)
        leave_data = self._cr.fetchall()
        report_leave_data = self._generate_report_leave_data(leave_data)
        self._compute_working_schedule_aligned_dates(report_leave_data)
        self._compute_leave_duration(report_leave_data)
        for record in report_leave_data:
            print(record)

    def _generate_report_leave_data(self, leave_data):
        mapping = {
            'id' : 0,
            'leave_id': 1,
            'employee_id': 2,
            'month_aligned_date_from': 3,
            'month_aligned_date_to': 4
        }
        report_leave_data = self.env['hr.leave.employee.report']
        for leave in leave_data:
            report_leave_data |= self.env['hr.leave.employee.report'].new({
                'id': leave[mapping['id']],
                'leave_id': leave[mapping['leave_id']],
                'employee_id': leave[mapping['employee_id']],
                'month_aligned_date_from': leave[mapping['month_aligned_date_from']],
                'month_aligned_date_to': leave[mapping['month_aligned_date_to']]
            })
        return report_leave_data

    def _compute_working_schedule_aligned_dates(self, leaves):
        for leave in leaves:
            start_date = leave.month_aligned_date_from.replace(tzinfo=utc)
            end_date = leave.month_aligned_date_to.replace(tzinfo=utc)
            work_intervals = leave.leave_id.resource_calendar_id._work_intervals_batch(start_date, end_date, compute_leaves=False)[False].items()
            leave.working_schedule_aligned_date_from = work_intervals[0][0].astimezone(utc).replace(tzinfo=None)
            leave.working_schedule_aligned_date_to = work_intervals[-1][1].astimezone(utc).replace(tzinfo=None)

    def _compute_leave_duration(self, leaves):
        for leave in leaves:
            virtual_leave = self.env['hr.leave'].new({
                'date_from': leave.month_aligned_date_from,
                'date_to': leave.month_aligned_date_to,
                'employee_id': leave.leave_id.employee_id.id,
                'holiday_status_id': leave.leave_id.holiday_status_id.id
            })
            leave_duration = virtual_leave._get_durations(additional_domain = [('holiday_id', '!=', leave.leave_id.id)])[virtual_leave.id]
            leave.number_of_days = leave_duration[0]
            leave.number_of_hours = leave_duration[1]

    def action_open_record(self):
        self.ensure_one()

        return {
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'res_id': self.leave_id.id,
            'res_model': 'hr.leave'
        }
