from odoo import models


class HrEmployeeType(models.Model):
    _inherit = 'hr.employee.type'

    _hr__contract_type_company_executive = models.Ref('hr.contract_type_company_executive', required=False)
