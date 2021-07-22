# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
from unittest.mock import patch

from odoo.addons.mail.tests.common import mail_new_test_user
from odoo.http import request
from odoo.tests.common import HttpCase


class TestMailPluginControllerCommon(HttpCase):
    def setUp(self):
        super(TestMailPluginControllerCommon, self).setUp()
        self.user_test = mail_new_test_user(
            self.env,
            login="employee",
            groups="base.group_user,base.group_partner_manager",
        )

    def mock_plugin_partner_get(self, name, email):
        """Simulate a HTTP call to /partner/get with the given email and name.

        The authentication process is patched to allow all queries.
        """
        def patched_auth_method_outlook(*args, **kwargs):
            request.update_env(user=self.user_test.id)

        data = {
            "id": 0,
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"email": email, "name": name},
        }

        with patch("odoo.addons.mail_plugin.models.ir_http.IrHttp"
                   "._auth_method_outlook",
                   new=patched_auth_method_outlook):
            result = self.url_open(
                "/mail_plugin/partner/get",
                data=json.dumps(data).encode(),
                headers={"Content-Type": "application/json"},
            )

        if not result.ok:
            return {}

        return result.json().get("result", {})

    def mock_enrich_and_create_company(self, partner_id):
        """Simulate a HTTP call to /partner/enrich_and_create_company on the given partner. """
        def patched_auth_method_outlook(*args, **kwargs):
            request.update_env(user=self.user_test.id)

        data = {
            "id": 0,
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"partner_id": partner_id},
        }

        with patch("odoo.addons.mail_plugin.models.ir_http.IrHttp"
                   "._auth_method_outlook",
                   new=patched_auth_method_outlook):
            result = self.url_open(
                "/mail_plugin/partner/enrich_and_create_company",
                data=json.dumps(data).encode(),
                headers={"Content-Type": "application/json"},
            )

        if not result.ok:
            return {}

        return result.json().get("result", {})
