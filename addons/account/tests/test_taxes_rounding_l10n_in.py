from odoo.addons.account.tests.common import TestTaxesRoundingCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesRoundingL10nIn(TestTaxesRoundingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.change_company_country(cls.env.company, cls.env.ref('base.in'))

    def test_taxes_cgst_sgst_cess(self):
        tax1 = self.percent_tax(6, include_base_amount=True)
        tax2 = self.percent_tax(6, include_base_amount=True, is_base_affected=False)
        tax3 = self.percent_tax(3)
        taxes = tax1 + tax2 + tax3

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 15.89, 'tax_ids': taxes},
                {'price_unit': 15.89, 'tax_ids': taxes},
            ],
            currency=self.foreign_currency,
            rate=5.0,
        ))
        expected_base_line_tax_details_values_common = {
            'total_excluded_currency': 15.89,
            'total_excluded': 3.18,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': 15.89,
                    'base_amount': 3.18,
                    'tax_amount': 0.19,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': 15.89,
                    'base_amount': 3.18,
                    'tax_amount': 0.19,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount': 3.56,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 18.35,
            'total_included': 3.67,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 0.96,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'tax_amount_currency': 0.96,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                    'base_amount_currency': 17.81,
                    'tax_amount_currency': 0.54,
                    'tax_amount': 0.11,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 18.32,
            'total_included': 3.66,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 0.95,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'tax_amount_currency': 0.95,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                    'base_amount_currency': 17.79,
                    'tax_amount_currency': 0.53,
                    'tax_amount': 0.1,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=31.78,
            expected_tax_amount=4.89,
            expected_total_amount=36.67,
        )

        # Discount 2%
        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -0.63,
            'total_excluded': -0.13,
            'total_included_currency': -0.73,
            'total_included': -0.15,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': -0.64,
                    'base_amount': -0.13,
                    'tax_amount_currency': -0.04,
                    'tax_amount': -0.01,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': -0.64,
                    'base_amount': -0.13,
                    'tax_amount_currency': -0.04,
                    'tax_amount': -0.01,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': -0.72,
                    'base_amount': -0.14,
                    'tax_amount_currency': -0.02,
                    'tax_amount': 0.0,
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
            expected_base_amount=31.15,
            expected_tax_amount=4.79,
            expected_total_amount=35.94,
        )

        # Down Payment 2%
        expected_base_line_tax_details_down_payment = self._reverse_sign(expected_base_line_tax_details_global_discount)
        self.assert_down_payment_tax_amounts(
            document=document,
            amount_type='percent',
            amount=2,
            expected_base_lines_tax_details=[expected_base_line_tax_details_down_payment],
            expected_base_amount=0.63,
            expected_tax_amount=0.1,
            expected_total_amount=0.73,
        )

        # Discount 7%
        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -2.24,
            'total_excluded': -0.44,
            'total_included_currency': -2.57,
            'total_included': -0.51,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': -2.22,
                    'base_amount': -0.44,
                    'tax_amount_currency': -0.13,
                    'tax_amount': -0.03,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': -2.22,
                    'base_amount': -0.44,
                    'tax_amount_currency': -0.13,
                    'tax_amount': -0.03,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': -2.48,
                    'base_amount': -0.5,
                    'tax_amount_currency': -0.07,
                    'tax_amount': -0.01,
                },
            ],
        }
        self.assert_global_discount_tax_amounts(
            document=document,
            amount_type='percent',
            amount=7,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_global_discount,
            ],
            expected_base_amount=29.54,
            expected_tax_amount=4.56,
            expected_total_amount=34.1,
        )

        # Down Payment 7%
        expected_base_line_tax_details_down_payment = self._reverse_sign(expected_base_line_tax_details_global_discount)
        self.assert_down_payment_tax_amounts(
            document=document,
            amount_type='percent',
            amount=7,
            expected_base_lines_tax_details=[expected_base_line_tax_details_down_payment],
            expected_base_amount=2.24,
            expected_tax_amount=0.33,
            expected_total_amount=2.57,
        )

        # Discount 18%
        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -5.73,
            'total_excluded': -1.14,
            'total_included_currency': -6.6,
            'total_included': -1.32,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': -5.72,
                    'base_amount': -1.14,
                    'tax_amount_currency': -0.34,
                    'tax_amount': -0.07,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': -5.72,
                    'base_amount': -1.14,
                    'tax_amount_currency': -0.34,
                    'tax_amount': -0.07,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': -6.4,
                    'base_amount': -1.28,
                    'tax_amount_currency': -0.19,
                    'tax_amount': -0.04,
                },
            ],
        }
        self.assert_global_discount_tax_amounts(
            document=document,
            amount_type='percent',
            amount=18,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_global_discount,
            ],
            expected_base_amount=26.05,
            expected_tax_amount=4.02,
            expected_total_amount=30.07,
        )

        # Down Payment 18%
        expected_base_line_tax_details_down_payment = self._reverse_sign(expected_base_line_tax_details_global_discount)
        self.assert_down_payment_tax_amounts(
            document=document,
            amount_type='percent',
            amount=18,
            expected_base_lines_tax_details=[expected_base_line_tax_details_down_payment],
            expected_base_amount=5.73,
            expected_tax_amount=0.87,
            expected_total_amount=6.6,
        )

        tax1.price_include_override = 'tax_included'
        tax2.price_include_override = 'tax_included'

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 17.79, 'tax_ids': taxes},
                {'price_unit': 17.79, 'tax_ids': taxes},
            ],
            currency=self.foreign_currency,
            rate=5.0,
        ))
        expected_base_line_tax_details_values_common = {
            'total_excluded_currency': 15.88,
            'total_excluded': 3.18,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount': 3.18,
                    'tax_amount': 0.19,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount': 3.18,
                    'tax_amount': 0.19,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': 17.79,
                    'base_amount': 3.56,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_excluded_currency': 15.87,
            'total_included_currency': 18.33,
            'total_included': 3.67,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 15.87,
                    'tax_amount_currency': 0.96,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'base_amount_currency': 15.87,
                    'tax_amount_currency': 0.96,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                    'tax_amount_currency': 0.54,
                    'tax_amount': 0.11,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_excluded_currency': 15.89,
            'total_included_currency': 18.32,
            'total_included': 3.66,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 15.89,
                    'tax_amount_currency': 0.95,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'base_amount_currency': 15.89,
                    'tax_amount_currency': 0.95,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                    'tax_amount_currency': 0.53,
                    'tax_amount': 0.1,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=31.76,
            expected_tax_amount=4.89,
            expected_total_amount=36.65,
        )

        # Discount 2%
        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -0.63,
            'total_excluded': -0.13,
            'total_included_currency': -0.73,
            'total_included': -0.15,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': -0.63,
                    'base_amount': -0.13,
                    'tax_amount_currency': -0.04,
                    'tax_amount': -0.01,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': -0.63,
                    'base_amount': -0.13,
                    'tax_amount_currency': -0.04,
                    'tax_amount': -0.01,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': -0.71,
                    'base_amount': -0.14,
                    'tax_amount_currency': -0.02,
                    'tax_amount': 0.0,
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
            expected_base_amount=31.13,
            expected_tax_amount=4.79,
            expected_total_amount=35.92,
        )

        # Down Payment 2%
        expected_base_line_tax_details_down_payment = self._reverse_sign(expected_base_line_tax_details_global_discount)
        self.assert_down_payment_tax_amounts(
            document=document,
            amount_type='percent',
            amount=2,
            expected_base_lines_tax_details=[expected_base_line_tax_details_down_payment],
            expected_base_amount=0.63,
            expected_tax_amount=0.1,
            expected_total_amount=0.73,
        )

        # Discount 7%
        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -2.24,
            'total_excluded': -0.44,
            'total_included_currency': -2.57,
            'total_included': -0.51,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': -2.23,
                    'base_amount': -0.45,
                    'tax_amount_currency': -0.13,
                    'tax_amount': -0.03,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': -2.23,
                    'base_amount': -0.45,
                    'tax_amount_currency': -0.13,
                    'tax_amount': -0.03,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': -2.49,
                    'base_amount': -0.5,
                    'tax_amount_currency': -0.07,
                    'tax_amount': -0.01,
                },
            ],
        }
        self.assert_global_discount_tax_amounts(
            document=document,
            amount_type='percent',
            amount=7,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_global_discount,
            ],
            expected_base_amount=29.52,
            expected_tax_amount=4.56,
            expected_total_amount=34.08,
        )

        # Down Payment 7%
        expected_base_line_tax_details_down_payment = self._reverse_sign(expected_base_line_tax_details_global_discount)
        self.assert_down_payment_tax_amounts(
            document=document,
            amount_type='percent',
            amount=7,
            expected_base_lines_tax_details=[expected_base_line_tax_details_down_payment],
            expected_base_amount=2.24,
            expected_tax_amount=0.33,
            expected_total_amount=2.57,
        )

        # Discount 18%
        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -5.73,
            'total_excluded': -1.14,
            'total_included_currency': -6.6,
            'total_included': -1.32,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'base_amount_currency': -5.72,
                    'base_amount': -1.14,
                    'tax_amount_currency': -0.34,
                    'tax_amount': -0.07,
                },
                {
                    'tax_id': tax2.id,
                    'base_amount_currency': -5.72,
                    'base_amount': -1.14,
                    'tax_amount_currency': -0.34,
                    'tax_amount': -0.07,
                },
                {
                    'tax_id': tax3.id,
                    'base_amount_currency': -6.4,
                    'base_amount': -1.28,
                    'tax_amount_currency': -0.19,
                    'tax_amount': -0.04,
                },
            ],
        }
        self.assert_global_discount_tax_amounts(
            document=document,
            amount_type='percent',
            amount=18,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_global_discount,
            ],
            expected_base_amount=26.03,
            expected_tax_amount=4.02,
            expected_total_amount=30.05,
        )

        # Down Payment 18%
        expected_base_line_tax_details_down_payment = self._reverse_sign(expected_base_line_tax_details_global_discount)
        self.assert_down_payment_tax_amounts(
            document=document,
            amount_type='percent',
            amount=18,
            expected_base_lines_tax_details=[expected_base_line_tax_details_down_payment],
            expected_base_amount=5.73,
            expected_tax_amount=0.87,
            expected_total_amount=6.6,
        )

        self._run_js_tests()
