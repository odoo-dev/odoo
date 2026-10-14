# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

import odoo.tests

from odoo.addons.pos_self_order.tests.self_order_common_test import SelfOrderCommonTest


@odoo.tests.tagged('post_install', '-at_install')
class TestSelfOrderController(SelfOrderCommonTest):
    def test_validate_partner_delivery_distance(self):
        self.pos_config.self_ordering_mode = 'mobile'
        self.pos_config.with_user(self.pos_user).open_ui()
        self.pos_config.current_session_id.set_opening_control(0, '')

        with patch('odoo.addons.base_geolocalize.models.base_geocoder.BaseGeocoder.geo_find', return_value=(50.0, 4.0)):
            self.delivery_preset.write({
                'delivery_from_street': 'Main St 1',
                'delivery_from_city': 'Test City',
                'delivery_from_zip': '1000',
                'delivery_from_country_id': self.env.ref('base.be').id,
                'delivery_max_distance_km': 5.0,
            })

        for partner_name, latitude, expected_error in (('Customer Near', 50.001, None), ('Customer Far', 51.0, 'delivery')):
            customer = self.env['res.partner'].create({
                'name': partner_name,
                'street': 'Main St 2',
                'city': 'Test City',
                'zip': '1000',
                'country_id': self.env.ref('base.be').id,
                'partner_latitude': latitude,
                'partner_longitude': 4.0,
            })
            data = self.make_request_to_controller('/pos-self-order/validate-partner', {
                'access_token': self.pos_config.access_token,
                'preset_id': self.delivery_preset.id,
                'partner_id': self.env['pos.order']._get_signed_self_partner_id(self.pos_config, customer.id),
                'name': customer.name,
                'phone': customer.phone,
                'street': customer.street,
                'zip': customer.zip,
                'city': customer.city,
                'country_id': customer.country_id.id,
            })
            self.assertEqual(data.get('error', {}).get('type'), expected_error, partner_name)
