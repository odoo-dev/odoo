# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

import odoo.tests

from odoo.addons.pos_self_order.tests.self_order_common_test import SelfOrderCommonTest


@odoo.tests.tagged('post_install', '-at_install')
class TestSelfOrderController(SelfOrderCommonTest):
    def test_validate_partner_delivery_distance_accepts_within_limit(self):
        self.pos_config.self_ordering_mode = 'mobile'
        self.pos_config.with_user(self.pos_user).open_ui()
        self.pos_config.current_session_id.set_opening_control(0, '')
        self.env['ir.config_parameter'].sudo().set_str('google_address_autocomplete.google_places_api_key', 'test_api_key')

        with patch('odoo.addons.base_geolocalize.models.base_geocoder.BaseGeocoder.geo_find', return_value=(50.0, 4.0)):
            self.delivery_preset.write({
                'delivery_from_address': 'Main St 1',
                'delivery_from_city': 'Test City',
                'delivery_from_zip': '1000',
                'delivery_from_country_id': self.env.ref('base.be').id,
                'delivery_max_distance_km': 5.0,
            })

        customer = self.env['res.partner'].create({
            'name': 'Customer',
            'street': 'Main St 2',
            'city': 'Test City',
            'zip': '1000',
            'country_id': self.env.ref('base.be').id,
            'partner_latitude': 50.001,
            'partner_longitude': 4.001,
        })

        params = {
            'access_token': self.pos_config.access_token,
            'preset_id': self.delivery_preset.id,
            'partner_id': self.env['pos.order']._get_signed_self_partner_id(self.pos_config, customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'street': customer.street,
            'zip': customer.zip,
            'city': customer.city,
            'country_id': customer.country_id.id,
            'state_id': customer.state_id.id,
            'email': customer.email,
        }

        with patch('odoo.addons.base_geolocalize.models.res_partner.ResPartner.geo_localize', return_value=True):
            data = self.make_request_to_controller('/pos-self-order/validate-partner', params)

        self.assertIn('res.partner', data)
        self.assertNotIn('error', data)

    def test_validate_partner_delivery_distance_rejects_outside_limit(self):
        self.pos_config.self_ordering_mode = 'mobile'
        self.pos_config.with_user(self.pos_user).open_ui()
        self.pos_config.current_session_id.set_opening_control(0, '')
        self.env['ir.config_parameter'].sudo().set_str('google_address_autocomplete.google_places_api_key', 'test_api_key')

        with patch('odoo.addons.base_geolocalize.models.base_geocoder.BaseGeocoder.geo_find', return_value=(0.0, 0.0)):
            self.delivery_preset.write({
                'delivery_from_address': 'Main St 1',
                'delivery_from_city': 'Test City',
                'delivery_from_zip': '1000',
                'delivery_from_country_id': self.env.ref('base.be').id,
                'delivery_max_distance_km': 1.0,
            })

        customer = self.env['res.partner'].create({
            'name': 'Customer Far',
            'street': 'Far St 1',
            'city': 'Test City',
            'zip': '1000',
            'country_id': self.env.ref('base.be').id,
            'partner_latitude': 1.0,
            'partner_longitude': 0.0,
        })

        params = {
            'access_token': self.pos_config.access_token,
            'preset_id': self.delivery_preset.id,
            'partner_id': self.env['pos.order']._get_signed_self_partner_id(self.pos_config, customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'street': customer.street,
            'zip': customer.zip,
            'city': customer.city,
            'country_id': customer.country_id.id,
            'state_id': customer.state_id.id,
            'email': customer.email,
        }

        with patch('odoo.addons.base_geolocalize.models.res_partner.ResPartner.geo_localize', return_value=True):
            data = self.make_request_to_controller('/pos-self-order/validate-partner', params)

        self.assertIn('error', data)
        self.assertEqual(data['error']['type'], 'delivery')
