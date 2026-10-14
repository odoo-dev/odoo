# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

import odoo.tests

from odoo.addons.base_geolocalize.models.res_partner import ResPartner
from odoo.addons.pos_self_order.tests.self_order_common_test import SelfOrderCommonTest


@odoo.tests.tagged('post_install', '-at_install')
class TestSelfOrderController(SelfOrderCommonTest):
    def setUp(self):
        super().setUp()
        self.pos_config.self_ordering_mode = 'mobile'
        self.pos_config.with_user(self.pos_user).open_ui()
        self.pos_config.current_session_id.set_opening_control(0, '')
        self.env['ir.config_parameter'].sudo().set_str('google_address_autocomplete.google_places_api_key', 'test_api_key')
        with patch('odoo.addons.base_geolocalize.models.base_geocoder.BaseGeocoder.geo_find', return_value=(50.0, 4.0)):
            self.delivery_preset.write({
                'delivery_from_street': 'Main St 1',
                'delivery_from_city': 'Test City',
                'delivery_from_zip': '1000',
                'delivery_from_country_id': self.env.ref('base.be').id,
                'delivery_max_distance_km': 5.0,
            })

    def _validate_partner(self, name, partner=None):
        return self.make_request_to_controller('/pos-self-order/validate-partner', {
            'access_token': self.pos_config.access_token,
            'preset_id': self.delivery_preset.id,
            'partner_id': partner and self.env['pos.order']._get_signed_self_partner_id(self.pos_config, partner.id),
            'name': name,
            'phone': '+32444444444',
            'street': 'Main St 2',
            'zip': '1000',
            'city': 'Test City',
            'country_id': self.env.ref('base.be').id,
        })

    def test_validate_partner_delivery_distance(self):
        for partner_name, latitude, expected_error in (('Customer Near', 50.001, None), ('Customer Far', 51.0, 'delivery')):
            customer = self.env['res.partner'].create({
                'name': partner_name,
                'street': 'Main St 2',
                'country_id': self.env.ref('base.be').id,
                'partner_latitude': latitude,
                'partner_longitude': 4.0,
            })
            data = self._validate_partner(partner_name, customer)
            self.assertEqual(data.get('error', {}).get('type'), expected_error, partner_name)

        # Without a Google Places API key, the delivery distance is not checked.
        self.env['ir.config_parameter'].sudo().set_str('google_address_autocomplete.google_places_api_key', False)
        self.assertNotIn('error', self._validate_partner('Customer Far', customer))

    def test_validate_partner_geolocate_new_partner(self):
        """A new partner whose street cannot be located falls back on the city center. A refused partner is kept."""
        geo_localize = ResPartner.geo_localize
        Partner = self.env['res.partner']
        for partner_name, city_location, expected_error in (
            ('Customer Near', (50.001, 4.0), None),
            ('Customer Far', (51.0, 4.0), 'delivery'),
            ('Customer Unknown', None, 'address'),
        ):
            with (
                patch.object(ResPartner, 'geo_localize', lambda partners: geo_localize(partners.with_context(force_geo_localize=True))),
                patch('odoo.addons.base_geolocalize.models.base_geocoder.BaseGeocoder.geo_find', side_effect=[None, city_location]),
            ):
                data = self._validate_partner(partner_name)
            self.assertEqual(data.get('error', {}).get('type'), expected_error, partner_name)
            self.assertEqual(Partner.search_count([('name', '=', partner_name)]), 1, partner_name)
