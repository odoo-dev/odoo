from odoo import models


class IrAccess(models.Model):
    _inherit = 'ir.access'

    _hr__access_hr_job_user = models.Ref('hr.access_hr_job_user', 'ir.access', required=False)
