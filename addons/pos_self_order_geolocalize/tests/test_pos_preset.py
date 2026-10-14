# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

import odoo.tests
from odoo.exceptions import ValidationError

from odoo.addons.pos_self_order.tests.self_order_common_test import SelfOrderCommonTest


@odoo.tests.tagged('post_install', '-at_install')
class TestPosPreset(SelfOrderCommonTest):
    def test_preset_delivery_from_address_geolocation(self):
        """The sender address is geolocated on save, and an address that cannot be located blocks the save.
        Each address part is sent once, and the company address does not fill the missing ones."""
        self.env.company.state_id = self.env.ref('base.state_us_5')
        with patch('odoo.addons.base_geolocalize.models.base_geocoder.BaseGeocoder.geo_find', return_value=(50.85, 4.35)) as geo_find:
            self.delivery_preset.write({
                'delivery_from_street': 'Rue de la Loi 16',
                'delivery_from_zip': '1000',
                'delivery_from_city': 'Brussels',
                'delivery_from_country_id': self.env.ref('base.be').id,
            })
        geo_find.assert_called_once_with('Rue de la Loi 16, 1000 Brussels, Belgium', force_country='Belgium')
        self.assertEqual((self.delivery_preset.delivery_from_latitude, self.delivery_preset.delivery_from_longitude), (50.85, 4.35))

        with (
            patch('odoo.addons.base_geolocalize.models.base_geocoder.BaseGeocoder.geo_find', return_value=None),
            self.assertRaises(ValidationError),
        ):
            self.delivery_preset.write({'delivery_from_street': 'Unknown Street 1'})
