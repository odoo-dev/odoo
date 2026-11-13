from odoo.addons.account.tests.common import TestTaxesRoundingCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesRoundingL10nBr(TestTaxesRoundingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.change_company_country(cls.env.company, cls.env.ref('base.br'))

    def test_5_division_taxes(self):
        tax1 = self.division_tax(5)
        tax2 = self.division_tax(3)
        tax3 = self.division_tax(0.65)
        tax4 = self.division_tax(9)
        tax5 = self.division_tax(15)
        taxes = tax1 + tax2 + tax3 + tax4 + tax5

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 32.33, 'tax_ids': taxes},
                {'price_unit': 32.33, 'tax_ids': taxes},
            ],
            currency=self.foreign_currency,
            rate=3.0,
        ))
        expected_base_line_tax_details_values_common = {
            'total_excluded_currency': 32.33,
            'total_excluded': 10.78,
            'total_included_currency': 48.0,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': 32.33,
                    'base_amount': 10.78,
                    'tax_amount_currency': 2.4,
                    'tax_amount': 0.8,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': 32.33,
                    'base_amount': 10.78,
                    'tax_amount_currency': 1.44,
                    'tax_amount': 0.48,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': 32.33,
                    'base_amount': 10.78,
                    'tax_amount_currency': 0.31,
                },
                {
                    'tax_id': tax4.id,
                    'base_amount_currency': 32.33,
                    'base_amount': 10.78,
                    'tax_amount_currency': 4.32,
                    'tax_amount': 1.44,
                },
                {
                    'tax_id': tax5.id,
                    'base_amount_currency': 32.33,
                    'base_amount': 10.78,
                    'tax_amount_currency': 7.2,
                    'tax_amount': 2.4,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_included': 16.01,
            'taxes_data': [
                expected_base_line_tax_details_values_common['taxes_data'][0],
                expected_base_line_tax_details_values_common['taxes_data'][1],
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                    'tax_amount': 0.11,
                },
                expected_base_line_tax_details_values_common['taxes_data'][3],
                expected_base_line_tax_details_values_common['taxes_data'][4],
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_included': 16.0,
            'taxes_data': [
                expected_base_line_tax_details_values_common['taxes_data'][0],
                expected_base_line_tax_details_values_common['taxes_data'][1],
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                    'tax_amount': 0.1,
                },
                expected_base_line_tax_details_values_common['taxes_data'][3],
                expected_base_line_tax_details_values_common['taxes_data'][4],
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=64.66,
            expected_tax_amount=31.34,
            expected_total_amount=96.0,
        )

        # Discount 2%
        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -1.29,
            'total_excluded': -0.43,
            'total_included_currency': -1.92,
            'total_included': -0.64,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': -1.29,
                    'base_amount': -0.43,
                    'tax_amount_currency': -0.1,
                    'tax_amount': -0.03,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': -1.29,
                    'base_amount': -0.43,
                    'tax_amount_currency': -0.06,
                    'tax_amount': -0.02,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': -1.29,
                    'base_amount': -0.43,
                    'tax_amount_currency': -0.01,
                    'tax_amount': 0.0,
                },
                {
                    'tax_id': tax4.id,
                    'base_amount_currency': -1.29,
                    'base_amount': -0.43,
                    'tax_amount_currency': -0.17,
                    'tax_amount': -0.06,
                },
                {
                    'tax_id': tax5.id,
                    'base_amount_currency': -1.29,
                    'base_amount': -0.43,
                    'tax_amount_currency': -0.29,
                    'tax_amount': -0.1,
                },
            ],
        }
        self.assert_global_discount_tax_amounts(
            document=document,
            amount_type='percent',
            amount=2,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_global_discount,
            ],
            expected_base_amount=63.37,
            expected_tax_amount=30.71,
            expected_total_amount=94.08,
        )

        # Down Payment 2%
        expected_base_line_tax_details_down_payment = self._reverse_sign(expected_base_line_tax_details_global_discount)
        self.assert_down_payment_tax_amounts(
            document=document,
            amount_type='percent',
            amount=2,
            expected_base_lines_tax_details=[expected_base_line_tax_details_down_payment],
            expected_base_amount=1.29,
            expected_tax_amount=0.63,
            expected_total_amount=1.92,
        )

        taxes.price_include_override = 'tax_included'

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 48.0, 'tax_ids': taxes},
                {'price_unit': 48.0, 'tax_ids': taxes},
            ],
            currency=self.foreign_currency,
            rate=3.0,
        ))
        expected_base_line_tax_details_values_common = {
            'total_excluded_currency': 32.33,
            'total_excluded': 10.78,
            'total_included_currency': 48.0,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': 32.33,
                    'base_amount': 10.78,
                    'tax_amount_currency': 2.4,
                    'tax_amount': 0.8,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': 32.33,
                    'base_amount': 10.78,
                    'tax_amount_currency': 1.44,
                    'tax_amount': 0.48,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': 32.33,
                    'base_amount': 10.78,
                    'tax_amount_currency': 0.31,
                },
                {
                    'tax_id': tax4.id,
                    'base_amount_currency': 32.33,
                    'base_amount': 10.78,
                    'tax_amount_currency': 4.32,
                    'tax_amount': 1.44,
                },
                {
                    'tax_id': tax5.id,
                    'base_amount_currency': 32.33,
                    'base_amount': 10.78,
                    'tax_amount_currency': 7.2,
                    'tax_amount': 2.4,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_included': 16.01,
            'taxes_data': [
                expected_base_line_tax_details_values_common['taxes_data'][0],
                expected_base_line_tax_details_values_common['taxes_data'][1],
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                    'tax_amount': 0.11,
                },
                expected_base_line_tax_details_values_common['taxes_data'][3],
                expected_base_line_tax_details_values_common['taxes_data'][4],
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_included': 16.0,
            'taxes_data': [
                expected_base_line_tax_details_values_common['taxes_data'][0],
                expected_base_line_tax_details_values_common['taxes_data'][1],
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                    'tax_amount': 0.1,
                },
                expected_base_line_tax_details_values_common['taxes_data'][3],
                expected_base_line_tax_details_values_common['taxes_data'][4],
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=64.66,
            expected_tax_amount=31.34,
            expected_total_amount=96.0,
        )

        # Discount 2%
        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -1.29,
            'total_excluded': -0.43,
            'total_included_currency': -1.92,
            'total_included': -0.64,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': -1.29,
                    'base_amount': -0.43,
                    'tax_amount_currency': -0.1,
                    'tax_amount': -0.03,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': -1.29,
                    'base_amount': -0.43,
                    'tax_amount_currency': -0.06,
                    'tax_amount': -0.02,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': -1.29,
                    'base_amount': -0.43,
                    'tax_amount_currency': -0.01,
                    'tax_amount': 0.0,
                },
                {
                    'tax_id': tax4.id,
                    'base_amount_currency': -1.29,
                    'base_amount': -0.43,
                    'tax_amount_currency': -0.17,
                    'tax_amount': -0.06,
                },
                {
                    'tax_id': tax5.id,
                    'base_amount_currency': -1.29,
                    'base_amount': -0.43,
                    'tax_amount_currency': -0.29,
                    'tax_amount': -0.1,
                },
            ],
        }
        self.assert_global_discount_tax_amounts(
            document=document,
            amount_type='percent',
            amount=2,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_global_discount,
            ],
            expected_base_amount=63.37,
            expected_tax_amount=30.71,
            expected_total_amount=94.08,
        )

        self._run_js_tests()
