# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

from odoo.tests import tagged
from odoo.tools import mute_logger

from odoo.addons.payment.tests.http_common import PaymentHttpCommon
from odoo.addons.payment_kueski.controllers.main import KueskiController
from odoo.addons.payment_kueski.tests.common import KueskiCommon


@tagged("post_install", "-at_install")
class TestProcessingFlows(KueskiCommon, PaymentHttpCommon):
    @mute_logger("odoo.addons.payment_kueski.controllers.main")
    def test_return_with_invalid_access_token_is_rejected(self):
        """Test that a redirection carrying an invalid access token is rejected."""
        self._create_transaction("redirect", provider_reference=self.intent_id)
        url = self._build_url(KueskiController._return_url)
        with patch(
            "odoo.addons.payment.models.payment_transaction.PaymentTransaction._record"
        ) as record_mock:
            response = self._make_http_get_request(
                url, params={"tx_ref": self.reference, "access_token": "dummy"}
            )
        self.assertEqual(response.status_code, 403)
        record_mock.assert_not_called()

    @mute_logger("odoo.addons.payment_kueski.controllers.main")
    def test_webhook_records_fetched_payment_intent_over_notified_status(self):
        """Test that the webhook records the fetched payment intent, not the notified status."""
        self._create_transaction("redirect", provider_reference=self.intent_id)
        url = self._build_url(KueskiController._webhook_url)
        fetched_data = dict(self.intent_data, status="declined", status_reason="generic_decline")
        with (
            patch(
                "odoo.addons.payment.models.payment_provider.PaymentProvider._send_api_request",
                return_value=fetched_data,
            ) as fetch_mock,
            patch(
                "odoo.addons.payment.models.payment_transaction.PaymentTransaction._record"
            ) as record_mock,
        ):
            response = self._make_json_request(
                url,
                data={
                    "payment_intent_id": "attacker_intent",
                    "order_id": self.reference,
                    "status": "authorized",
                },
            )
        self.assertEqual((response.status_code, response.json()), (200, {}))
        self.assertEqual(
            fetch_mock.call_args.args, ("GET", f"/v2/payment_intents/{self.intent_id}")
        )
        record_mock.assert_called_once_with(fetched_data)
