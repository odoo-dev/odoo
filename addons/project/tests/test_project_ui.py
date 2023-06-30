# Part of Odoo. See LICENSE file for full copyright and licensing details.

import odoo.tests
import unittest

@odoo.tests.tagged('post_install', '-at_install')
class TestUi(odoo.tests.HttpCase):

    @unittest.skip("tttt")
    def test_01_project_tour(self):
        self.start_tour("/web", 'project_tour', login="admin")
