# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class PosPreset(models.Model):
    _inherit = 'pos.preset'

    # The delivery distance check only runs when customers can pick their
    # address with the autocomplete, see `_can_check_delivery_address`.
    has_google_places_api_key = fields.Boolean(compute='_compute_has_google_places_api_key')

    def _compute_has_google_places_api_key(self):
        google_places_api_key = self.env['ir.config_parameter'].sudo().get_str('google_address_autocomplete.google_places_api_key')
        self.has_google_places_api_key = bool(google_places_api_key)
