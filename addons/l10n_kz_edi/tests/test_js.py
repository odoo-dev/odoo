# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""Runs the module's Hoot suite.

The NCALayer handshake is pure browser code, so its regressions are invisible to
the Python tests: this drives the real suite in a headless browser instead.
"""
from odoo.addons.web.tests.test_js import unit_test_error_checker
from odoo.tests import HttpCase, no_retry, tagged


@tagged('post_install', '-at_install', 'l10n_kz_edi')
class TestL10nKzEdiJs(HttpCase):

    @no_retry
    def test_ncalayer_suite(self):
        self.browser_js(
            '/web/tests?headless&loglevel=2&preset=desktop&timeout=15000'
            '&filter=l10n_kz_edi',
            "", "", login='admin', timeout=600,
            success_signal="[HOOT] Test suite succeeded",
            error_checker=unit_test_error_checker,
        )
