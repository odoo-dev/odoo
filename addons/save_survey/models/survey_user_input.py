# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class SurveyUserInput(models.Model):
    _inherit = 'survey.user_input'

    def _save_lines(self, question, answer, comment=None, overwrite_existing=True):
        """"inheriting _save_lines to always set overwrite_existing to true."""
        super()._save_lines(question, answer, comment, True)

    def get_survey_save_url(self):
        self.ensure_one()
        survey_url = f'/survey/{self.survey_id.access_token}/{self.access_token}'
        return survey_url
