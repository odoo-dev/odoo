from odoo import Command
from odoo.addons.account.tests.test_taxes_computation import TestTaxesComputation
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesComputationL10nPt(TestTaxesComputation):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.change_company_country(cls.env.company, cls.env.ref('base.pt'))

    def test_use_cases_for_certification(self):
        tax_0 = self.percent_tax(0.0, tax_group_id=self.tax_groups[0].id)
        tax_6 = self.percent_tax(6.0, tax_group_id=self.tax_groups[1].id)
        tax_13 = self.percent_tax(13.0, tax_group_id=self.tax_groups[2].id)
        tax_23 = self.percent_tax(23.0, tax_group_id=self.tax_groups[3].id)

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 12.12, 'price_unit': 12.12},
                {'quantity': 12.12, 'price_unit': 12.12},
            ],
        ))
        expected_base_line_tax_details_values_common = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 146.8944,
            'total_excluded_currency': 146.89,
            'taxes_data': [],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'delta_total_excluded_currency': 0.01,
            'total_included_currency': 146.90,
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'delta_total_excluded_currency': 0.0,
            'total_included_currency': 146.89,
        }
        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=293.79,
            expected_tax_amount=0.0,
            expected_total_amount=293.79,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_13},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_13},
            ],
        ))
        expected_base_line_tax_details_values_common = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 165.990672,
            'total_excluded_currency': 146.89,
            'total_included_currency': 165.99,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 19.096272,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'delta_total_excluded_currency': 0.0,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 19.1,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'delta_total_excluded_currency': 0.01,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 19.09,
                },
            ],
        }
        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=293.79,
            expected_tax_amount=38.19,
            expected_total_amount=331.98,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_13},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_common = {
            'raw_total_excluded_currency': 146.8944,
            'total_excluded_currency': 146.89,
            'delta_total_excluded_currency': 0.0,
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'raw_total_included_currency': 165.990672,
            'total_included_currency': 165.99,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 19.096272,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 19.1,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'raw_total_included_currency': 180.680112,
            'total_included_currency': 180.68,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 33.785712,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 33.79,
                },
            ],
        }
        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=293.78,
            expected_tax_amount=52.89,
            expected_total_amount=346.67,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 1.0, 'price_unit': 0.5, 'tax_ids': tax_23},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'raw_total_excluded_currency': 0.5,
            'raw_total_included_currency': 0.615,
            'total_excluded_currency': 0.5,
            'total_included_currency': 0.62,
            'delta_total_excluded_currency': 0.01,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'raw_base_amount_currency': 0.5,
                    'raw_tax_amount_currency': 0.115,
                    'base_amount_currency': 0.51,
                    'tax_amount_currency': 0.11,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 180.680112,
            'total_excluded_currency': 146.89,
            'total_included_currency': 180.68,
            'delta_total_excluded_currency': 0.0,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 33.785712,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 33.79,
                },
            ],
        }
        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=147.40,
            expected_tax_amount=33.9,
            expected_total_amount=181.30,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_0},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_0},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_6},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_6},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_13},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_13},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_23},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_0_common = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 146.8944,
            'total_excluded_currency': 146.89,
            'total_included_currency': 146.89,
            'delta_total_excluded_currency': 0.0,
            'taxes_data': [
                {
                    'tax_id': tax_0.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 0.0,
                    'tax_amount_currency': 0.0,
                },
            ],
        }
        expected_base_line_tax_details_values_6_common = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 155.708064,
            'total_excluded_currency': 146.89,
            'total_included_currency': 155.71,
            'taxes_data': [
                {
                    'tax_id': tax_6.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 8.813664,
                },
            ],
        }
        expected_base_line_tax_details_values_13_common = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 165.990672,
            'total_excluded_currency': 146.89,
            'total_included_currency': 165.99,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 19.096272,
                },
            ],
        }
        expected_base_line_tax_details_values_23_common = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 180.680112,
            'total_excluded_currency': 146.89,
            'delta_total_excluded_currency': 0.01,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 33.785712,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_0_common,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_0_common['taxes_data'][0],
                    'base_amount_currency': 146.90,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_0_common,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_0_common['taxes_data'][0],
                    'base_amount_currency': 146.89,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            **expected_base_line_tax_details_values_6_common,
            'delta_total_excluded_currency': 0.0,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_6_common['taxes_data'][0],
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 8.82,
                },
            ],
        }
        expected_base_line_tax_details_values_4 = {
            **expected_base_line_tax_details_values_6_common,
            'delta_total_excluded_currency': 0.01,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_6_common['taxes_data'][0],
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 8.81,
                },
            ],
        }
        expected_base_line_tax_details_values_5 = {
            **expected_base_line_tax_details_values_13_common,
            'delta_total_excluded_currency': 0.0,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_13_common['taxes_data'][0],
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 19.1,
                },
            ],
        }
        expected_base_line_tax_details_values_6 = {
            **expected_base_line_tax_details_values_13_common,
            'delta_total_excluded_currency': 0.01,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_13_common['taxes_data'][0],
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 19.09,
                },
            ],
        }
        expected_base_line_tax_details_values_7 = {
            **expected_base_line_tax_details_values_23_common,
            'total_included_currency': 180.69,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_23_common['taxes_data'][0],
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 33.79,
                },
            ],
        }
        expected_base_line_tax_details_values_8 = {
            **expected_base_line_tax_details_values_23_common,
            'total_included_currency': 180.68,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_23_common['taxes_data'][0],
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 33.78,
                },
            ],
        }
        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_values_3,
                expected_base_line_tax_details_values_4,
                expected_base_line_tax_details_values_5,
                expected_base_line_tax_details_values_6,
                expected_base_line_tax_details_values_7,
                expected_base_line_tax_details_values_8,
            ],
            expected_base_amount=1175.16,
            expected_tax_amount=123.39,
            expected_total_amount=1298.55,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_23},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_23},
                {'quantity': 1, 'price_unit': 0.5, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_1_2 = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 180.680112,
            'total_excluded_currency': 146.89,
            'total_included_currency': 180.68,
            'delta_total_excluded_currency': 0.0,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 33.785712,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 33.79,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            'raw_total_excluded_currency': 0.5,
            'total_excluded_currency': 0.5,
            'delta_total_excluded_currency': 0.01,
            'raw_total_included_currency': 0.615,
            'total_included_currency': 0.62,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'raw_base_amount_currency': 0.5,
                    'raw_tax_amount_currency': 0.115,
                    'base_amount_currency': 0.51,
                    'tax_amount_currency': 0.11,
                },
            ],
        }
        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1_2,
                expected_base_line_tax_details_values_1_2,
                expected_base_line_tax_details_values_3,
            ],
            expected_base_amount=294.29,
            expected_tax_amount=67.69,
            expected_total_amount=361.98,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_0},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_6},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_13},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_13},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_23},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_13_common = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 165.990672,
            'total_excluded_currency': 146.89,
            'total_included_currency': 165.99,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 19.096272,
                },
            ],
        }
        expected_base_line_tax_details_values_23_common = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 180.680112,
            'total_excluded_currency': 146.89,
            'total_included_currency': 180.68,
            'delta_total_excluded_currency': 0.01,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 33.785712,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 146.8944,
            'total_excluded_currency': 146.89,
            'total_included_currency': 146.89,
            'delta_total_excluded_currency': 0.0,
            'taxes_data': [
                {
                    'tax_id': tax_0.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 0.0,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 0.0,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'raw_total_excluded_currency': 146.8944,
            'raw_total_included_currency': 155.708064,
            'total_excluded_currency': 146.89,
            'total_included_currency': 155.71,
            'delta_total_excluded_currency': 0.01,
            'taxes_data': [
                {
                    'tax_id': tax_6.id,
                    'raw_base_amount_currency': 146.8944,
                    'raw_tax_amount_currency': 8.813664,
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 8.81,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            **expected_base_line_tax_details_values_13_common,
            'delta_total_excluded_currency': 0.0,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_13_common['taxes_data'][0],
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 19.1,
                },
            ],
        }
        expected_base_line_tax_details_values_4 = {
            **expected_base_line_tax_details_values_13_common,
            'delta_total_excluded_currency': 0.01,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_13_common['taxes_data'][0],
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 19.09,
                },
            ],
        }
        expected_base_line_tax_details_values_5 = {
            **expected_base_line_tax_details_values_23_common,
            'delta_total_excluded_currency': 0.0,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_23_common['taxes_data'][0],
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 33.79,
                },
            ],
        }
        expected_base_line_tax_details_values_6 = {
            **expected_base_line_tax_details_values_23_common,
            'delta_total_excluded_currency': 0.01,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_23_common['taxes_data'][0],
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 33.78,
                },
            ],
        }
        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
                expected_base_line_tax_details_values_3,
                expected_base_line_tax_details_values_4,
                expected_base_line_tax_details_values_5,
                expected_base_line_tax_details_values_6,
            ],
            expected_base_amount=881.37,
            expected_tax_amount=114.57,
            expected_total_amount=995.94,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 5.55, 'price_unit': 1.09, 'tax_ids': tax_23},
                {'quantity': 5.5, 'price_unit': 1.09, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'raw_total_excluded_currency': 6.0495,
            'raw_total_included_currency': 7.440885,
            'total_excluded_currency': 6.05,
            'delta_total_excluded_currency': 0.0,
            'total_included_currency': 7.44,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'raw_base_amount_currency': 6.0495,
                    'raw_tax_amount_currency': 1.391385,
                    'base_amount_currency': 6.05,
                    'tax_amount_currency': 1.39,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'raw_total_excluded_currency': 5.995,
            'raw_total_included_currency': 7.37385,
            'total_excluded_currency': 6.0,
            'delta_total_excluded_currency': -0.01,
            'total_included_currency': 7.37,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'raw_base_amount_currency': 5.995,
                    'raw_tax_amount_currency': 1.37885,
                    'base_amount_currency': 5.99,
                    'tax_amount_currency': 1.38,
                },
            ],
        }
        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=12.04,
            expected_tax_amount=2.77,
            expected_total_amount=14.81,
        )

        self._run_js_tests()
