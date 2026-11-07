from odoo import models


class IrModuleModule(models.Model):
    _inherit = 'ir.module.module'

    _base__module_base = models.Ref('base.module_base', 'ir.module.module')
