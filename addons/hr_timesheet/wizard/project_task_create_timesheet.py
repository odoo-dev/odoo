# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ProjectTaskCreateTimesheet(models.TransientModel):
    _name = 'project.task.create.timesheet'
    _description = "Create Timesheet from task"

    _sql_constraints = [('time_positive', 'CHECK(time_spent > 0)', 'The timesheet\'s time must be positive' )]

    time_spent = fields.Float('Time', digits=(16, 2))
    description = fields.Char('Description')
    task_id = fields.Many2one(
        'project.task', "Task", required=True,
        default=lambda self: self.env.context.get('active_id', None),
        help="Task for which we are creating a sales order",
    )

    def save_timesheet(self):
        analytic_line = self.task_id.timesheet_ids.filtered(lambda l: l.user_timer_id)
        self.task_id.user_timer_id.unlink()
        return analytic_line.write({
            'name': self.description,
            'unit_amount': self.time_spent,
        })

    def action_delete_timesheet(self):
        analytic_line = self.task_id.timesheet_ids.filtered(lambda l: l.user_timer_id)
        analytic_line.unlink()
