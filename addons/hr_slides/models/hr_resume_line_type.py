from odoo import models


class HrResumeLineType(models.Model):
    _inherit = 'hr.resume.line.type'

    _hr__resume_type_training = models.Ref('hr.resume_type_training', required=False)
