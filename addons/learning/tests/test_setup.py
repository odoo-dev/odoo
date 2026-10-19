from odoo.exceptions import UserError
from odoo.tests import tagged

from odoo.addons.base.tests.common import BaseCommon


@tagged('post_install', '-at_install')
class TestSetup(BaseCommon):

    def test_copy_card_setup_is_idempotent(self):
        Setup = self.env['learning.setup']
        location = Setup.run('copy_card', 'start')
        card = self.env['learning.practice.card'].search([])
        self.assertEqual(len(card), 1)
        # opened from its list, so the breadcrumb leads back to it
        self.assertEqual(location, {'type': 'ir.actions.act_url', 'url': f'/odoo/practice-cards/{card.id}', 'target': 'self'})
        self.assertEqual(Setup.run('copy_card', 'start'), location)
        self.assertEqual(self.env['learning.practice.card'].search_count([]), 1)

    def test_copy_card_setup_skips_copies(self):
        card = self.env['learning.practice.card'].create({'name': "Original"})
        copy = card.copy()
        self.assertEqual(copy.name, "Original (copy)")
        card.unlink()
        location = self.env['learning.setup'].run('copy_card', 'start')
        self.assertFalse(location['url'].endswith(f'/{copy.id}'))

    def test_unknown_checkpoint(self):
        with self.assertRaises(UserError):
            self.env['learning.setup'].run('first_card', 'nowhere')
