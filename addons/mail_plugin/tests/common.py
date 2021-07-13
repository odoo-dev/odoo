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

    def mock_plugin_partner_get(self, name, email, patched_iap_enrich):
        """Simulate a HTTP call to /partner/get with the given email and name.

        The authentication process is patched to allow all queries.
        The third argument "patched_iap_enrich" allow you to mock the IAP request and
        to return the response you want.
        """
        def patched_auth_method_outlook(*args, **kwargs):
            request.uid = self.user_test.id

        data = {
            "id": 0,
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"email": email, "name": name},
        }

        with patch(
            "odoo.addons.mail_plugin.models.ir_http.IrHttp"
            "._auth_method_outlook",
            new=patched_auth_method_outlook,
        ), patch(
            "odoo.addons.mail_plugin.controllers.mail_plugin.MailPluginController"
            "._iap_enrich",
            new=patched_iap_enrich,
        ):
            result = self.url_open(
                "/mail_plugin/partner/get",
                data=json.dumps(data).encode(),
                headers={"Content-Type": "application/json"},
            )

        if not result.ok:
            return {}

        return result.json().get("result", {})

    def mock_enrich_and_create_company(self, partner_id, patched_iap_enrich):
        """Simulate a HTTP call to /partner/enrich_and_create_company on the given partner.

        The third argument "patched_iap_enrich" allow you to mock the IAP request and
        to return the response you want.
        """
        def patched_auth_method_outlook(*args, **kwargs):
            request.uid = self.user_test.id

        data = {
            "id": 0,
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"partner_id": partner_id},
        }

        with patch(
            "odoo.addons.mail_plugin.models.ir_http.IrHttp"
            "._auth_method_outlook",
            new=patched_auth_method_outlook,
        ), patch(
            "odoo.addons.mail_plugin.controllers.mail_plugin.MailPluginController"
            "._iap_enrich",
            new=patched_iap_enrich,
        ):
            result = self.url_open(
                "/mail_plugin/partner/enrich_and_create_company",
                data=json.dumps(data).encode(),
                headers={"Content-Type": "application/json"},
            )

        if not result.ok:
            return {}

        return result.json().get("result", {})
