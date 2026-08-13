from odoo.tests import tagged
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nEsRebuTax(AccountTestInvoicingCommon):

    @classmethod
    @AccountTestInvoicingCommon.setup_country('es')
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.company_data['company']

        cls.rebu_tax = cls.env['account.tax'].search([
            ('l10n_es_is_rebu_tax', '=', True),
            ('company_id', '=', cls.company.id)
        ], limit=1)

        cls.rebu_tax.write({'amount': 21.0})

    def test_rebu_tax_exists_after_localization(self):
        """ This module has to create a tax called rebu tax"""
        self.assertTrue(
            self.rebu_tax,
            "We couldn't find any tax with l10n_es_is_rebu_tax=True"
        )

    def _get_rebu_base_line(self, price_unit, purchase_price, quantity=1.0, discount=0.0):
        AccountTax = self.env['account.tax']
        base_line = AccountTax._prepare_base_line_for_taxes_computation(
            None,
            tax_ids=self.rebu_tax,
            price_unit=price_unit,
            quantity=quantity,
            discount=discount,
            currency_id=self.company.currency_id,
        )
        base_line['purchase_price'] = purchase_price
        AccountTax._add_tax_details_in_base_line(base_line, self.company)
        return base_line

    def test_rebu_tax_from_margin(self):
        """
        Sale 20, Purchase 15 -> margin = 5
        TAX: 5 - 5/1,21 = 0.8678,
        Base: 5/1,21 = 4.1322
        """

        base_line = self._get_rebu_base_line(price_unit=20.0, purchase_price=15.0)
        tax_data = base_line['tax_details']['taxes_data'][0]

        self.assertAlmostEqual(tax_data['tax_amount'], 0.8678, places=2)
        self.assertAlmostEqual(tax_data['base_amount'], 4.1322, places=2)
        self.assertAlmostEqual(
            base_line['tax_details']['raw_total_included_currency'], 20.0, places=2
        )
