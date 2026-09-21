# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import json
from unittest.mock import MagicMock, patch

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

from odoo.tests import tagged
from odoo.tools import mute_logger

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_kueski.tests.common import KueskiCommon


@tagged("post_install", "-at_install")
class TestPaymentTransaction(KueskiCommon):
    def test_rendering_values_create_signed_payment_intent(self):
        """Test that the payment intent is created with a valid signature over the sent body."""
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
                "callbacks": {
                    "on_success": return_url,
                    "on_reject": return_url,
                    "on_canceled": return_url,
                    "on_failed": return_url,
                },
            },
        )
        self.assertEqual(headers["X-Merchant-Id"], "123456")
        self.assertTrue(headers["Idempotency-Key"])
        signed_data = f"123456|POST|{url}|{body}".encode()
        self.public_key.verify(  # Raises InvalidSignature if the body was not the signed one.
            base64.urlsafe_b64decode(headers["X-Signature"]),
            base64.urlsafe_b64encode(signed_data),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )

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
