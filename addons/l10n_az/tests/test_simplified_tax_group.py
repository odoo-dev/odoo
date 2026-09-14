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

    def test_withholding_tax_groups_are_closable(self):
        """ Every withholding tax group needs both accounts to take part in a tax closing. """
        payable_account = self.chart.ref('az_account_52190')
        receivable_account = self.chart.ref('az_account_24130')
        for xml_id in (
            'az_tax_group_wht_ins_4',
            'az_tax_group_wht_div_5',
            'az_tax_group_wht_tel_6',
            'az_tax_group_wht_int_10',
            'az_tax_group_wht_low_10',
            'az_tax_group_wht_rent_14',
            'az_tax_group_wht_roy_14',
            'az_tax_group_wht_oth_10',
        ):
            with self.subTest(tax_group=xml_id):
                group = self.chart.ref(xml_id)
                self.assertEqual(group.tax_payable_account_id, payable_account)
                self.assertEqual(group.tax_receivable_account_id, receivable_account)
