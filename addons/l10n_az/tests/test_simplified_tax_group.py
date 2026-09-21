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
        """ l10n_az_reports points the Simplified Tax return's receivable account here,
        and account.return.type restricts it to non-trade receivables. """
        account = self.chart.ref('az_account_24140')
        self.assertEqual(account.with_company(self.env.company).code, '24140')
        self.assertEqual(account.account_type, 'asset_receivable')
        self.assertTrue(account.non_trade)
        self.assertTrue(account.reconcile)
        self.assertEqual(account.parent_id, self.chart.ref('az_account_241'))

    def test_simplified_tax_payable_account(self):
        """ Same contract for the payable side: non-trade payable. """
        account = self.chart.ref('az_account_52165')
        self.assertEqual(account.with_company(self.env.company).code, '52165')
        self.assertEqual(account.account_type, 'liability_payable')
        self.assertTrue(account.non_trade)
