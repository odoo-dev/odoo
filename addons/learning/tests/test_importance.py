from odoo.tests import tagged

from odoo.addons.base.tests.common import BaseCommon


@tagged('post_install', '-at_install')
class TestImportance(BaseCommon):

    def test_practice_card_profile(self):
        profile = self.env['learning.importance'].get_focus_profile('learning.practice.card')
        # the record name is always important
        self.assertGreaterEqual(profile['name'], 100)
        # searched, filtered, grouped by or shown in the list
        for field_name in ('date', 'kind', 'done'):
            self.assertIn(field_name, profile)
        self.assertGreater(profile['kind'], profile['date'], "grouped by and listed beats only listed")
        # never important for a beginner
        self.assertNotIn('active', profile)
        self.assertNotIn('image', profile)

    def test_overrides(self):
        self.env['learning.focus.override'].create([
            {'model': 'learning.practice.card', 'field_name': 'image', 'focus': 'in'},
            {'model': 'learning.practice.card', 'field_name': 'done', 'focus': 'out'},
        ])
        profile = self.env['learning.importance'].get_focus_profile('learning.practice.card')
        self.assertGreaterEqual(profile['image'], 100)
        self.assertNotIn('done', profile)
