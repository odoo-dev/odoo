import json

from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlparse

from odoo.http import Controller, route, request
from odoo.tests import HttpCase, MockHTTPClient, tagged
from odoo.tools.misc import mute_logger


@tagged("post_install", "-at_install")
class TestAuthOauth(HttpCase):
    def test_oauth_odoo_com(self):
        """Test the 'Sign in with Odoo.com' to sign up and sign in works as expected

        Run a browser tour to ensure the user authentication using 'Sign in with Odoo.com'.
        To avoid doing requests to the actual OAuth provider endpoint, odoo.com routes are mocked.
        """

        base_url = self.base_url()
        access_token_valid_portal = "a_valid_token_for_portal"
        access_token_valid_admin = "a_valid_token_for_admin"
        access_token_invalid = "am_invalid_token"
        hit_oauth2_auth = 0
        hit_tokens = {
            1: access_token_valid_portal,
            2: access_token_valid_portal,
            3: access_token_invalid,
            4: access_token_valid_admin,
            5: access_token_valid_admin,
        }

        # Mock the route of the OAuth provider the browser is redirected to during the Sign in with Odoo.com
        # To not redirect the browser to the actual odoo.com/oauth2/auth
        class MockOAuthProviderController(Controller):
            @route("/mock/oauth2/auth", type="http", auth="public", sitemap=False)
            def oauth2_auth(self, **kwargs):
                nonlocal hit_oauth2_auth
                hit_oauth2_auth += 1
                # Give:
                # - a valid token at the first hit, during signup in the tour,
                # - a valid token at the second hit during signin in the tour,
                # - an invalid token at the third hit, during an invalid signin in the tour.
                query = urlencode({
                    "state": kwargs.get("state", {}),
                    "access_token": hit_tokens.get(hit_oauth2_auth, access_token_valid_admin)
                })
                return request.redirect(f"{base_url}/auth_oauth/signin?{query}")  # nosemgrep: rules.requests-in-models

        self.env.registry.clear_cache("routing")
        self.addCleanup(self.env.registry.clear_cache, "routing")

        provider = self.env.ref("auth_oauth.provider_openerp")
        provider.auth_endpoint = f"{base_url}/mock/oauth2/auth"

        # Mock the validation route of the OAuth provider to which a server-to-server request is done
        # to validate the access token received in response to the above `/oauth2/auth` route call.
        def validation_endpoint(req):
            access_token = parse_qs(urlparse(req.path_url).query).get("access_token")[0]
            return json.dumps({
                access_token_valid_portal: {"user_id": "foo", "name": "Foo Bar", "email": "foo@bar.xyz"},
                access_token_valid_admin: {"user_id": "admin", "name": "Admin", "email": "admin@bar.xyz"},
            }.get(access_token, {"error": "invalid_token"}))

        # Enable free sign up
        self.env["res.config.settings"].create({"auth_signup_uninvited": "b2c"}).execute()

        # Note the number of res.users.log before signing in in the tour
        before_user_log_count = self.env["res.users.log"].search_count([])

        with (
            MockHTTPClient(url=provider.validation_endpoint, return_body=validation_endpoint),
            mute_logger("odoo.addons.auth_oauth.controllers.main"),
            # To have predictable reset password link and test the reset password with OAuth in the tour
            patch.object(
                self.env.registry['res.partner'],
                '_get_partner_from_token',
                lambda self, token: self.env.ref("base.partner_admin")
            ),
        ):
            self.start_tour("/", "auth_oauth.odoo_com")

        # Ensure signing in with OAuth correctly records user logins
        # During the tour, 2 successful sign in occur
        self.assertEqual(self.env["res.users.log"].search_count([]) - before_user_log_count, 4)
