from odoo import models


class ResUsers(models.Model):
    _inherit = 'res.users'

    _base__user_demo = models.Ref('base.user_demo', required=False)
