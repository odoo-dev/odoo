# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import json
import requests

from odoo.tests import patch
from odoo.tests.common import Mock, tagged, new_test_user
from odoo.addons.web_editor.tests.test_controller import TestController


@tagged('-at_install', 'post_install')
class TestUnsplashController(TestController):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.internal_user = new_test_user(cls.env, login='internal_user', groups='base.group_user,base.group_partner_manager')

    def _mocked_save_unsplash_url(self, *args, **kwargs):
        """Mock the external requests to Unsplash"""
        response = Mock()
        response.status_code = 200
        response.content = base64.b64decode(self.pixel)
        return response

    def _add_unsplash_attachment(self, res_model, res_id):
        payload = self._build_payload({
            "res_model": res_model,
            "res_id": res_id,
            "unsplashurls": {
                "image": {
                    "url": "https://images.unsplash.com/arbitrary_image.jpg",
                    "download_url": "https://api.unsplash.com/photos/arbitrary_image/download"
                }
            },
        })
        with patch.object(requests, 'get', self._mocked_save_unsplash_url):
            return self.url_open(
                '/web_unsplash/attachment/add',
                data=json.dumps(payload),
                headers=self.headers,
            ).json()

    def test_internal_user_unsplash_attachment(self):
        self.authenticate(self.internal_user.login, self.internal_user.login)

        # Since the user is in base.group_partner_manager, it should be able to
        # add attachment on res.partner
        response = self._add_unsplash_attachment("res.partner", self.internal_user.partner_id.id)
        self.assertTrue('error' not in response)

        # But it should not be able to add attachment on res.users
        response = self._add_unsplash_attachment("res.users", self.internal_user.id)
        self.assertTrue(response['error']['data']['name'], 'odoo.exceptions.AccessError')

    def test_portal_user_unsplash_attachment(self):
        self.authenticate(self.portal, self.portal)

        # A portal user should not be able to add attachment on an arbitrary
        # record
        response = self._add_unsplash_attachment("res.partner", self.internal_user.partner_id.id)
        self.assertEqual(response['error']['data']['name'], 'odoo.exceptions.AccessError')
