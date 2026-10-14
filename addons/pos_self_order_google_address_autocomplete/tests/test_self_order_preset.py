# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

import odoo.tests

from odoo.addons.google_address_autocomplete.controllers.google_address_autocomplete import AutoCompleteController
from odoo.addons.pos_self_order.tests.self_order_common_test import SelfOrderPresetCommonTest


@odoo.tests.tagged('post_install', '-at_install')
class TestSelfOrderPreset(SelfOrderPresetCommonTest):
    def setUp(self):
        super().setUp()
        self.env["ir.config_parameter"].sudo().set_str(
            "google_address_autocomplete.google_places_api_key",
            "test_api_key_for_autocomplete"
        )

    def test_preset_delivery_tour(self):
        self.pos_config.with_user(self.pos_user).open_ui()
        self.pos_config.current_session_id.set_opening_control(0, "")
        self_route = self.pos_config._get_self_order_route()

        with patch(
            "odoo.addons.pos_self_order_geolocalize.controllers.orders.PosSelfOrderController._check_delivery_address_for_partner",
            side_effect=[
                None,  # First call: address is valid
                {"type": "delivery", "message": "Delivery isn\u2019t available for this address."},  # Second call: too far
            ],
        ), patch.object(
            AutoCompleteController,
            '_perform_place_search',
            return_value={
                "results": [
                    {
                        "formatted_address": "Rue du Bronx 90, 9999 New York",
                        "google_place_id": "test_place_id",
                    }
                ],
                "session_id": "test_session",
            },
        ), patch.object(
            AutoCompleteController,
            '_perform_complete_place_search',
            return_value={
                "street": "Rue du Bronx",
                "number": "90",
                "formatted_street_number": "Rue du Bronx 90",
                "zip": "9999",
                "city": "New York",
                "country": [self.env.ref("base.be").id, "Belgium"],
                "state": False,
            },
        ):
            self.start_tour(self_route, "self_order_preset_delivery_tour")

        last_order = self.env["pos.order"].search([], limit=1, order="id desc")
        self.assertEqual(last_order.partner_id.name, 'Dr Dre')
        self.assertEqual(last_order.partner_id.email, 'dre@dr.com')
        self.assertEqual(last_order.partner_id.street, 'Rue du Bronx 90, 9999 New York')
        self.assertEqual(last_order.partner_id.zip, '9999')
        self.assertEqual(last_order.partner_id.city, 'New York')
        self.assertEqual(last_order.partner_id.phone, '+32490904390')
