from odoo.addons.account.tests.common import TestTaxesRoundingCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesRoundingPerLine(TestTaxesRoundingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.company.tax_rounding_policy = 'line'

    def test_taxes_price_excluded(self):
        tax_21 = self.percent_tax(21)

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 16.794, 'tax_ids': tax_21},
                {'price_unit': 16.794, 'tax_ids': tax_21},
            ],
            currency=self.foreign_currency,
            rate=2,
        ))
        expected_base_line_tax_details_values = {
            'total_excluded_currency': 16.79,
            'total_excluded': 8.4,
            'total_included_currency': 20.32,
            'total_included': 10.17,
            'taxes_data': [
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': 16.79,
                    'base_amount': 8.4,
                    'tax_amount_currency': 3.53,
                    'tax_amount': 1.77,
                }
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values, expected_base_line_tax_details_values],
            expected_base_amount=33.58,
            expected_tax_amount=7.06,
            expected_total_amount=40.64,
        )

        self._run_js_tests()

    def test_taxes_price_included(self):
        tax_21 = self.percent_tax(21, price_include_override='tax_included')

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 20.321, 'tax_ids': tax_21},
                {'price_unit': 20.321, 'tax_ids': tax_21},
            ],
            currency=self.foreign_currency,
            rate=2,
        ))
        expected_base_line_tax_details_values = {
            'total_excluded_currency': 16.79,
            'total_excluded': 8.4,
            'total_included_currency': 20.32,
            'total_included': 10.17,
            'taxes_data': [
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': 16.79,
                    'base_amount': 8.40,
                    'tax_amount_currency': 3.53,
                    'tax_amount': 1.77,
                }
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values, expected_base_line_tax_details_values],
            expected_base_amount=33.58,
            expected_tax_amount=7.06,
            expected_total_amount=40.64,
        )

        self._run_js_tests()
