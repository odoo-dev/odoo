from odoo import models


class HrPayrollStructureType(models.Model):
    _inherit = 'hr.payroll.structure.type'

    _hr__structure_type_employee = models.Ref('hr.structure_type_employee')
