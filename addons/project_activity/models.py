# -*- coding: utf-8 -*-

from openerp import models, fields, api
from openerp.exceptions import ValidationError

class project_activity(models.Model):
    _name = 'project.activity'
    
    name = fields.Char(compute='_get_name')

    user_id = fields.Many2one('res.users', string="User", required=True)
    project_id = fields.Many2one('project.project', string="Project")
    
    task_id = fields.Many2one('project.task', string="Task",
                              inverse='_select_task_id',
                              store=True)

    time = fields.Float(string="Time", help="Time in hours")

    start_date = fields.Datetime(default=fields.Date.today, required="True")
    end_date = fields.Datetime(default=fields.Date.today, required="True")

    # used by the gantt view
    project_start_date = fields.Datetime(compute="_get_project_start_date")
    project_end_date = fields.Datetime(compute="_get_project_end_date")
    task_start_date = fields.Datetime(compute="_get_task_start_date")
    task_end_date = fields.Datetime(compute="_get_task_end_date")

    
    @api.one
    def _get_name(self):
        self.name = self.user_id.name + " - " + self.project_id.name
        if (self.task_id): self.name += " - " + self.task_id.name

    @api.one
    def _get_project_start_date(self):
        self.project_start_date = self.project_id.date_start if (self.project_id) else ""
        
    @api.one
    def _get_project_end_date(self):
        self.project_end_date = self.project_id.date if (self.project_id) else ""
 
    @api.one
    def _get_task_start_date(self):
        self.task_start_date = self.task_id.date_start if (self.task_id) else ""
 
    @api.one
    def _get_task_end_date(self):
        self.task_end_date = self.task_id.date_end if (self.task_id) else ""
        
    # Fill the project_id if empty and the task is assigned to a project
    @api.one
    def _select_task_id(self):
        print("here")
        if not self.project_id and self.task_id.project_id:
            self.project_id = self.task_id.project_id

    @api.one
    @api.constrains('time')
    def _check_time_positive(self):
        if self.time and (self.time < 0):
            raise ValidationError("The time must be positive")
    
    @api.one
    @api.constrains('task_id', 'project_id')
    def _task_id_in_project(self):
        if self.project_id and self.task_id and (self.task_id not in self.project_id.tasks):
            raise ValidationError("Your task is not in the selected project.")

    @api.one
    @api.constrains('start_date', 'end_date')
    def _start_date_lower_end_date(self):
        if self.start_date > self.end_date:
            raise ValidationError("The start-date must be lower than end-date.")
