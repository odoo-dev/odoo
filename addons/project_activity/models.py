# -*- coding: utf-8 -*-

from openerp import models, fields, api

class project_activity(models.Model):
    _name = 'project.activity'
    
    user_id = fields.Many2one('res.users', string="User", required=True)
    project_id = fields.Many2one('project.project', string="Project", required=True)
    
    task_ids = fields.Many2one('project.task', string="Task")

    time = fields.Float(string="Time", help="Time in hours")

    start_date = fields.Datetime()
    end_date = fields.Datetime()
    
