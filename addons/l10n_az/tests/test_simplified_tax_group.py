from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestAzSimplifiedTaxGroup(AccountTestInvoicingCommon):
    chart_template = 'az'
    country_code = 'AZ'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.chart = cls.env['account.chart.template'].with_company(cls.env.company)

    def test_simplified_tax_receivable_account(self):
        account = self.chart.ref('az_account_24140')
        self.assertEqual(account.with_company(self.env.company).code, '24140')
        self.assertEqual(account.account_type, 'asset_receivable')
        self.assertTrue(account.non_trade)
        self.assertTrue(account.reconcile)
        self.assertEqual(account.parent_id, self.chart.ref('az_account_241'))

    def test_simplified_tax_group_is_closable(self):
        """ _compute_tax_closing_entry skips any tax group missing either account. """
        group = self.chart.ref('az_tax_group_simplified')
        self.assertEqual(group.tax_payable_account_id, self.chart.ref('az_account_52165'))
        self.assertEqual(group.tax_receivable_account_id, self.chart.ref('az_account_24140'))
