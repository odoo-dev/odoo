# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import HttpCase, tagged
import unittest

@tagged('post_install', '-at_install')
class TestUi(HttpCase):

    @unittest.skip("tttt")
    def test_tour_test_survey_form_triggers(self):
        self.start_tour('/web', 'survey_tour_test_survey_form_triggers', login='admin')
