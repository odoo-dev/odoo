from odoo.addons.account.tests.test_taxes_computation import TestTaxesComputation
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesComputationL10nIn(TestTaxesComputation):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['ir.config_parameter'].sudo().set_bool('account.use_new_taxes_engine', False)
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
            'raw_total_excluded_currency': 15.89,
            'raw_total_excluded': 3.178,
            'raw_total_included_currency': 18.330704,
            'raw_total_included': 3.6661408,
            'total_excluded_currency': 15.89,
            'total_excluded': 3.18,
            'delta_total_excluded_currency': 0.0,
            'delta_total_excluded': 0.0,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'raw_base_amount_currency': 15.89,
                    'raw_base_amount': 3.178,
                    'raw_tax_amount_currency': 0.9534,
                    'raw_tax_amount': 0.19068,
                    'base_amount_currency': 15.89,
                    'base_amount': 3.18,
                    'tax_amount': 0.19,
                },
                {
                    'tax_id': tax2.id,
                    'raw_base_amount_currency': 15.89,
                    'raw_base_amount': 3.178,
                    'raw_tax_amount_currency': 0.9534,
                    'raw_tax_amount': 0.19068,
                    'base_amount_currency': 15.89,
                    'base_amount': 3.18,
                    'tax_amount': 0.19,
                },
                {
                    'tax_id': tax3.id,
                    'raw_base_amount_currency': 17.7968,
                    'raw_base_amount': 3.55936,
                    'raw_tax_amount_currency': 0.533904,
                    'raw_tax_amount': 0.1067808,
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
                    'base_amount_currency': 17.8,
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
        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=31.78,
            expected_tax_amount=4.89,
            expected_total_amount=36.67,
        )

        # Discount 2%
        expected_base_line_tax_details_global_discount = {
            'raw_total_excluded_currency': -0.635,
            'raw_total_excluded': -0.12712,
            'raw_total_included_currency': -0.73262816,
            'raw_total_included': -0.146645632,
            'total_excluded_currency': -0.63,
            'total_excluded': -0.13,
            'delta_total_excluded_currency': 0.0,
            'delta_total_excluded': 0.0,
            'total_included_currency': -0.73,
            'total_included': -0.15,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'raw_base_amount_currency': -0.6356,
                    'raw_base_amount': -0.12712,
                    'raw_tax_amount_currency': -0.038136,
                    'raw_tax_amount': -0.0076272,
                    'base_amount_currency': -0.64,
                    'base_amount': -0.13,
                    'tax_amount_currency': -0.04,
                    'tax_amount': -0.01,
                },
                {
                    'tax_id': tax2.id,
                    'raw_base_amount_currency': -0.6356,
                    'raw_base_amount': -0.12712,
                    'raw_tax_amount_currency': -0.038136,
                    'raw_tax_amount': -0.0076272,
                    'base_amount_currency': -0.64,
                    'base_amount': -0.13,
                    'tax_amount_currency': -0.04,
                    'tax_amount': -0.01,
                },
                {
                    'tax_id': tax3.id,
                    'raw_base_amount_currency': -0.711872,
                    'raw_base_amount': -0.1423744,
                    'raw_tax_amount_currency': -0.02135616,
                    'raw_tax_amount': -0.004271232,
                    'base_amount_currency': -0.71,
                    'base_amount': -0.14,
                    'tax_amount_currency': -0.02,
                    'tax_amount': 0.0,
                },
            ],
        }
        self.assert_global_discount_base_lines_tax_details(
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
        self.assert_down_payment_base_lines_tax_details(
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
            'raw_total_excluded_currency': -2.235,
            'raw_total_excluded': -0.44492,
            'raw_total_included_currency': -2.57669856,
            'raw_total_included': -0.513259712,
            'total_excluded_currency': -2.24,
            'total_excluded': -0.44,
            'delta_total_excluded_currency': 0.0,
            'delta_total_excluded': 0.0,
            'total_included_currency': -2.57,
            'total_included': -0.51,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'raw_base_amount_currency': -2.2246,
                    'raw_base_amount': -0.44492,
                    'raw_tax_amount_currency': -0.133476,
                    'raw_tax_amount': -0.0266952,
                    'base_amount_currency': -2.22,
                    'base_amount': -0.45,
                    'tax_amount_currency': -0.13,
                    'tax_amount': -0.03,
                },
                {
                    'tax_id': tax2.id,
                    'raw_base_amount_currency': -2.2246,
                    'raw_base_amount': -0.44492,
                    'raw_tax_amount_currency': -0.133476,
                    'raw_tax_amount': -0.0266952,
                    'base_amount_currency': -2.22,
                    'base_amount': -0.45,
                    'tax_amount_currency': -0.13,
                    'tax_amount': -0.03,
                },
                {
                    'tax_id': tax3.id,
                    'raw_base_amount_currency': -2.491552,
                    'raw_base_amount': -0.4983104,
                    'raw_tax_amount_currency': -0.07474656,
                    'raw_tax_amount': -0.014949312,
                    'base_amount_currency': -2.49,
                    'base_amount': -0.5,
                    'tax_amount_currency': -0.07,
                    'tax_amount': -0.01,
                },
            ],
        }
        self.assert_global_discount_base_lines_tax_details(
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
        self.assert_down_payment_base_lines_tax_details(
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
            'raw_total_excluded_currency': -5.725,
            'raw_total_excluded': -1.14408,
            'raw_total_included_currency': -6.60365344,
            'raw_total_included': -1.319810688,
            'total_excluded_currency': -5.73,
            'total_excluded': -1.14,
            'delta_total_excluded_currency': 0.0,
            'delta_total_excluded': 0.0,
            'total_included_currency': -6.6,
            'total_included': -1.32,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'raw_base_amount_currency': -5.7204,
                    'raw_base_amount': -1.14408,
                    'raw_tax_amount_currency': -0.343224,
                    'raw_tax_amount': -0.0686448,
                    'base_amount_currency': -5.72,
                    'base_amount': -1.14,
                    'tax_amount_currency': -0.34,
                    'tax_amount': -0.07,
                },
                {
                    'tax_id': tax2.id,
                    'raw_base_amount_currency': -5.7204,
                    'raw_base_amount': -1.14408,
                    'raw_tax_amount_currency': -0.343224,
                    'raw_tax_amount': -0.0686448,
                    'base_amount_currency': -5.72,
                    'base_amount': -1.14,
                    'tax_amount_currency': -0.34,
                    'tax_amount': -0.07,
                },
                {
                    'tax_id': tax3.id,
                    'raw_base_amount_currency': -6.406848,
                    'raw_base_amount': -1.2813696,
                    'raw_tax_amount_currency': -0.19220544,
                    'raw_tax_amount': -0.038441088,
                    'base_amount_currency': -6.41,
                    'base_amount': -1.28,
                    'tax_amount_currency': -0.19,
                    'tax_amount': -0.04,
                },
            ],
        }
        self.assert_global_discount_base_lines_tax_details(
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
        self.assert_down_payment_base_lines_tax_details(
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
            'raw_total_excluded_currency': 15.88,
            'raw_total_excluded': 3.176,
            'raw_total_included_currency': 18.3237,
            'raw_total_included': 3.66274,
            'total_excluded_currency': 15.88,
            'total_excluded': 3.18,
            'delta_total_excluded': 0.0,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'raw_base_amount_currency': 15.88,
                    'raw_base_amount': 3.176,
                    'raw_tax_amount_currency': 0.95303571,
                    'raw_tax_amount': 0.1906071429,
                    'base_amount': 3.18,
                    'tax_amount': 0.19,
                },
                {
                    'tax_id': tax2.id,
                    'raw_base_amount_currency': 15.88,
                    'raw_base_amount': 3.176,
                    'raw_tax_amount_currency': 0.95303571,
                    'raw_tax_amount': 0.1906071429,
                    'base_amount': 3.18,
                    'tax_amount': 0.19,
                },
                {
                    'tax_id': tax3.id,
                    'raw_base_amount_currency': 17.79,
                    'raw_base_amount': 3.558,
                    'raw_tax_amount_currency': 0.5337,
                    'raw_tax_amount': 0.10674,
                    'base_amount_currency': 17.79,
                    'base_amount': 3.56,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'delta_total_excluded_currency': 0.0,
            'total_included_currency': 18.34,
            'total_included': 3.67,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 15.88,
                    'tax_amount_currency': 0.96,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'base_amount_currency': 15.88,
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
            'delta_total_excluded_currency': 0.0,
            'delta_total_excluded': -0.01,
            'total_included_currency': 18.31,
            'total_included': 3.65,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 15.88,
                    'base_amount': 3.17,
                    'tax_amount_currency': 0.95,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][1],
                    'base_amount_currency': 15.88,
                    'base_amount': 3.17,
                    'tax_amount_currency': 0.95,
                },
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][2],
                    'tax_amount_currency': 0.53,
                    'tax_amount': 0.1,
                },
            ],
        }
        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=31.76,
            expected_tax_amount=4.89,
            expected_total_amount=36.65,
        )

        # Discount 2%
        expected_base_line_tax_details_global_discount = {
            'raw_total_excluded_currency': -0.6316,
            'raw_total_excluded': -0.12632,
            'raw_total_included_currency': -0.732948,
            'raw_total_included': -0.1505896,
            'total_excluded_currency': -0.63,
            'total_excluded': -0.13,
            'delta_total_excluded_currency': 0.0,
            'delta_total_excluded': 0.0,
            'total_included_currency': -0.73,
            'total_included': -0.15,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'raw_base_amount_currency': -0.6316,
                    'raw_base_amount': -0.12632,
                    'raw_tax_amount_currency': -0.03812143,
                    'raw_tax_amount': -0.0076242857,
                    'base_amount_currency': -0.64,
                    'base_amount': -0.13,
                    'tax_amount_currency': -0.04,
                    'tax_amount': -0.01,
                },
                {
                    'tax_id': tax2.id,
                    'raw_base_amount_currency': -0.6316,
                    'raw_base_amount': -0.12632,
                    'raw_tax_amount_currency': -0.03812143,
                    'raw_tax_amount': -0.0076242857,
                    'base_amount_currency': -0.64,
                    'base_amount': -0.13,
                    'tax_amount_currency': -0.04,
                    'tax_amount': -0.01,
                },
                {
                    'tax_id': tax3.id,
                    'raw_base_amount_currency': -0.7116,
                    'raw_base_amount': -0.14232,
                    'raw_tax_amount_currency': -0.021348,
                    'raw_tax_amount': -0.0042696,
                    'base_amount_currency': -0.71,
                    'base_amount': -0.14,
                    'tax_amount_currency': -0.02,
                    'tax_amount': 0.0,
                },
            ],
        }
        self.assert_global_discount_base_lines_tax_details(
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
        self.assert_down_payment_base_lines_tax_details(
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
            'raw_total_excluded_currency': -2.235,
            'raw_total_excluded': -0.44612,
            'raw_total_included_currency': -2.569718,
            'raw_total_included': -0.5210636,
            'total_excluded_currency': -2.24,
            'total_excluded': -0.44,
            'delta_total_excluded_currency': 0.0,
            'delta_total_excluded': 0.0,
            'total_included_currency': -2.57,
            'total_included': -0.51,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'raw_base_amount_currency': -2.2306,
                    'raw_base_amount': -0.44612,
                    'raw_tax_amount_currency': -0.133425,
                    'raw_tax_amount': -0.026685,
                    'base_amount_currency': -2.22,
                    'base_amount': -0.44,
                    'tax_amount_currency': -0.13,
                    'tax_amount': -0.03,
                },
                {
                    'tax_id': tax2.id,
                    'raw_base_amount_currency': -2.2306,
                    'raw_base_amount': -0.44612,
                    'raw_tax_amount_currency': -0.133425,
                    'raw_tax_amount': -0.026685,
                    'base_amount_currency': -2.22,
                    'base_amount': -0.44,
                    'tax_amount_currency': -0.13,
                    'tax_amount': -0.03,
                },
                {
                    'tax_id': tax3.id,
                    'raw_base_amount_currency': -2.4906,
                    'raw_base_amount': -0.49812,
                    'raw_tax_amount_currency': -0.074718,
                    'raw_tax_amount': -0.0149436,
                    'base_amount_currency': -2.49,
                    'base_amount': -0.5,
                    'tax_amount_currency': -0.07,
                    'tax_amount': -0.01,
                },
            ],
        }
        self.assert_global_discount_base_lines_tax_details(
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
        self.assert_down_payment_base_lines_tax_details(
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
            'raw_total_excluded_currency': -5.725,
            'raw_total_excluded': -1.14488,
            'raw_total_included_currency': -6.597132,
            'raw_total_included': -1.3233064,
            'total_excluded_currency': -5.73,
            'total_excluded': -1.14,
            'delta_total_excluded_currency': 0.0,
            'delta_total_excluded': 0.0,
            'total_included_currency': -6.6,
            'total_included': -1.32,
            'taxes_data': [
                {
                    'tax_id': tax1.id,
                    'raw_base_amount_currency': -5.7244,
                    'raw_base_amount': -1.14488,
                    'raw_tax_amount_currency': -0.34309286,
                    'raw_tax_amount': -0.0686185714,
                    'base_amount_currency': -5.72,
                    'base_amount': -1.14,
                    'tax_amount_currency': -0.34,
                    'tax_amount': -0.07,
                },
                {
                    'tax_id': tax2.id,
                    'raw_base_amount_currency': -5.7244,
                    'raw_base_amount': -1.14488,
                    'raw_tax_amount_currency': -0.34309286,
                    'raw_tax_amount': -0.0686185714,
                    'base_amount_currency': -5.72,
                    'base_amount': -1.14,
                    'tax_amount_currency': -0.34,
                    'tax_amount': -0.07,
                },
                {
                    'tax_id': tax3.id,
                    'raw_base_amount_currency': -6.4044,
                    'raw_base_amount': -1.28088,
                    'raw_tax_amount_currency': -0.192132,
                    'raw_tax_amount': -0.0384264,
                    'base_amount_currency': -6.4,
                    'base_amount': -1.28,
                    'tax_amount_currency': -0.19,
                    'tax_amount': -0.04,
                },
            ],
        }
        self.assert_global_discount_base_lines_tax_details(
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
        self.assert_down_payment_base_lines_tax_details(
            document=document,
            amount_type='percent',
            amount=18,
            expected_base_lines_tax_details=[expected_base_line_tax_details_down_payment],
            expected_base_amount=5.73,
            expected_tax_amount=0.87,
            expected_total_amount=6.6,
        )

        self._run_js_tests()
