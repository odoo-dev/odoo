# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models
from odoo.tools.partner_identifiers import COMPANY_CATEGORIES

from odoo.addons.l10n_cr.tools.partner_identifiers import (
    CR_ADDITIONAL_IDENTIFIERS_METADATA,
)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_cr_district_id = fields.Many2one(
        comodel_name='l10n_cr.res.city.district',
        string='District (CR)',
        domain="[('city_id', '=?', city_id)]",
    )
    l10n_cr_district_name = fields.Char(string='District Name', related='l10n_cr_district_id.name')

    @api.depends('additional_identifiers')
    def _compute_is_company(self):
        company_keys = {
            key for key, metadata in CR_ADDITIONAL_IDENTIFIERS_METADATA.items()
            if metadata['category'] in COMPANY_CATEGORIES
        }
        cr_companies = self.filtered(
            lambda p: p.commercial_partner_id == p and company_keys & set(p.additional_identifiers or {}),
        )
        cr_companies.is_company = True
        super(ResPartner, self - cr_companies)._compute_is_company()

    @api.onchange('l10n_cr_district_id')
    def _onchange_l10n_cr_district_id(self):
        if self.l10n_cr_district_id:
            self.city_id = self.l10n_cr_district_id.city_id

    @api.onchange('city_id')
    def _onchange_l10n_cr_city_id(self):
        if self.l10n_cr_district_id and self.l10n_cr_district_id.city_id != self.city_id:
            self.l10n_cr_district_id = False

    @api.model
    def _address_fields(self):
        return super()._address_fields() + ['l10n_cr_district_id']

    @api.model
    def _formatting_address_fields(self):
        return super()._formatting_address_fields() + ['l10n_cr_district_name']

    @api.model
    def _get_all_additional_identifiers_metadata(self):
        return {
            **super()._get_all_additional_identifiers_metadata(),
            **CR_ADDITIONAL_IDENTIFIERS_METADATA,
        }

    def _get_frontend_writable_fields(self):
        return super()._get_frontend_writable_fields() | {'l10n_cr_district_id'}
