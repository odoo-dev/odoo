from odoo import fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    is_behind_chorus_pro = fields.Boolean()
