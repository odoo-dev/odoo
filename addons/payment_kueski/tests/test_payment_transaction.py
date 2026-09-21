# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import json
from unittest.mock import MagicMock, patch

from odoo import Command
from odoo.tests import tagged
from odoo.tools import mute_logger

from odoo.addons.mail.tools import jwt
from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_kueski.tests.common import KueskiCommon


@tagged("post_install", "-at_install")
class TestPaymentTransaction(KueskiCommon):
    def test_rendering_values_create_authenticated_payment_intent(self):
        """Test that the payment intent is created with a JWT signed with the API secret."""
        tx = self._create_transaction("redirect").with_context(payment_safe_write=True)
        response = MagicMock()
        response.json.return_value = {
            "status": "success",
            "data": {"payment_intent": self.intent_data},
        }
        with (
            patch.object(payment_utils, "generate_access_token", self._generate_test_access_token),
            patch(
                "odoo.addons.payment.models.payment_provider.requests.request",
                return_value=response,
            ) as request_mock,
        ):
            rendering_values = tx._get_specific_rendering_values(None)

        self.assertDictEqual(
            rendering_values,
            {
                "api_url": self.intent_data["redirect_url"],
                "http_method": "get",
                "url_params": {"payment_intent_id": self.intent_id},
            },
        )
        self.assertEqual(tx.provider_reference, self.intent_id)

        method, url = request_mock.call_args.args
        body = request_mock.call_args.kwargs["data"]
        headers = request_mock.call_args.kwargs["headers"]
        self.assertEqual(
            (method, url), ("POST", "https://testing.kueskipay.com/v2/payment_intents")
        )
        return_url = (
            f"{tx.provider_id.get_base_url()}/payment/kueski/return"
            f"?tx_ref=Test+Transaction&access_token={self._generate_test_access_token(tx.reference)}"
        )
        self.assertDictEqual(
            json.loads(body),
            {
                "order_id": tx.reference,
                "description": tx.reference,
                "amount": {"amount": "1111.11", "currency": "MXN"},
                "capture_method": "automatic",
                "billing": {
                    "business": {"name": "Norbert Buyer"},
                    "address": {
                        "street": "Huge Street",
                        "interior": "2/543",
                        "city": "Sin City",
                        "zipcode": "1000",
                        "country": "BE",
                    },
                    "phone_number": "0032 12 34 56 78",
                    "email": "norbert.buyer@example.com",
                },
                "callbacks": {
                    "on_success": return_url,
                    "on_reject": return_url,
                    "on_canceled": return_url,
                    "on_failed": return_url,
                },
            },
        )
        self.assertTrue(headers["Idempotency-Key"])
        scheme, token = headers["Authorization"].split()
        claims = jwt.verify(
            token, base64.urlsafe_b64encode(b"dummy_secret0").decode(), jwt.Algorithm.HS256
        )
        self.assertEqual(scheme, "Bearer")
        self.assertEqual(claims["public_key"], "dummy_api_key")
        self.assertEqual(claims["exp"] - claims["iat"], 300)

    def test_order_values_list_product_lines_and_shipping(self):
        """Test that the order sends its product lines with integer quantities, and its shipping."""
        if "sale.order" not in self.env:
            self.skipTest("Requires the module `sale`.")
        product = self.env["product.product"].create({"name": "Laptop", "default_code": "LAP-01"})
        order = self.env["sale.order"].create({
            "partner_id": self.partner.id,
            "order_line": [
                Command.create({
                    "product_id": product.id,
                    "product_uom_qty": 2,
                    "price_unit": 100,
                    "tax_ids": [],
                }),
                Command.create({
                    "product_id": product.id,
                    "product_uom_qty": 2.5,
                    "price_unit": 10,
                    "tax_ids": [],
                }),
                Command.create({"display_type": "line_note", "name": "Note"}),
                Command.create({
                    "product_id": product.id,
                    "product_uom_qty": 1,
                    "price_unit": -5,
                    "tax_ids": [],
                }),
            ],
        })
        tx = self._create_transaction("redirect", sale_order_ids=[Command.set(order.ids)])

        values = tx._kueski_prepare_order_values()

        item = {
            "name": "Laptop",
            "tax": "0.00",
            "currency": order.currency_id.name,
            "sku": "LAP-01",
        }
        self.assertListEqual(
            values["items"],
            [{**item, "quantity": 2, "price": "100.00"}, {**item, "quantity": 1, "price": "25.00"}],
        )
        self.assertDictEqual(values["shipping"]["name"], {"first": "Norbert", "last": "Buyer"})
        self.assertEqual(values["shipping"]["address"]["street"], "Huge Street")

    @mute_logger("odoo.addons.payment_kueski.models.payment_transaction")
    def test_apply_updates_maps_status_to_state(self):
        """Test that each payment intent status maps to the expected transaction state."""
        for status, state in (
            ("created", "pending"),
            ("processing", "pending"),
            ("authorized", "done"),
            ("success", "done"),
            ("canceled", "cancel"),
            ("declined", "error"),
            ("refunded", "error"),
        ):
            with self.subTest(status=status):
                tx = self._create_transaction("redirect", reference=f"{self.reference} {status}")
                tx.with_context(payment_safe_write=True)._apply_updates(
                    dict(self.intent_data, status=status, status_reason="generic_decline")
                )
                self.assertEqual(tx.state, state)
