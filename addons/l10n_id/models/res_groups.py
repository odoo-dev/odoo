from odoo import models


class ResGroups(models.Model):
    _inherit = 'res.groups'

    _account__group_cash_rounding = models.Ref('account.group_cash_rounding', 'res.groups')
    _base__group_user = models.Ref('base.group_user', 'res.groups')
