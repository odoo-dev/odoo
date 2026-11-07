from odoo import models


class IrAccess(models.Model):
    _inherit = 'ir.access'

    _base__res_partner_bank_rule_user = models.Ref('base.res_partner_bank_rule_user', 'ir.access', required=False)
    _base__res_partner_bank_rule_user_1 = models.Ref('base.res_partner_bank_rule_user_1', 'ir.access', required=False)
