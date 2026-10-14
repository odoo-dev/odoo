# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    @api.model
    def _load_pos_self_data_read(self, records, config):
        read_records = super()._load_pos_self_data_read(records, config)
        if read_records:
            google_places_api_key = self.env['ir.config_parameter'].sudo().get_str('google_address_autocomplete.google_places_api_key')
            read_records[0]['_has_google_places_api_key'] = bool(google_places_api_key)
        return read_records
