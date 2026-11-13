from odoo.addons.account.tests.common import TestTaxesRoundingCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesRoundingL10nMx(TestTaxesRoundingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.change_company_country(cls.env.company, cls.env.ref('base.mx'))

    def test_8_ieps_plus_16_plus_10_67_withholding(self):
        tax_8_ieps = self.percent_tax(8.0, include_base_amount=True)
        tax_16 = self.percent_tax(16.0)
        tax_10_67_wh = self.percent_tax(-10.67)
        taxes = tax_8_ieps + tax_16 + tax_10_67_wh

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
            'taxes_data': [
                {
                    'tax_id': tax_8_ieps.id,
                    'base_amount': 7.9,
                },
                {
                    'tax_id': tax_16.id,
                    'base_amount_currency': 17.06,
                    'base_amount': 8.53,
                    'tax_amount_currency': 2.73,
                },
                {
                    'tax_id': tax_10_67_wh.id,
                    'base_amount_currency': 17.06,
                    'base_amount': 8.53,
                    'tax_amount_currency': -1.82,
                    'tax_amount': -0.91,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_excluded_currency': 15.8,
            'total_included_currency': 17.98,
            'total_included': 9.0,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 15.80,
                    'tax_amount_currency': 1.27,
                    'tax_amount': 0.64,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'tax_amount': 1.37,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 17.96,
            'total_included': 8.98,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 15.79,
                    'tax_amount_currency': 1.26,
                    'tax_amount': 0.63,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'tax_amount': 1.36,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=31.59,
            expected_tax_amount=4.35,
            expected_total_amount=35.94,
        )

        taxes.price_include_override = 'tax_included'

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 17.967, 'tax_ids': taxes},
                {'price_unit': 17.967, 'tax_ids': taxes},
            ],
            currency=self.foreign_currency,
            rate=2,
        ))
        expected_base_line_tax_details_values_common = {
            'total_excluded_currency': 15.79,
            'total_excluded': 7.9,
            'taxes_data': [
                {
                    'tax_id': tax_8_ieps.id,
                    'base_amount': 7.9,
                },
                {
                    'tax_id': tax_16.id,
                    'base_amount_currency': 17.06,
                    'base_amount': 8.53,
                    'tax_amount_currency': 2.73,
                },
                {
                    'tax_id': tax_10_67_wh.id,
                    'base_amount_currency': 17.06,
                    'base_amount': 8.53,
                    'tax_amount_currency': -1.82,
                    'tax_amount': -0.91,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_excluded_currency': 15.8,
            'total_included_currency': 17.98,
            'total_included': 9.0,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 15.80,
                    'tax_amount_currency': 1.27,
                    'tax_amount': 0.64,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'tax_amount': 1.37,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 17.96,
            'total_included': 8.98,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 15.79,
                    'tax_amount_currency': 1.26,
                    'tax_amount': 0.63,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'tax_amount': 1.36,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=31.59,
            expected_tax_amount=4.35,
            expected_total_amount=35.94,
        )

        self._run_js_tests()

    def test_global_discount(self):
        tax_16 = self.percent_tax(16.0)

        document = self.populate_document(self.init_document([
            {'price_unit': 61948.3, 'tax_ids': tax_16},
            {'price_unit': 35974.15, 'tax_ids': tax_16},
            {'price_unit': 8194.83, 'tax_ids': tax_16},
        ]))
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 61948.3,
            'total_included_currency': 71860.03,
            'taxes_data': [
                {
                    'tax_id': tax_16.id,
                    'base_amount_currency': 61948.3,
                    'tax_amount_currency': 9911.73,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 35974.15,
            'total_included_currency': 41730.01,
            'taxes_data': [
                {
                    'tax_id': tax_16.id,
                    'base_amount_currency': 35974.15,
                    'tax_amount_currency': 5755.86,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            'total_excluded_currency': 8194.83,
            'total_included_currency': 9506.0,
            'taxes_data': [
                {
                    'tax_id': tax_16.id,
                    'base_amount_currency': 8194.83,
                    'tax_amount_currency': 1311.17,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_values_3,
            ],
            expected_base_amount=106117.28,
            expected_tax_amount=16978.76,
            expected_total_amount=123096.04,
        )

        expected_base_line_tax_details_global_discount = {
            'total_excluded_currency': -10611.72,
            'total_included_currency': -12309.6,
            'taxes_data': [
                {
                    'tax_id': tax_16.id,
                    'base_amount_currency': -10611.73,
                    'tax_amount_currency': -1697.88,
                },
            ],
        }
        self.assert_global_discount_tax_amounts(
            document=document,
            amount_type='percent',
            amount=10,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_values_3,
                expected_base_line_tax_details_global_discount,
            ],
            expected_base_amount=95505.56,
            expected_tax_amount=15280.88,
            expected_total_amount=110786.44,
        )