from odoo.tests import tagged

from odoo.addons.base.tests.common import BaseCommon


@tagged('post_install', '-at_install')
class TestProgress(BaseCommon):

    def test_lesson_progress(self):
        Progress = self.env['learning.progress']
        Progress.checkpoint('first_card', 'start')
        self.assertEqual(Progress.get_state(), {'done': [], 'running': {'first_card': 'start'}})
        Progress.complete('first_card')
        self.assertEqual(Progress.get_state(), {'done': ['first_card'], 'running': {}})
        # replaying a finished lesson keeps it done
        Progress.checkpoint('first_card', 'start')
        self.assertEqual(Progress.get_state()['done'], ['first_card'])

    def test_switch_learning_mode_toggles_the_menu_group(self):
        user = self._test_user
        group = self.env.ref('learning.group_learning_mode')
        self.env['res.users'].with_user(user).switch_learning_mode(True)
        self.assertTrue(user.learning_mode)
        self.assertFalse(user.learning_offer_pending)
        self.assertIn(group, user.group_ids)
        self.env['res.users'].with_user(user).switch_learning_mode(False)
        self.assertNotIn(group, user.group_ids)
