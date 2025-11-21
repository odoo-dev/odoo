# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResCountryState(models.Model):
    _inherit = 'res.country.state'

    city_ids = fields.One2many(string="Cities", comodel_name='res.city', inverse_name='state_id')
