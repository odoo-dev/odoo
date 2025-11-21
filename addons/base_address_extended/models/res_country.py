# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResCountry(models.Model):
    _inherit = 'res.country'

    enforce_cities = fields.Boolean(
        string='Enforce Cities',
        help="Check this box to ensure every address created in that country has a 'City' chosen "
             "in the list of the country's cities.")

    city_ids = fields.One2many(string="Cities", comodel_name='res.city', inverse_name='country_id')

    def _has_cities(self):
        self.ensure_one()
        return bool(self.env['res.city'].search_count([('country_id', '=', self.id)], limit=1))

    def _get_partner_city_field(self):
        if self.enforce_cities and self._has_cities():
            return 'city_id'
        return 'city'
