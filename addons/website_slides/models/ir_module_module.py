from odoo import models


class IrModuleModule(models.Model):
    _inherit = 'ir.module.module'

    _base__module_survey = models.Ref('base.module_survey', 'ir.module.module')
