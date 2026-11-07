from odoo import models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    _base__public_partner = models.Ref('base.public_partner')
