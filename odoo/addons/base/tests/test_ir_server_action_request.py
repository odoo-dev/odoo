# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

import requests

from odoo.tests import TransactionCase, mute_logger

from odoo.addons.base.models.ir_server_action_request import RequestError


class TestServerActionRequest(TransactionCase):
    @mute_logger("odoo.addons.base.models.ir_server_action_request")
    @patch("odoo.addons.base.models.ir_server_action_request.requests.request")
    def test_request_validation_and_json(self, send):
        model = self.env["ir.server.action.request"]
        ICP = self.env["ir.config_parameter"].sudo()
        ICP.set_str("server_action_request_domains", "api.example.com")
        response = requests.Response()
        response.status_code = 200
        response._content = b'{"ok": true}'
        send.return_value = response

        self.assertEqual(
            model.request("POST", "https://api.example.com/path", {"a": 1}),
            {"ok": True},
        )
        send.assert_called_once_with(
            "POST",
            "https://api.example.com/path",
            json={"a": 1},
            headers={"Content-Type": "application/json"},
            timeout=10,
            allow_redirects=False,
        )
        for url in (
            "https://evil.example.com/",
            "https://api.example.com.evil.test/",
            "https://api.example.com@evil.test/",
            "file://api.example.com/path",
        ):
            with self.assertRaises(RequestError):
                model.request("GET", url)

        with self.assertRaises(RequestError):
            model.request(
                "POST",
                "https://api.example.com/",
                headers={"content-type": "text/plain"},
            )
        self.assertEqual(send.call_count, 1)

    @mute_logger("odoo.addons.base.models.ir_server_action_request")
    @patch("odoo.addons.base.models.ir_server_action_request.requests.request")
    def test_request_failure_is_opaque(self, send):
        ICP = self.env["ir.config_parameter"].sudo()
        ICP.set_str("server_action_request_domains", "api.example.com")
        send.side_effect = requests.ConnectionError("secret internal address")
        with self.assertRaises(RequestError):
            self.env["ir.server.action.request"].request("GET", "https://api.example.com/")
