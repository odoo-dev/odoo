from odoo import models


class ResUsers(models.Model):
    _inherit = 'res.users'

    _base__user_admin_optional = models.Ref('base.user_admin', 'res.users', required=False)
