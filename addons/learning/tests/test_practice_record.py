from odoo.exceptions import UserError
from odoo.tests import tagged

from odoo.addons.base.tests.common import BaseCommon
from odoo.addons.learning import uninstall_hook


@tagged('post_install', '-at_install')
class TestPracticeRecord(BaseCommon):

    def test_register_is_idempotent(self):
        partner = self.env['res.partner'].create({'name': "Practice customer"})
        Practice = self.env['learning.practice.record']
        Practice.register('res.partner', partner.ids)
        Practice.register('res.partner', partner.ids)
        self.assertEqual(Practice.get_practice_ids('res.partner'), partner.ids)

    def test_register_recent_only_takes_the_users_new_records(self):
        since = self.env.cr.now()
        partner = self.env['res.partner'].create({'name': "Created during the lesson"})
        self.env['learning.practice.record'].register_recent('res.partner', since)
        self.assertIn(partner.id, self.env['learning.practice.record'].get_practice_ids('res.partner'))
        self.assertNotIn(self.env.user.partner_id.id, self.env['learning.practice.record'].get_practice_ids('res.partner'))

    def test_cleanup_deletes_dependents_first(self):
        # the company is registered first, but its contact must be deleted
        # before it: cleanup retries in later rounds
        company = self.env['res.partner'].create({'name': "Practice company", 'is_company': True})
        person = self.env['res.partner'].create({'name': "Practice person", 'parent_id': company.id})
        card = self.env['learning.practice.card'].create({'name': "My card"})
        self.env['learning.practice.record'].register('res.partner', (company + person).ids)
        self.assertEqual(self.env['learning.practice.record'].cleanup(), 3)
        self.assertFalse((company + person).exists())
        self.assertFalse(card.exists())
        self.assertFalse(self.env['learning.practice.record'].search([]))

    def test_cleanup_archives_what_cannot_be_deleted(self):
        partner = self.env['res.partner'].create({'name': "Still in use"})
        self.env['learning.practice.record'].register('res.partner', partner.ids)

        def unlink(records):
            raise UserError("This record is used elsewhere.")

        self.patch(self.env.registry['res.partner'], 'unlink', unlink)
        self.env['learning.practice.record'].cleanup()
        self.assertTrue(partner.exists())
        self.assertFalse(partner.active)

    def test_uninstall_hook_removes_every_users_practice_records(self):
        other_user = self.env['res.users'].create({'name': "Other learner", 'login': 'other_learner'})
        mine = self.env['res.partner'].create({'name': "Mine"})
        theirs = self.env['res.partner'].with_user(other_user).sudo().create({'name': "Theirs"})
        self.env['learning.practice.record'].register('res.partner', mine.ids)
        self.env['learning.practice.record'].with_user(other_user).sudo().create({
            'res_model': 'res.partner', 'res_id': theirs.id, 'user_id': other_user.id,
        })
        uninstall_hook(self.env)
        self.assertFalse((mine + theirs).exists())
