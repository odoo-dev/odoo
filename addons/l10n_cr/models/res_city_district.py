# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class L10n_CrResCityDistrict(models.Model):
    _name = 'l10n_cr.res.city.district'
    _description = 'District'
    _order = 'name'

    name = fields.Char(required=True)
    city_id = fields.Many2one(comodel_name='res.city', string='Cantón', required=True)
    code = fields.Char(help='Two-digit district code within its cantón.')

    @api.depends('name', 'city_id.name')
    def _compute_display_name(self):
        for district in self:
            district.display_name = f'{district.name} ({district.city_id.name})'
