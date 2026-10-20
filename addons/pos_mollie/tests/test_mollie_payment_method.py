from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from odoo import Command
from odoo.exceptions import ValidationError
from odoo.tests import Form, tagged
from odoo.tools import verify_hash_signed

from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon


@tagged("post_install", "-at_install")
class TestMolliePaymentMethod(TestPointOfSaleHttpCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.payment_provider = cls.env["payment.provider"].create({"name": "Mollie Test", "code": "mollie", "mollie_api_key": "mockApiKey"})
        cls.payment_provider_2 = cls.env["payment.provider"].create({"name": "Mollie Test 2", "code": "mollie", "mollie_api_key": "mockApiKey2"})
        cls.main_pos_config.write({
            "payment_method_ids": [
                (0, 0, {
                    "name": "Mollie",
                    "type": "bank",
                    "payment_provider": "mollie",
                    "terminal_ids": [
                        Command.create({"mollie_terminal_id": "MOLLIE123", "mollie_payment_provider_id": cls.payment_provider.id}),
                        Command.create({"mollie_terminal_id": "MOLLIE456", "mollie_payment_provider_id": cls.payment_provider_2.id}),
                    ],
                    "payment_method_type": "terminal",
                    "journal_id": cls.bank_journal.id,
                }),
            ],
        })
        cls.mollie_payment_method = cls.main_pos_config.payment_method_ids.filtered(lambda pm: pm.payment_provider == "mollie")
        cls.terminal_1, cls.terminal_2 = cls.mollie_payment_method.terminal_ids

    def _mock_send_api_request(self):
        return patch(
            "odoo.addons.payment.models.payment_provider.PaymentProvider._send_api_request",
            autospec=True,
            return_value={"id": "test", "status": "open"},
        )

    def test_payment(self):
        with self._mock_send_api_request() as mock_request:
            self.mollie_payment_method.mollie_create_payment(5.00, "uuid", 1, self.terminal_2.id)
            provider, method, path = mock_request.call_args.args
            payload = mock_request.call_args.kwargs.get("json")

        self.assertEqual(provider, self.payment_provider_2)
        self.assertEqual(method, "POST")
        self.assertEqual(path, "/payments")
        self.assertEqual(payload["amount"]["value"], "5.00")
        self.assertEqual(payload["description"], "pos_session_id=1,payment_uuid=uuid")
        self.assertEqual(payload["method"], "pointofsale")
        self.assertEqual(payload["terminalId"], "MOLLIE456")

        # The webhook gets the terminal to fetch the payment with its provider
        signed_payload = parse_qs(urlsplit(payload["webhookUrl"]).query)["payload"][0]
        decoded_payload = verify_hash_signed(self.env(su=True), "pos_mollie", signed_payload)
        self.assertEqual(decoded_payload["terminal_id"], self.terminal_2.id)

    def test_payment_without_terminal(self):
        # e.g. from the Self Order Kiosk, the first terminal is used
        with self._mock_send_api_request() as mock_request:
            self.mollie_payment_method.mollie_create_payment(5.00, "uuid", 1)
            provider = mock_request.call_args.args[0]
            payload = mock_request.call_args.kwargs.get("json")

        self.assertEqual(provider, self.payment_provider)
        self.assertEqual(payload["terminalId"], "MOLLIE123")

    def test_payment_with_unknown_terminal(self):
        other_terminal = self.env["pos.payment.terminal"].create({"payment_method_id": self.bank_payment_method.id})
        with self._mock_send_api_request(), self.assertRaises(ValidationError):
            self.mollie_payment_method.mollie_create_payment(5.00, "uuid", 1, other_terminal.id)

    def test_refund(self):
        with self._mock_send_api_request() as mock_request:
            self.mollie_payment_method.mollie_create_refund("test", 5.00, "uuid", 1, self.terminal_2.id)
            provider, method, path = mock_request.call_args.args
            payload = mock_request.call_args.kwargs.get("json")

        self.assertEqual(provider, self.payment_provider_2)
        self.assertEqual(method, "POST")
        self.assertEqual(path, "/payments/test/refunds")
        self.assertEqual(payload["amount"]["value"], "5.00")
        self.assertEqual(payload["description"], "pos_session_id=1,payment_uuid=uuid")

    def test_cancel(self):
        with self._mock_send_api_request() as mock_request:
            self.mollie_payment_method.mollie_cancel_payment("test", self.terminal_2.id)
            provider, method, path = mock_request.call_args.args

        self.assertEqual(provider, self.payment_provider_2)
        self.assertEqual(method, "DELETE")
        self.assertEqual(path, "/payments/test")

    def test_get(self):
        with self._mock_send_api_request() as mock_request:
            self.mollie_payment_method.mollie_get_payment("test", self.terminal_2.id)
            provider, method, path = mock_request.call_args.args

        self.assertEqual(provider, self.payment_provider_2)
        self.assertEqual(method, "GET")
        self.assertEqual(path, "/payments/test")

    def test_form_terminals(self):
        with Form(self.env["pos.payment.method"]) as form:
            form.name = "Mollie Form"
            form.type = "bank"
            form.journal_id = self.bank_journal
            form.payment_method_type = "terminal"
            form.payment_provider = "mollie"
            # Selecting the provider adds a first terminal to configure
            self.assertEqual(len(form.terminal_ids), 1)
            with form.terminal_ids.edit(0) as terminal:
                terminal.mollie_payment_provider_id = self.payment_provider
                terminal.mollie_terminal_id = "MOLLIE789"
            with form.terminal_ids.new() as terminal:
                terminal.mollie_payment_provider_id = self.payment_provider_2
                terminal.mollie_terminal_id = "MOLLIE012"
        payment_method = form.record

        self.assertRecordValues(payment_method.terminal_ids, [
            {"display_name": "Terminal 1", "mollie_terminal_id": "MOLLIE789", "mollie_payment_provider_id": self.payment_provider.id},
            {"display_name": "Terminal 2", "mollie_terminal_id": "MOLLIE012", "mollie_payment_provider_id": self.payment_provider_2.id},
        ])

        # A terminal can also be configured from its own form
        with Form(payment_method.terminal_ids[1]) as terminal:
            terminal.name = "Kiosk"
            terminal.mollie_terminal_id = "MOLLIE345"
        self.assertRecordValues(payment_method.terminal_ids[1], [{"name": "Kiosk", "mollie_terminal_id": "MOLLIE345"}])

    def test_terminal_required(self):
        with self.assertRaises(ValidationError):
            self.mollie_payment_method.terminal_ids = [Command.clear()]
