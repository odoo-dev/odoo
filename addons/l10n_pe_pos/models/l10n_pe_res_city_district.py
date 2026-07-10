# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models, api


class L10n_PeResCityDistrict(models.Model):
    _name = 'l10n_pe.res.city.district'
    _inherit = ["l10n_pe.res.city.district", "pos.load.mixin"]

    country_id = fields.Many2one(related="city_id.country_id")
    state_id = fields.Many2one(related="city_id.state_id")

    @api.model
    def _load_pos_data_fields(self, config):
        return ["name", "city_id", "country_id", "state_id"]

    @api.model
    def _load_pos_data_domain(self, data, config):
        l10n_pe_district_ids = {partner['l10n_pe_district'] for partner in data['res.partner'] if partner.get('l10n_pe_district')}
        return [('id', 'in', list(l10n_pe_district_ids))]
