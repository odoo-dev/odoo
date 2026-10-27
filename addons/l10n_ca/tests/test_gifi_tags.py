from odoo.exceptions import ValidationError
from odoo.tests import tagged

from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install', '-at_install', 'post_install_l10n')
class TestGifiTags(AccountTestInvoicingCommon):

    _test_user_groups = ('account.group_account_manager',)  # mapping the accounts to the GIFI tags

    @classmethod
    @AccountTestInvoicingCommon.setup_country('ca')
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.company_data['company']
        cls.gifi_1001 = cls.env.ref('l10n_ca.account_tag_gifi_1001')
        cls.gifi_1060 = cls.env.ref('l10n_ca.account_tag_gifi_1060')
        cls.other_company = cls.env['res.company'].create({'name': "Other company"})
        cls._test_user.company_ids += cls.other_company

    def test_gifi_code(self):
        """ The GIFI tags are the ones of the chart template, whatever their name. """
        Tag = self.env['account.account.tag']
        user_tag = Tag.create({'name': "1001 - Petty cash", 'applicability': 'accounts', 'country_id': self.env.ref('base.ca').id})
        self.gifi_1001.name = "Cash"
        tags = self.gifi_1001 + user_tag
        self.assertEqual(tags.mapped('l10n_ca_gifi_code'), ['1001', False])
        # The totals are computed from the other items, accounts can't be reported under them
        self.assertFalse(self.env.ref('l10n_ca.account_tag_gifi_2599', raise_if_not_found=False))

        # Same result when computed in SQL
        self.assertEqual(Tag.search([('id', 'in', tags.ids), ('l10n_ca_gifi_code', '!=', False)]), self.gifi_1001)
        self.assertEqual(Tag.search([('l10n_ca_gifi_code', '=', '1001')]), self.gifi_1001)

    def test_template_accounts_gifi_tag(self):
        ChartTemplate = self.env['account.chart.template']
        accounts = self.env['account.account'].union(
            ChartTemplate.ref(xmlid)
            for xmlid in ChartTemplate._get_chart_template_data('ca_2023')['account.account']
        )
        self.assertTrue(accounts)
        self.assertFalse(accounts.filtered(lambda account: len(account.tag_ids.filtered('l10n_ca_gifi_code')) != 1))

        cash_account = self.env['account.chart.template'].ref('l10n_ca_cash')
        self.assertEqual(cash_account.tag_ids.filtered('l10n_ca_gifi_code'), self.gifi_1001)

    def test_at_most_one_gifi_tag(self):
        other_tag = self.env['account.account.tag'].create({'name': "Not a GIFI tag", 'applicability': 'accounts'})
        account_vals = {'name': "Test", 'code': '101099', 'account_type': 'asset_current'}

        account = self.env['account.account'].create(account_vals)
        account.tag_ids = self.gifi_1001 + other_tag

        with self.assertRaises(ValidationError):
            account.tag_ids += self.gifi_1060
        with self.assertRaises(ValidationError):
            self.env['account.account'].create({**account_vals, 'code': '101098', 'tag_ids': self.gifi_1001 + self.gifi_1060})

        # Not enforced outside of the Canadian chart of accounts
        self.env['account.account'].with_company(self.other_company).create({
            **account_vals,
            'company_ids': self.other_company,
            'tag_ids': self.gifi_1001 + self.gifi_1060,
        })
