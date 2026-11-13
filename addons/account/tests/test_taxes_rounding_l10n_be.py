from odoo.addons.account.tests.common import TestTaxesRoundingCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesRoundingL10nBe(TestTaxesRoundingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.change_company_country(cls.env.company, cls.env.ref('base.be'))

    def test_recupel_plus_21(self):
        tax_recu = self.fixed_tax(0.375, include_base_amount=True)
        tax_21 = self.percent_tax(21)
        taxes = tax_recu + tax_21

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 15.794, 'tax_ids': taxes},
                {'price_unit': 15.794, 'tax_ids': taxes},
            ],
            currency=self.foreign_currency,
            rate=2,
        ))
        expected_base_line_tax_details_values_common = {
            'total_excluded_currency': 15.79,
            'total_excluded': 7.9,
            'total_included': 9.79,
            'taxes_data': [
                {
                    'tax_id': tax_recu.id,
                    'base_amount_currency': 15.79,
                    'base_amount': 7.9,
                    'tax_amount': 0.19,
                },
                {
                    'tax_id': tax_21.id,
                    'base_amount': 8.08,
                    'tax_amount': 1.7,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 19.57,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 0.38,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'base_amount_currency': 16.17,
                    'tax_amount_currency': 3.4,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 19.55,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 0.37,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'base_amount_currency': 16.16,
                    'tax_amount_currency': 3.39,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=31.58,
            expected_tax_amount=7.54,
            expected_total_amount=39.12,
        )

        # Discount 2%
        # The total of the document will be 39.12.
        # Since the discount is not applied on the fixed tax:
        # The 21% tax is applied on 31.58 + 0.75, allocated as
        # 6.63 for 31.58 and 0.16 for 0.75
        # So the global discount will be based on 31.58 + 6.63 = 38.21
        # 38.21 * 0.02 ~= 0.76
        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -0.63,
            'total_excluded': -0.31,
            'total_included_currency': -0.76,
            'total_included': -0.38,
            'taxes_data': [
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': -0.63,
                    'base_amount': -0.32,
                    'tax_amount_currency': -0.13,
                    'tax_amount': -0.07,
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
            expected_base_amount=30.95,
            expected_tax_amount=7.41,
            expected_total_amount=38.36,
        )

        # Down Payment 2%
        expected_base_line_tax_details_down_payment = self._reverse_sign(expected_base_line_tax_details_global_discount)
        self.assert_down_payment_tax_amounts(
            document=document,
            amount_type='percent',
            amount=2,
            expected_base_lines_tax_details=[expected_base_line_tax_details_down_payment],
            expected_base_amount=0.63,
            expected_tax_amount=0.13,
            expected_total_amount=0.76,
        )

        taxes.price_include_override = 'tax_included'

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 19.564, 'tax_ids': taxes},
                {'price_unit': 19.564, 'tax_ids': taxes},
            ],
            currency=self.foreign_currency,
            rate=2,
        ))
        expected_base_line_tax_details_values_common = {
            'total_excluded_currency': 15.79,
            'total_excluded': 7.9,
            'total_included': 9.79,
            'taxes_data': [
                {
                    'tax_id': tax_recu.id,
                    'base_amount': 7.9,
                    'tax_amount': 0.19,
                },
                {
                    'tax_id': tax_21.id,
                    'base_amount': 8.08,
                    'tax_amount': 1.7,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 19.56,
            'total_excluded_currency': 15.78,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 15.78,
                    'tax_amount_currency': 0.38,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'base_amount_currency': 16.16,
                    'tax_amount_currency': 3.4,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 19.56,
            'total_excluded_currency': 15.8,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 15.80,
                    'tax_amount_currency': 0.37,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'base_amount_currency': 16.17,
                    'tax_amount_currency': 3.39,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=31.58,
            expected_tax_amount=7.54,
            expected_total_amount=39.12,
        )

        # Discount 2%
        # The total of the document will be 39.12.
        # Since the discount is not applied on the fixed tax:
        # The 21% tax is applied on 31.58 + 0.75, allocated as
        # 6.63 for 31.58 and 0.16 for 0.75
        # So the global discount will be based on 31.58 + 6.63 = 38.21
        # 38.21 * 0.02 ~= 0.76
        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -0.63,
            'total_excluded': -0.31,
            'total_included_currency': -0.76,
            'total_included': -0.38,
            'taxes_data': [
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': -0.63,
                    'base_amount': -0.32,
                    'tax_amount_currency': -0.13,
                    'tax_amount': -0.07,
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
            expected_base_amount=30.95,
            expected_tax_amount=7.41,
            expected_total_amount=38.36,
        )

        # Down Payment 2%
        expected_base_line_tax_details_down_payment = self._reverse_sign(expected_base_line_tax_details_global_discount)
        self.assert_down_payment_tax_amounts(
            document=document,
            amount_type='percent',
            amount=2,
            expected_base_lines_tax_details=[expected_base_line_tax_details_down_payment],
            expected_base_amount=0.63,
            expected_tax_amount=0.13,
            expected_total_amount=0.76,
        )

        self._run_js_tests()

    def test_negative_price_unit(self):
        tax_fixed = self.fixed_tax(1, include_base_amount=True)
        tax_21 = self.percent_tax(21)
        taxes = tax_fixed + tax_21

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 99.0, 'tax_ids': taxes},
                {'price_unit': -9.0, 'tax_ids': taxes},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 99.0,
            'total_included_currency': 121.0,
            'taxes_data': [
                {
                    'tax_id': tax_fixed.id,
                    'base_amount_currency': 99.0,
                    'tax_amount_currency': 1.0,
                },
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': 100.0,
                    'tax_amount_currency': 21.0,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': -9.0,
            'total_included_currency': -12.1,
            'taxes_data': [
                {
                    'tax_id': tax_fixed.id,
                    'base_amount_currency': -9.0,
                    'tax_amount_currency': -1.0,
                },
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': -10.0,
                    'tax_amount_currency': -2.1,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=90.0,
            expected_tax_amount=18.9,
            expected_total_amount=108.9,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 9.0, 'quantity': 12.0, 'tax_ids': taxes},
                {'price_unit': 9.0, 'quantity': -2.0, 'tax_ids': taxes},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 108.0,
            'total_included_currency': 145.2,
            'taxes_data': [
                {
                    'tax_id': tax_fixed.id,
                    'base_amount_currency': 108.0,
                    'tax_amount_currency': 12.0,
                },
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': 120.0,
                    'tax_amount_currency': 25.2,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': -18.0,
            'total_included_currency': -24.2,
            'taxes_data': [
                {
                    'tax_id': tax_fixed.id,
                    'base_amount_currency': -18.0,
                    'tax_amount_currency': -2.0,
                },
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': -20.0,
                    'tax_amount_currency': -4.2,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=90.0,
            expected_tax_amount=31.0,
            expected_total_amount=121.0,
        )

        tax_fixed.include_base_amount = False

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 5.0, 'quantity': 2.0, 'tax_ids': taxes},
                {'price_unit': 0.0, 'quantity': -1.0, 'tax_ids': taxes},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 10.0,
            'total_included_currency': 14.1,
            'taxes_data': [
                {
                    'tax_id': tax_fixed.id,
                    'base_amount_currency': 10.0,
                    'tax_amount_currency': 2.0,
                },
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': 10.0,
                    'tax_amount_currency': 2.1,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 0.0,
            'total_included_currency': -1.0,
            'taxes_data': [
                {
                    'tax_id': tax_fixed.id,
                    'base_amount_currency': 0.0,
                    'tax_amount_currency': -1.0,
                },
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': 0.0,
                    'tax_amount_currency': 0.0,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=10.0,
            expected_tax_amount=3.10,
            expected_total_amount=13.10,
        )

        self._run_js_tests()

    def test_withholding_tax(self):
        tax_21 = self.percent_tax(21.0)
        tax_minus_10_67 = self.percent_tax(-10.67)
        taxes = tax_21 + tax_minus_10_67

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 15.794, 'tax_ids': taxes},
                {'price_unit': 15.794, 'tax_ids': taxes},
            ],
        ))
        expected_base_line_tax_details_values_common = {
            'total_excluded_currency': 15.79,
            'total_included_currency': 17.42,
            'taxes_data': [
                {
                    'tax_id': tax_21.id,
                    'base_amount_currency': 15.79,
                },
                {
                    'tax_id': tax_minus_10_67.id,
                    'base_amount_currency': 15.79,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 3.32,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'tax_amount_currency': -1.69,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 3.31,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'tax_amount_currency': -1.68,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=31.58,
            expected_tax_amount=3.26,
            expected_total_amount=34.84,
        )

        self._run_js_tests()

    def test_multiple_lines_with_discount(self):
        tax = self.percent_tax(21.0)

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
            ],
        ))
        expected_base_line_tax_details_values_common = {
            'total_excluded_currency': 23.58,
            'taxes_data': [
                {
                    'tax_id': tax.id,
                    'base_amount_currency': 23.58,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 28.54,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 4.96,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 28.53,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 4.95,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 28.53,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 4.95,
                },
            ],
        }
        expected_base_line_tax_details_values_4 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 28.53,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 4.95,
                },
            ],
        }
        expected_base_line_tax_details_values_5 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 28.53,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 4.95,
                },
            ],
        }
        expected_base_line_tax_details_values_6 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 28.53,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'tax_amount_currency': 4.95,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_values_3,
                expected_base_line_tax_details_values_4,
                expected_base_line_tax_details_values_5,
                expected_base_line_tax_details_values_6,
            ],
            expected_base_amount=141.48,
            expected_tax_amount=29.71,
            expected_total_amount=171.19,
        )

        tax.price_include_override = 'tax_included'

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
                {'price_unit': 5.75, 'quantity': 5.0, 'discount': 18.0, 'tax_ids': tax},
            ],
        ))
        expected_base_line_tax_details_values_common = {
            'total_excluded_currency': 19.48,
            'taxes_data': [
                {
                    'tax_id': tax.id,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 23.58,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 19.48,
                    'tax_amount_currency': 4.1,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_excluded_currency': 19.49,
            'total_included_currency': 23.58,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 19.49,
                    'tax_amount_currency': 4.09,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            **expected_base_line_tax_details_values_common,
            'total_excluded_currency': 19.49,
            'total_included_currency': 23.58,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 19.49,
                    'tax_amount_currency': 4.09,
                },
            ],
        }
        expected_base_line_tax_details_values_4 = {
            **expected_base_line_tax_details_values_common,
            'total_excluded_currency': 19.49,
            'total_included_currency': 23.58,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 19.49,
                    'tax_amount_currency': 4.09,
                },
            ],
        }
        expected_base_line_tax_details_values_5 = {
            **expected_base_line_tax_details_values_common,
            'total_excluded_currency': 19.49,
            'total_included_currency': 23.58,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 19.49,
                    'tax_amount_currency': 4.09,
                },
            ],
        }
        expected_base_line_tax_details_values_6 = {
            **expected_base_line_tax_details_values_common,
            'total_excluded_currency': 19.49,
            'total_included_currency': 23.58,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 19.49,
                    'tax_amount_currency': 4.09,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_values_3,
                expected_base_line_tax_details_values_4,
                expected_base_line_tax_details_values_5,
                expected_base_line_tax_details_values_6,
            ],
            expected_base_amount=116.93,
            expected_tax_amount=24.55,
            expected_total_amount=141.48,
        )

        self._run_js_tests()
