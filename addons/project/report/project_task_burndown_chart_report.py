# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from psycopg2 import sql

from odoo import fields, models, tools


class ReportProjectTaskBurndownChart(models.Model):
    _name = 'project.task.burndown.chart.report'
    _description = 'Burndown Chart'
    _auto = False
    _order = 'date'

    project_id = fields.Many2one('project.project', readonly=True)
    stage_id = fields.Many2one('project.task.type', readonly=True)
    date_begin = fields.Datetime('Date Begin', readonly=True)
    date_end = fields.Datetime('Date End', readonly=True)
    nb_tasks = fields.Integer('Number of tasks', group_operator='sum', readonly=True)

    def init(self):
        query = """
            WITH change_stage_tracking AS (
                SELECT mm.id as id,
                       pt.id as task_id,
                       pt.project_id as project_id,
                       pt.create_date as date_begin,
                       mm.date as date_end,
                       old_ptt.id as old_stage_id,
                       old_ptt.name,
                       new_ptt.name as new_stage_name,
                       new_ptt.id as new_stage_id
                  FROM mail_message mm
            INNER JOIN mail_tracking_value mtv
                    ON mm.id = mtv.mail_message_id
            INNER JOIN ir_model_fields imf
                    ON mtv.field = imf.id
                   AND imf.model = 'project.task'
            INNER JOIN project_task_type old_ptt
                    ON mtv.old_value_integer = old_ptt.id
            INNER JOIN project_task_type new_ptt
                    ON mtv.new_value_integer = new_ptt.id
            INNER JOIN project_task pt
                    ON mm.res_id = pt.id
                 WHERE mm.model = 'project.task'
                   AND mm.message_type = 'notification'
            ), all_stage_changes AS (
            SELECT * FROM change_stage_tracking cst
            UNION
                SELECT new.id,
                       new.task_id,
                       new.project_id,
                       old.date_end as date_begin,
                       new.date_end,
                       new.old_stage_id,
                       new.name,
                       new.new_stage_name,
                       new.new_stage_id
                  FROM change_stage_tracking old
            INNER JOIN change_stage_tracking new
                    ON old.new_stage_id = new.old_stage_id
                   AND old.task_id = new.task_id
            ), all_moves_stage_task AS (
                SELECT task_id,
                       project_id,
                       date_begin,
                       date_end,
                       old_stage_id AS stage_id
                  FROM all_stage_changes
            UNION
                SELECT id AS task_id,
                       project_id,
                       create_date AS date_begin,
                       CURRENT_DATE AS date_end,
                       stage_id
                  FROM project_task
            )
            SELECT row_number() OVER  (
                    ORDER BY project_id,
                            date_begin,
                            date_end,
                            stage_id
                   ) AS id,
                   project_id,
                   date_begin,
                   date_end,
                   stage_id,
                   COUNT(task_id) AS nb_tasks
            FROM all_moves_stage_task
            GROUP BY project_id,
                date_begin,
                date_end,
                stage_id
        """

        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute(
            sql.SQL("CREATE or REPLACE VIEW {} as ({})").format(
                sql.Identifier(self._table),
                sql.SQL(query)
            )
        )
