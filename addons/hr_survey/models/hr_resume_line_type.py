from odoo import models


class HrResumeLineType(models.Model):
    _inherit = 'hr.resume.line.type'

    _hr_survey__resume_type_certification = models.Ref('hr_survey.resume_type_certification', required=False)
