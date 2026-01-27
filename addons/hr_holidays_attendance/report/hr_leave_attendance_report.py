# Part of Odoo. See LICENSE file for full copyright and licensing details.

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.tools.sql import SQL, drop_view_if_exists


class HrLeaveAttendanceReport(models.Model):
    _name = "hr.leave.attendance.report"
    _description = "Attendance and Leave Analysis Report"
    _auto = False

    def _compute_display_name(self):
        for rec in self:
            rec.display_name = f"{rec.employee_id.display_name}, {rec.date}"

    date = fields.Date("Date")
    employee_id = fields.Many2one("hr.employee", string="Employee")
    active = fields.Boolean(related="employee_id.active")
    department_id = fields.Many2one(related="employee_id.department_id", string="Department")
    job_id = fields.Many2one(related="employee_id.job_id", string="Job Position")
    schedule_id = fields.Many2one("resource.calendar", string="Working Schedule")
    expected_hours = fields.Float("Expected Hours")
    worked_hours = fields.Float("Worked Hours")
    leave_hours = fields.Float("Approved Time Off")
    difference_hours = fields.Float("Difference", help="Worked Hours - Expected Hours + Approved Time Off")

    leave_type_names = fields.Char("Time Off Types", compute="_compute_leave_attendance_fields")
    leave_ids = fields.Many2many("hr.leave", string="Time Offs", compute="_compute_leave_attendance_fields")
    attendance_ids = fields.Many2many("hr.attendance", string="Attendances", compute="_compute_leave_attendance_fields")

    @api.depends('employee_id', 'date')
    def _compute_leave_attendance_fields(self):
        today = fields.Date.today()
        min_date = today - relativedelta(years=1)
        max_date = today - relativedelta(days=1)

        leaves_by_employees = dict(self.env['hr.leave']._read_group(
            domain=[
                ('employee_id', 'in', self.employee_id.ids),
                ('state', '=', 'validate'),
                ('date_from', '<=', max_date),
                ('date_to', '>=', min_date),
            ],
            groupby=['employee_id'],
            aggregates=['id:recordset'],
        ))
        attendances_by_employees = dict(self.env['hr.attendance']._read_group(
            domain=[
                ('employee_id', 'in', self.employee_id.ids),
                ('check_in', '>=', min_date),
                ('check_in', '<=', max_date),
            ],
            groupby=['employee_id'],
            aggregates=['id:recordset'],
        ))

        for rec in self:
            leaves = leaves_by_employees.get(rec.employee_id, self.env['hr.leave'])
            rec_date_leaves = leaves.filtered(
                lambda lv: self._timestamped(lv.date_from) <= rec.date <= self._timestamped(lv.date_to),
            )
            rec.leave_ids = rec_date_leaves.ids
            leave_type_ids = rec_date_leaves.mapped('holiday_status_id')
            rec.leave_type_names = ', '.join(leave_type_ids.mapped('name'))

            attendances = attendances_by_employees.get(rec.employee_id, self.env['hr.attendance'])
            rec.attendance_ids = attendances.filtered(
                lambda att: self._timestamped(att.check_in) == rec.date,
            ).ids

    def _timestamped(self, date):
        return fields.Datetime.context_timestamp(self, date).date()

    def _cte(self):
        return """
        WITH
        -- 1) Active Employee x Daily Date Matrix
        employee_dates AS (
            SELECT
                emp.id AS employee_id,
                emp.company_id,
                gs.day
            FROM hr_employee emp
            CROSS JOIN generate_series(
                (date_trunc('month', CURRENT_DATE) - INTERVAL '1 year')::date,
                (CURRENT_DATE - 1)::date,
                INTERVAL '1 day'
            ) AS gs(day)
            WHERE emp.active = true
        ),

        -- 2) Effective Working Schedule Resolution (Per Day)
        employee_calendars AS (
            SELECT employee_id, company_id, day, resource_calendar_id
            FROM (
                SELECT
                    ed.employee_id,
                    ed.company_id,
                    ed.day,
                    v.resource_calendar_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY ed.employee_id, ed.day
                        ORDER BY v.date_version DESC
                    ) AS rn
                FROM employee_dates ed
                LEFT JOIN hr_version v
                    ON v.employee_id = ed.employee_id
                   AND v.contract_date_start IS NOT NULL
                   AND v.contract_date_start <= ed.day
                   AND (v.contract_date_end >= ed.day OR v.contract_date_end IS NULL)
                   AND v.date_version <= ed.day
                JOIN resource_calendar rc
                    ON rc.id = v.resource_calendar_id
                   AND rc.active = true
            ) s
            WHERE rn = 1
        ),

        -- 3) Aggregated Worked Hours per Employee per Day
        daily_attendance AS (
            SELECT
                employee_id,
                (check_in AT TIME ZONE 'UTC')::date AS check_date,
                SUM(worked_hours) AS worked_hours
            FROM hr_attendance
            GROUP BY employee_id, check_date
        ),

        -- 4) Normalized Working Days per Calendar
        calendar_attendance AS (
            SELECT DISTINCT ON (calendar_id, dayofweek) *
            FROM resource_calendar_attendance
            ORDER BY calendar_id, dayofweek
        ),

        -- 5) Per-Day Approved Leave Allocation (Working-Day Aware)
        daily_leaves AS (
            SELECT
                ed.employee_id,
                ed.day,
                SUM(lv.number_of_hours / NULLIF(wd.working_days, 0)) AS leave_hours
            FROM employee_dates ed
            JOIN hr_leave lv
                ON lv.employee_id = ed.employee_id
               AND lv.state = 'validate'
               AND ed.day BETWEEN
                   (lv.date_from AT TIME ZONE 'UTC')::date
                   AND (lv.date_to AT TIME ZONE 'UTC')::date

            JOIN LATERAL (
                SELECT COUNT(*) AS working_days
                FROM generate_series(
                    (lv.date_from AT TIME ZONE 'UTC')::date,
                    (lv.date_to AT TIME ZONE 'UTC')::date,
                    INTERVAL '1 day'
                ) AS d(day)

                JOIN LATERAL (
                    SELECT v.resource_calendar_id
                    FROM hr_version v
                    JOIN resource_calendar rc
                        ON rc.id = v.resource_calendar_id
                       AND rc.active = true
                    WHERE v.employee_id = lv.employee_id
                      AND v.contract_date_start <= d.day
                      AND (v.contract_date_end >= d.day OR v.contract_date_end IS NULL)
                      AND v.date_version <= d.day
                    ORDER BY v.date_version DESC
                    LIMIT 1
                ) ver ON TRUE

                JOIN calendar_attendance rca
                    ON rca.calendar_id = ver.resource_calendar_id
                   AND CAST(rca.dayofweek AS INTEGER) = (
                       CASE
                           WHEN EXTRACT(DOW FROM d.day) = 0 THEN 6
                           ELSE EXTRACT(DOW FROM d.day) - 1
                       END
                   )

                LEFT JOIN resource_calendar_leaves rcl
                    ON (rcl.calendar_id = ver.resource_calendar_id OR rcl.calendar_id IS NULL)
                   AND rcl.resource_id IS NULL
                   AND rcl.company_id = lv.company_id
                   AND d.day BETWEEN
                       (rcl.date_from AT TIME ZONE 'UTC')::date
                       AND (rcl.date_to AT TIME ZONE 'UTC')::date
                WHERE rcl.id IS NULL
            ) wd ON TRUE

            GROUP BY ed.employee_id, ed.day
        )
        """

    def _select(self):
        return """
            SELECT
                row_number() OVER (ORDER BY ec.day DESC, ec.employee_id) AS id,
                ec.day::date AS date,
                ec.employee_id,
                rc.id AS schedule_id,
                ROUND(COALESCE(att.worked_hours, 0.0)::numeric, 2) AS worked_hours,
                ROUND(COALESCE(rc.hours_per_day, 0.0)::numeric, 2) AS expected_hours,
                ROUND(COALESCE(dl.leave_hours, 0.0)::numeric, 2) AS leave_hours,
                (
                    ROUND(COALESCE(att.worked_hours, 0.0)::numeric, 2)
                    - ROUND(COALESCE(rc.hours_per_day, 0.0)::numeric, 2)
                    + ROUND(COALESCE(dl.leave_hours, 0.0)::numeric, 2)
                ) AS difference_hours
        """

    def _from(self):
        return "FROM employee_calendars ec"

    def _join_calendar(self):
        return "JOIN resource_calendar rc ON rc.id = ec.resource_calendar_id AND rc.active = true"

    def _join_attendance(self):
        return "LEFT JOIN daily_attendance att ON att.employee_id = ec.employee_id AND att.check_date = ec.day"

    def _join_leave_hours(self):
        return "LEFT JOIN daily_leaves dl ON dl.employee_id = ec.employee_id AND dl.day = ec.day"

    def _where(self):
        return """
            WHERE EXISTS (
                SELECT 1 FROM calendar_attendance rca
                WHERE rca.calendar_id = rc.id
                  AND CAST(rca.dayofweek AS INTEGER) = (
                      CASE WHEN EXTRACT(DOW FROM ec.day) = 0 THEN 6
                           ELSE EXTRACT(DOW FROM ec.day) - 1 END
                  )
            )
            AND NOT EXISTS (
                SELECT 1 FROM resource_calendar_leaves rcl
                WHERE (rcl.calendar_id = rc.id OR rcl.calendar_id IS NULL)
                  AND rcl.resource_id IS NULL
                  AND rcl.company_id = ec.company_id
                  AND ec.day BETWEEN
                      (rcl.date_from AT TIME ZONE 'UTC')::date
                      AND (rcl.date_to AT TIME ZONE 'UTC')::date
            )
        """

    def init(self):
        drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute(SQL("""
            CREATE OR REPLACE VIEW %s AS (
                %s -- cte
                %s -- select
                %s -- from
                %s -- join calendar
                %s -- join attendance
                %s -- join leave hours
                %s -- where
            )""",
                SQL.identifier(self._table),
                SQL(self._cte()),
                SQL(self._select()),
                SQL(self._from()),
                SQL(self._join_calendar()),
                SQL(self._join_attendance()),
                SQL(self._join_leave_hours()),
                SQL(self._where()),
            ),
        )
