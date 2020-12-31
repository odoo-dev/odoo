# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class Applicant(models.Model):
    _inherit = "hr.applicant"

    survey_id = fields.Many2one('survey.survey', related='job_id.survey_id', string="Survey", readonly=True)
    response_id = fields.Many2one('survey.user_input', "Response", ondelete="set null")
    interview_note = fields.Html(compute='_compute_interview_note', readonly=False, store=True)

    @api.depends('job_id')
    def _compute_interview_note(self):
        for applicant in self.filtered(lambda x: not x.interview_note):
            applicant.interview_note = applicant.job_id.interview_template

    def action_start_survey(self):
        self.ensure_one()
        # create a response and link it to this applicant
        if not self.response_id:
            response = self.survey_id._create_answer(partner=self.partner_id)
            self.response_id = response.id
        else:
            response = self.response_id
        # grab the token of the response and start surveying
        return self.survey_id.action_start_survey(answer=response)

    def action_print_survey(self):
        """ If response is available then print this response otherwise print survey form (print template of the survey) """
        self.ensure_one()
        return self.survey_id.action_print_survey(answer=self.response_id)

    def action_send_survey(self):
        self.ensure_one()
        return self.survey_id.action_send_survey()
