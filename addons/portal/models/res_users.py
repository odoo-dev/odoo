from odoo import models


class ResUsers(models.Model):
    _inherit = 'res.users'

    _base__public_user = models.Ref('base.public_user', 'res.users')
