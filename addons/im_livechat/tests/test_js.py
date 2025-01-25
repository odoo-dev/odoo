from odoo.tests import HttpCase, tagged
from odoo.addons.web.tests.test_js import unit_test_error_checker


@tagged("post_install", "-at_install")
class ExternalTestSuite(HttpCase):
    def test_external_livechat(self):
        # webclient external test suite
        self.browser_js(
            "/web/tests/livechat?headless&loglevel=2&preset=desktop",
            "",
            "",
            login='admin',
            timeout=1800,
            success_signal="[HOOT] test suite succeeded",
            error_checker=unit_test_error_checker,
        )
