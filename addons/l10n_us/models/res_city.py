# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ResCity(models.Model):
    _inherit = 'res.city'

    l10n_us_county_code = fields.Char(string='County Code')
    l10n_us_county_id = fields.Many2one(
        comodel_name='l10n_us.res.county',
        string='County',
        compute='_compute_l10n_us_county_id',
        store=True,
        readonly=False,
        domain="[('state_id', '=', state_id)]",
    )

    @api.depends('l10n_us_county_code')
    def _compute_l10n_us_county_id(self):
        """Resolve the county in one search rather than an external id lookup per city."""
        codes = set(self.mapped('l10n_us_county_code')) - {False, ''}
        counties = self.env['l10n_us.res.county'].search([('code', 'in', list(codes))])
        by_code = {county.code: county for county in counties}
        for city in self:
            city.l10n_us_county_id = by_code.get(city.l10n_us_county_code, city.l10n_us_county_id)
