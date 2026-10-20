import json
import re
from unittest.mock import patch

from requests import Response

from odoo import Command
from odoo.exceptions import UserError, ValidationError
from odoo.tests.common import tagged
from odoo.tools import hmac

from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon


@tagged('post_install', '-at_install')
class TestAdyenPoS(TestPointOfSaleHttpCommon):
    _test_user_groups = None  # FIXME list needed groups

    def setUp(self):
        super().setUp()
        self.main_pos_config.write({
            "payment_method_ids": [
                Command.create({
                    "name": "Adyen",
                    'type': 'bank',
                    "adyen_api_key": "my_adyen_api_key",
                    "adyen_merchant_account": "my_adyen_merchant_account",
                    "adyen_test_mode": False,
                    "terminal_ids": [Command.create({"adyen_terminal_identifier": "my_adyen_terminal"})],
                    "payment_provider": "adyen",
                    "payment_method_type": "terminal",
                    'journal_id': self.bank_journal.id,
                }),
            ],
        })
        self.adyen_payment_method = self.main_pos_config.payment_method_ids.filtered(lambda pm: pm.payment_provider == "adyen")
        self.terminal_1 = self.adyen_payment_method.terminal_ids

    def _add_second_terminal(self):
        self.terminal_2 = self.env["pos.payment.terminal"].create({
            "payment_method_id": self.adyen_payment_method.id,
            "adyen_terminal_identifier": "my_other_adyen_terminal",
        })

    def mock_adyen_post(self, url, headers, json, **kwargs):
        response = Response()
        response._content = b"{}"

        if url != "https://terminal-api-live.adyen.com/async":
            response.status_code = 404
            return response
        self.assertEqual(headers.get("x-api-key"), "my_adyen_api_key")

        message = json["SaleToPOIRequest"]
        self.assertEqual(message["MessageHeader"]["POIID"], "my_adyen_terminal")
        if "PaymentRequest" in message:
            expected_hash = self.get_expected_hash(message["MessageHeader"]["ServiceID"], message["PaymentRequest"]["SaleData"]["SaleTransactionID"]["TransactionID"])
            received_hash = self.parse_received_hash(message["PaymentRequest"]["SaleData"]["SaleToAcquirerData"])

            self.assertEqual(received_hash, expected_hash)
            self.assertEqual(message["PaymentRequest"]["PaymentTransaction"]["AmountsReq"]["Currency"], "USD")
            self.assertEqual(message["PaymentRequest"]["PaymentTransaction"]["AmountsReq"]["RequestedAmount"], 1.98)
        elif "ReversalRequest" in message:
            self.assertEqual(message["ReversalRequest"]["ReversalReason"], "MerchantCancel")
            self.assertEqual(message["ReversalRequest"]["ReversedAmount"], 1.98)
            pass
        else:
            raise ValidationError("Unexpected Adyen request received")

        response.status_code = 200
        return response

    def get_expected_hash(self, service_id, transaction_id):
        return hmac(
            env=self.env,
            scope='pos_adyen_payment',
            message=(f"{self.main_pos_config.name} (ID: {self.main_pos_config.id})", service_id, "my_adyen_terminal", transaction_id)
        )

    def parse_received_hash(self, sale_to_acquirer_data):
        hash_regex = r"metadata\.pos_hmac=(.+)"
        match = re.search(hash_regex, sale_to_acquirer_data)
        self.assertIsNotNone(match, "POS HMAC could not be parsed from request to Adyen")
        return match and match[1]

    def test_adyen_basic_order(self):
        self.main_pos_config.with_user(self.pos_user).open_ui()

        with patch('odoo.addons.pos_adyen.models.pos_payment_method.requests.post', self.mock_adyen_post), \
             patch('odoo.addons.pos_adyen.controllers.main.consteq', lambda a, b: a == "dummy_hmac"):
            self.start_pos_tour('PosAdyenPaymentTour')

    def test_adyen_refund_order(self):
        self.main_pos_config.with_user(self.pos_user).open_ui()

        with patch('odoo.addons.pos_adyen.models.pos_payment_method.requests.post', self.mock_adyen_post), \
             patch('odoo.addons.pos_adyen.controllers.main.consteq', lambda a, b: a == "dummy_hmac"):
            self.start_pos_tour('PosAdyenRefundTour')

    def _get_payment_request(self, poi_id, transaction_id="order-uuid--1"):
        return {
            "SaleToPOIRequest": {
                "MessageHeader": {
                    "ProtocolVersion": "3.0",
                    "MessageClass": "Service",
                    "MessageType": "Request",
                    "MessageCategory": "Payment",
                    "SaleID": "POS (ID: 1)",
                    "ServiceID": "1234567890",
                    "POIID": poi_id,
                },
                "PaymentRequest": {
                    "SaleData": {
                        "SaleTransactionID": {
                            "TransactionID": transaction_id,
                            "TimeStamp": "2026-10-20T10:00:00+00:00",
                        },
                        "SaleToAcquirerData": "authorisationType=PreAuth",
                    },
                    "PaymentTransaction": {
                        "AmountsReq": {
                            "Currency": "USD",
                            "RequestedAmount": 1.98,
                        },
                    },
                },
            },
        }

    def _mock_requests_post(self):
        response = Response()
        response.status_code = 200
        response._content = b"ok"
        return patch("odoo.addons.pos_adyen.models.pos_payment_method.requests.post", return_value=response)

    def test_adyen_request_to_terminal(self):
        self._add_second_terminal()
        with self._mock_requests_post() as mock_post:
            self.assertTrue(self.adyen_payment_method.proxy_adyen_request(self._get_payment_request("my_other_adyen_terminal"), False, self.terminal_2.id))
            self.assertEqual(mock_post.call_args.kwargs["json"]["SaleToPOIRequest"]["MessageHeader"]["POIID"], "my_other_adyen_terminal")

            # The request must be addressed to the terminal of the payment
            with self.assertRaises(UserError):
                self.adyen_payment_method.proxy_adyen_request(self._get_payment_request("my_adyen_terminal"), False, self.terminal_2.id)

            # Without terminal (e.g. from the Self Order Kiosk), the first one is used
            self.assertTrue(self.adyen_payment_method.proxy_adyen_request(self._get_payment_request("my_adyen_terminal")))
            with self.assertRaises(UserError):
                self.adyen_payment_method.proxy_adyen_request(self._get_payment_request("my_other_adyen_terminal"))

            # A terminal of another payment method can't be used
            other_terminal = self.env["pos.payment.terminal"].create({"payment_method_id": self.bank_payment_method.id})
            with self.assertRaises(ValidationError):
                self.adyen_payment_method.proxy_adyen_request(self._get_payment_request("my_adyen_terminal"), False, other_terminal.id)

    def test_adyen_notification_buffered_on_terminal(self):
        self._add_second_terminal()
        self.main_pos_config.open_ui()
        session = self.main_pos_config.current_session_id
        self.terminal_1.sudo().adyen_latest_response = json.dumps({"previous": "response"})

        # A payment request clears the latest response of its terminal only
        with self._mock_requests_post():
            self.adyen_payment_method.proxy_adyen_request(self._get_payment_request("my_other_adyen_terminal"), False, self.terminal_2.id)
        self.assertEqual(self.adyen_payment_method.get_latest_adyen_status(self.terminal_1.id), {"previous": "response"})
        self.assertFalse(self.adyen_payment_method.get_latest_adyen_status(self.terminal_2.id))

        sale_id, service_id, transaction_id = "POS (ID: 1)", "1234567890", f"order-uuid--{session.id}"
        pos_hmac = self.adyen_payment_method._get_hmac(sale_id, service_id, "my_other_adyen_terminal", transaction_id)
        notification = {
            "SaleToPOIResponse": {
                "MessageHeader": {
                    "ProtocolVersion": "3.0",
                    "MessageClass": "Service",
                    "MessageType": "Response",
                    "MessageCategory": "Payment",
                    "SaleID": sale_id,
                    "ServiceID": service_id,
                    "POIID": "my_other_adyen_terminal",
                },
                "PaymentResponse": {
                    "Response": {
                        "Result": "Success",
                        "AdditionalResponse": f"useless=true&metadata.pos_hmac={pos_hmac}",
                    },
                    "SaleData": {"SaleTransactionID": {"TransactionID": transaction_id}},
                },
            },
        }
        with patch.object(self.env.registry["pos.config"], "_notify") as mock_notify:
            response = self.url_open("/pos_adyen/notification", data=json.dumps(notification), headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 200)
        mock_notify.assert_called_once_with("ADYEN_LATEST_RESPONSE", {"terminal_id": self.terminal_2.id})

        # The notification is buffered on the terminal that processed the payment
        self.env.invalidate_all()
        self.assertEqual(self.adyen_payment_method.get_latest_adyen_status(self.terminal_1.id), {"previous": "response"})
        latest_response = self.adyen_payment_method.get_latest_adyen_status(self.terminal_2.id)
        self.assertEqual(latest_response["SaleToPOIResponse"]["MessageHeader"]["POIID"], "my_other_adyen_terminal")
        self.assertNotIn("pos_hmac", latest_response["SaleToPOIResponse"]["PaymentResponse"]["Response"]["AdditionalResponse"])

    def test_adyen_terminal_identifier_unique(self):
        self._add_second_terminal()
        with self.assertRaises(ValidationError):
            self.terminal_2.adyen_terminal_identifier = "my_adyen_terminal"
        with self.assertRaises(ValidationError):
            self.env["pos.payment.terminal"].create({
                "payment_method_id": self.bank_payment_method.id,
                "adyen_terminal_identifier": "my_other_adyen_terminal",
            })

    def test_adyen_terminal_required(self):
        with self.assertRaises(ValidationError):
            self.adyen_payment_method.terminal_ids = [Command.clear()]
