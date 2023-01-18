# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models

class ResUsers(models.Model):
    _inherit = 'res.users'

    def _create_recruitment_interviewers(self):
        if not self:
            return
        interviewer_group = self.env.ref('hr_recruitment.group_hr_recruitment_interviewer')
        recruitment_group = self.env.ref('hr_recruitment.group_hr_recruitment_user')

        interviewers = self - recruitment_group.users
        interviewers.sudo().write({
            'groups_id': [(4, interviewer_group.id)]
        })

    def _remove_recruitment_interviewers(self):
        if not self:
            return
        interviewer_group = self.env.ref('hr_recruitment.group_hr_recruitment_interviewer')
        recruitment_group = self.env.ref('hr_recruitment.group_hr_recruitment_user')

        job_interviewers = self.env['hr.job']._aggregate([('interviewer_ids', 'in', self.ids)], groupby=['interviewer_ids'])
        user_ids = {interviewer_id for [interviewer_id] in job_interviewers.keys()}

        application_interviewers = self.env['hr.applicant']._aggregate([('interviewer_ids', 'in', self.ids)], groupby=['interviewer_ids'])
        user_ids |= {interviewer_id for [interviewer_id] in application_interviewers.keys()}

        # Remove users that are no longer interviewers on at least a job or an application
        users_to_remove = set(self.ids) - (user_ids | set(recruitment_group.users.ids))
        self.env['res.users'].browse(users_to_remove).sudo().write({
            'groups_id': [(3, interviewer_group.id)]
        })
