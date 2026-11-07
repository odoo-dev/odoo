# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ResUsers(models.Model):
    _inherit = 'res.users'

    def _create_recruitment_interviewers(self):
        if not self:
            return

        interviewers = self - self.env['res.groups'].ref('hr_recruitment.group_hr_recruitment_user').all_user_ids
        interviewers.sudo().write({
            'group_ids': [(4, self.env['res.groups'].ref('hr_recruitment.group_hr_recruitment_interviewer').id)]
        })

    def _remove_recruitment_interviewers(self):
        if not self:
            return

        job_interviewers = self.env['hr.job']._read_group([('interviewer_ids', 'in', self.ids)], ['interviewer_ids'])
        user_ids = {interviewer.id for [interviewer] in job_interviewers}

        application_interviewers = self.env['hr.applicant']._read_group([('interviewer_ids', 'in', self.ids)], ['interviewer_ids'])
        user_ids |= {interviewer.id for [interviewer] in application_interviewers}

        # Remove users that are no longer interviewers on at least a job or an application
        users_to_remove = set(self.ids) - (user_ids | set(self.env['res.groups'].ref('hr_recruitment.group_hr_recruitment_user').all_user_ids.ids))
        self.env['res.users'].browse(users_to_remove).sudo().write({
            'group_ids': [(3, self.env['res.groups'].ref('hr_recruitment.group_hr_recruitment_interviewer').id)]
        })
