from odoo.exceptions import AccessError
from odoo.tests import TransactionCase, new_test_user, tagged


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nPkOnboarding(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env['res.company'].create({
            'name': 'PK Onboarding Co',
            'country_id': cls.env.ref('base.pk').id,
        })
        cls.company.account_fiscal_country_id = cls.env.ref('base.pk')
        cls.journal = cls.env['account.journal'].create({
            'name': 'PK Sales',
            'code': 'PKSAL',
            'type': 'sale',
            'company_id': cls.company.id,
        })
        cls.activate_action = cls.env.ref('l10n_pk.action_l10n_pk_edi_activate')

    def test_onboarding_action(self):
        """The dashboard link activates e-invoicing while it is missing, then opens its settings."""
        action_data = self.journal._get_onboarding_action_data()
        if self.env['ir.module.module']._get('l10n_pk_edi').state == 'installed':
            self.assertEqual(action_data['title'], "E-Invoicing Settings")
            self.assertEqual(action_data['action']['id'], self.env.ref('account.action_account_config').id)
        else:
            self.assertEqual(action_data['title'], "Activate E-Invoicing")
            self.assertEqual(action_data['action']['type'], 'ir.actions.server')
            self.assertEqual(action_data['action']['id'], self.activate_action.id)

    def test_onboarding_action_untouched_outside_pakistan(self):
        self.journal.company_id.account_fiscal_country_id = self.env.ref('base.be')
        self.assertNotEqual(
            self.journal._get_onboarding_action_data()['action'].get('id'),
            self.activate_action.id,
        )

    def test_activate_action_is_reserved_to_settings_admins(self):
        """A billing user must not be able to install a module from the dashboard."""
        billing_user = new_test_user(self.env, login='pk_billing', groups='account.group_account_invoice')
        with self.assertRaises(AccessError):
            self.activate_action.with_user(billing_user).run()
