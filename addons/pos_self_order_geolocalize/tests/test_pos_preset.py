# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

import odoo.tests
from odoo.tests import Form

from odoo.addons.pos_self_order.tests.self_order_common_test import SelfOrderPresetCommonTest


@odoo.tests.tagged('post_install', '-at_install')
class TestPosPreset(SelfOrderPresetCommonTest):
    def test_preset_delivery_from_address_form(self):
        self.env.company.write({'street': 'Rue de la Loi 16', 'city': 'Brussels', 'zip': '1000'})
        with patch('odoo.addons.base_geolocalize.models.base_geocoder.BaseGeocoder.geo_find', return_value=(50.85, 4.35)) as geo_find:
            preset_form = Form(self.env['pos.preset'])
            preset_form.name = 'Other Delivery'
            preset_form.available_in_self = True
            preset_form.service_at = 'delivery'
            self.assertEqual(preset_form.delivery_from_street, 'Rue de la Loi 16')
            geo_find.assert_not_called()
            preset = preset_form.save()
        self.assertEqual(preset.delivery_from_address, 'Rue de la Loi 16, 1000, Brussels, Belgium')
        self.assertEqual((preset.delivery_from_latitude, preset.delivery_from_longitude), (50.85, 4.35))
