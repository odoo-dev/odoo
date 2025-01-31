from odoo import fields, models, tools


class EsgEmployeeReport(models.Model):
    _name = "esg.employee.report"
    _description = "ESG Employee Report"
    _auto = False

    def _get_gender_selection(self):
        return self.env["hr.employee"]._fields["gender"].selection

    gender = fields.Selection(selection=_get_gender_selection, readonly=True)
    company_id = fields.Many2one("res.company", readonly=True)
    department_id = fields.Many2one("hr.department", readonly=True)
    is_team_leader = fields.Boolean(readonly=True)
    is_full_time = fields.Boolean(readonly=True)
    management_depth = fields.Integer(readonly=True)
    leadership_reach = fields.Integer(readonly=True)

    def _select(self):
        return """
            e.id,
            e.gender,
            e.company_id,
            e.department_id,
            CASE
                WHEN COUNT(ee.id) > 0 THEN TRUE
                ELSE FALSE
            END AS is_team_leader,
            CASE
                WHEN rc.full_time_required_hours IS NULL
                    OR rc.hours_per_week = rc.full_time_required_hours
                THEN TRUE
                ELSE FALSE
            END as is_full_time,
            MAX(md.level) AS management_depth,
            MAX(lr.level) AS leadership_reach
        """

    def _from(self):
        return f"""
            hr_employee e
                LEFT JOIN hr_employee ee ON ee.parent_id = e.id
                LEFT JOIN resource_calendar rc ON e.resource_calendar_id = rc.id
                LEFT JOIN ({self._management_depth_subquery()}) md ON e.id = md.employee_id
                LEFT JOIN ({self._leadership_reach_subquery()}) lr ON e.id = lr.employee_id
        """

    def _group_by(self):
        return """
            e.id,
            e.gender,
            e.company_id,
            e.department_id,
            rc.full_time_required_hours,
            rc.hours_per_week,
            md.level,
            lr.level
        """

    def _management_depth_subquery(self):
        return """
            WITH RECURSIVE management_depth AS (
                -- Base case
                SELECT
                    e.id AS employee_id,
                    0 AS level
                FROM hr_employee e

                UNION ALL

                -- Recursive case
                SELECT
                    ee.id AS employee_id,
                    mh.level + 1
                FROM hr_employee ee
                JOIN management_depth mh ON ee.parent_id = mh.employee_id
            )
            SELECT
                employee_id,
                MAX(level) AS level
            FROM management_depth
            GROUP BY employee_id
        """

    def _leadership_reach_subquery(self):
        return """
            WITH RECURSIVE leadership_reach AS (
                -- Base case: Employees with no manager
                SELECT
                    e.id AS employee_id,
                    0 AS level
                FROM hr_employee e
                WHERE NOT EXISTS (SELECT 1 FROM hr_employee WHERE parent_id = e.id)

                UNION ALL

                -- Recursive case
                SELECT
                    e.parent_id AS employee_id,  -- Moving up to the parent
                    lh.level + 1
                FROM hr_employee e
                JOIN leadership_reach lh ON e.id = lh.employee_id
                WHERE e.parent_id IS NOT NULL
            )
            SELECT
                employee_id,
                MAX(level) AS level
            FROM leadership_reach
            GROUP BY employee_id
        """

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute(f"""
            CREATE OR REPLACE VIEW {self._table} AS (
                  SELECT {self._select()}
                    FROM {self._from()}
                GROUP BY {self._group_by()}
            )
        """)
