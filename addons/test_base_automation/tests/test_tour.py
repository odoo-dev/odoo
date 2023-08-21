# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import HttpCase, tagged


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestUi(HttpCase):

    def test_01_base_automation_tour(self):
        # self.start_tour("/web?debug=tests", "test_base_automation", login="admin")  # TODO
        pass
