# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    _base__europe = models.Ref('base.europe', 'res.country.group')

    l10n_eu_oss_eu_country = fields.Boolean('Is European country?', compute='_compute_l10n_eu_oss_european_country')

    @api.depends('company_id')
    def _compute_l10n_eu_oss_european_country(self):
        european_countries = self._base__europe.country_ids
        for record in self:
            record.l10n_eu_oss_eu_country = record.company_id.account_fiscal_country_id in european_countries
