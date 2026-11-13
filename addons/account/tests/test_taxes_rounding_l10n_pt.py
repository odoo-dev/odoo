from odoo import Command
from odoo.addons.account.tests.common import TestTaxesRoundingCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesRoundingL10nPt(TestTaxesRoundingCommon):

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
            'total_excluded_currency': 146.89,
            'taxes_data': [],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_excluded_currency': 146.9,
            'total_included_currency': 146.90,
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 146.89,
        }
        self.assert_tax_amounts(
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
            'total_excluded_currency': 146.89,
            'total_included_currency': 165.99,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
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
            'total_excluded_currency': 146.9,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_common['taxes_data'][0],
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 19.09,
                },
            ],
        }
        self.assert_tax_amounts(
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
            'total_excluded_currency': 146.89,
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 165.99,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 19.1,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_common,
            'total_included_currency': 180.68,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 33.79,
                },
            ],
        }
        self.assert_tax_amounts(
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
            'total_excluded_currency': 0.51,
            'total_included_currency': 0.62,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 0.51,
                    'tax_amount_currency': 0.11,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 146.89,
            'total_included_currency': 180.68,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 33.79,
                },
            ],
        }
        self.assert_tax_amounts(
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
            'total_excluded_currency': 146.89,
            'total_included_currency': 146.89,
            'taxes_data': [
                {
                    'tax_id': tax_0.id,
                    'tax_amount_currency': 0.0,
                },
            ],
        }
        expected_base_line_tax_details_values_6_common = {
            'total_excluded_currency': 146.89,
            'total_included_currency': 155.71,
            'taxes_data': [
                {
                    'tax_id': tax_6.id,
                },
            ],
        }
        expected_base_line_tax_details_values_13_common = {
            'total_excluded_currency': 146.89,
            'total_included_currency': 165.99,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                },
            ],
        }
        expected_base_line_tax_details_values_23_common = {
            'total_excluded_currency': 146.9,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
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
            'total_excluded_currency': 146.9,
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
            'total_excluded_currency': 146.9,
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
        self.assert_tax_amounts(
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
            'total_excluded_currency': 146.89,
            'total_included_currency': 180.68,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 33.79,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            'total_excluded_currency': 0.51,
            'total_included_currency': 0.62,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 0.51,
                    'tax_amount_currency': 0.11,
                },
            ],
        }
        self.assert_tax_amounts(
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
            'total_excluded_currency': 146.89,
            'total_included_currency': 165.99,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                },
            ],
        }
        expected_base_line_tax_details_values_23_common = {
            'total_excluded_currency': 146.9,
            'total_included_currency': 180.68,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 146.89,
            'total_included_currency': 146.89,
            'taxes_data': [
                {
                    'tax_id': tax_0.id,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 0.0,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 146.9,
            'total_included_currency': 155.71,
            'taxes_data': [
                {
                    'tax_id': tax_6.id,
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 8.81,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            **expected_base_line_tax_details_values_13_common,
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
            'total_excluded_currency': 146.9,
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
            'total_excluded_currency': 146.89,
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
            'total_excluded_currency': 146.9,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_23_common['taxes_data'][0],
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 33.78,
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
            'total_excluded_currency': 6.05,
            'total_included_currency': 7.44,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 6.05,
                    'tax_amount_currency': 1.39,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 5.99,
            'total_included_currency': 7.37,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 5.99,
                    'tax_amount_currency': 1.38,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=12.04,
            expected_tax_amount=2.77,
            expected_total_amount=14.81,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_0},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_0},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_6},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_6},
                {'quantity': 13.13, 'price_unit': 12.12, 'tax_ids': tax_13},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_13},
                {'quantity': 13.13, 'price_unit': 12.12, 'tax_ids': tax_23},
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_0_common = {
            'total_excluded_currency': 146.89,
            'total_included_currency': 146.89,
            'taxes_data': [
                {
                    'tax_id': tax_0.id,
                    'tax_amount_currency': 0.0,
                },
            ],
        }
        expected_base_line_tax_details_values_6_common = {
            'total_excluded_currency': 146.89,
            'total_included_currency': 155.71,
            'taxes_data': [
                {
                    'tax_id': tax_6.id,
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
            'total_excluded_currency': 146.9,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_6_common['taxes_data'][0],
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 8.81,
                },
            ],
        }
        expected_base_line_tax_details_values_5 = {
            'total_excluded_currency': 159.13,
            'total_included_currency': 179.82,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'base_amount_currency': 159.13,
                    'tax_amount_currency': 20.69,
                },
            ],
        }
        expected_base_line_tax_details_values_6 = {
            'total_excluded_currency': 146.9,
            'total_included_currency': 165.99,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'base_amount_currency': 146.90,
                    'tax_amount_currency': 19.09,
                },
            ],
        }
        expected_base_line_tax_details_values_7 = {
            'total_excluded_currency': 159.15,
            'total_included_currency': 195.75,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 159.14,
                    'tax_amount_currency': 36.6,
                },
            ],
        }
        expected_base_line_tax_details_values_8 = {
            'total_excluded_currency': 146.89,
            'total_included_currency': 180.68,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 33.79,
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
                expected_base_line_tax_details_values_7,
                expected_base_line_tax_details_values_8,
            ],
            expected_base_amount=1199.64,
            expected_tax_amount=127.8,
            expected_total_amount=1327.44,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 501.0, 'price_unit': 3.0, 'tax_ids': tax_6},
            ],
        ))
        expected_base_line_tax_details_values = {
            'total_excluded_currency': 1503.0,
            'total_included_currency': 1593.18,
            'taxes_data': [
                {
                    'tax_id': tax_6.id,
                    'base_amount_currency': 1503.0,
                    'tax_amount_currency': 90.18,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values],
            expected_base_amount=1503.0,
            expected_tax_amount=90.18,
            expected_total_amount=1593.18,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 12.12, 'price_unit': 12.12, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values = {
            'total_excluded_currency': 146.89,
            'total_included_currency': 180.68,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 146.89,
                    'tax_amount_currency': 33.79,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values],
            expected_base_amount=146.89,
            expected_tax_amount=33.79,
            expected_total_amount=180.68,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 50.0, 'price_unit': 2.0, 'tax_ids': tax_13},
                {'quantity': 100.0, 'price_unit': 1.0, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 100.0,
            'total_included_currency': 113.0,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'base_amount_currency': 100.0,
                    'tax_amount_currency': 13.0,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 100.0,
            'total_included_currency': 123.0,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 100.0,
                    'tax_amount_currency': 23.0,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values_1, expected_base_line_tax_details_values_2],
            expected_base_amount=200.0,
            expected_tax_amount=36.0,
            expected_total_amount=236.0,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 1.0, 'price_unit': 1.0, 'tax_ids': tax_0},
                {'quantity': 1.0, 'price_unit': 4.0, 'tax_ids': tax_0},
                {'quantity': 10.0, 'price_unit': 3.0, 'tax_ids': tax_6},
                {'quantity': 1.0, 'price_unit': 2.0, 'tax_ids': tax_13},
                {'quantity': 1.0, 'price_unit': 1.0, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 1.0,
            'total_included_currency': 1.0,
            'taxes_data': [
                {
                    'tax_id': tax_0.id,
                    'base_amount_currency': 1.0,
                    'tax_amount_currency': 0.0,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 4.0,
            'total_included_currency': 4.0,
            'taxes_data': [
                {
                    'tax_id': tax_0.id,
                    'base_amount_currency': 4.0,
                    'tax_amount_currency': 0.0,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            'total_excluded_currency': 30.0,
            'total_included_currency': 31.8,
            'taxes_data': [
                {
                    'tax_id': tax_6.id,
                    'base_amount_currency': 30.0,
                    'tax_amount_currency': 1.8,
                },
            ],
        }
        expected_base_line_tax_details_values_4 = {
            'total_excluded_currency': 2.0,
            'total_included_currency': 2.26,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'base_amount_currency': 2.0,
                    'tax_amount_currency': 0.26,
                },
            ],
        }
        expected_base_line_tax_details_values_5 = {
            'total_excluded_currency': 1.0,
            'total_included_currency': 1.23,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 1.0,
                    'tax_amount_currency': 0.23,
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
            ],
            expected_base_amount=38.0,
            expected_tax_amount=2.29,
            expected_total_amount=40.29,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 50.0, 'price_unit': 1.09, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values = {
            'total_excluded_currency': 54.5,
            'total_included_currency': 67.04,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 54.5,
                    'tax_amount_currency': 12.54,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[expected_base_line_tax_details_values],
            expected_base_amount=54.5,
            expected_tax_amount=12.54,
            expected_total_amount=67.04,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 100.0, 'price_unit': 0.55, 'discount': 8.8, 'tax_ids': tax_23},
                {'quantity': 10.0, 'price_unit': 2.0, 'tax_ids': tax_23},
                {'quantity': 1.0, 'price_unit': -7.016, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 50.16,
            'total_included_currency': 61.7,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 50.16,
                    'tax_amount_currency': 11.54,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 20.0,
            'total_included_currency': 24.6,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 20.0,
                    'tax_amount_currency': 4.6,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            'total_excluded_currency': -7.01,
            'total_included_currency': -8.63,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': -7.01,
                    'tax_amount_currency': -1.62,
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
            expected_base_amount=63.15,
            expected_tax_amount=14.52,
            expected_total_amount=77.67,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 12.12, 'price_unit': 12.12, 'discount': 6.6, 'tax_ids': tax_13},
                {'quantity': 12.12, 'price_unit': 12.12, 'discount': 6.6, 'tax_ids': tax_13},
                {'quantity': 12.12, 'price_unit': 12.12, 'discount': 8.8, 'tax_ids': tax_23},
                {'quantity': 12.12, 'price_unit': 12.12, 'discount': 8.8, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_13_common = {
            'total_excluded_currency': 137.2,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                },
            ],
        }
        expected_base_line_tax_details_values_23_common = {
            'total_excluded_currency': 133.97,
            'total_included_currency': 164.78,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                },
            ],
        }
        expected_base_line_tax_details_values_1 = {
            **expected_base_line_tax_details_values_13_common,
            'total_included_currency': 155.04,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_13_common['taxes_data'][0],
                    'base_amount_currency': 137.2,
                    'tax_amount_currency': 17.84,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            **expected_base_line_tax_details_values_13_common,
            'total_included_currency': 155.03,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_13_common['taxes_data'][0],
                    'base_amount_currency': 137.2,
                    'tax_amount_currency': 17.83,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            **expected_base_line_tax_details_values_23_common,
            'total_excluded_currency': 133.96,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_23_common['taxes_data'][0],
                    'base_amount_currency': 133.96,
                    'tax_amount_currency': 30.82,
                },
            ],
        }
        expected_base_line_tax_details_values_4 = {
            **expected_base_line_tax_details_values_23_common,
            'taxes_data': [
                {
                    **expected_base_line_tax_details_values_23_common['taxes_data'][0],
                    'base_amount_currency': 133.97,
                    'tax_amount_currency': 30.81,
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
            ],
            expected_base_amount=542.33,
            expected_tax_amount=97.30,
            expected_total_amount=639.63,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 13.13, 'price_unit': 13.13, 'tax_ids': tax_13},
                {'quantity': 1.0, 'price_unit': 0.5, 'tax_ids': tax_13},
                {'quantity': 1.0, 'price_unit': 0.5, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 172.4,
            'total_included_currency': 194.81,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'base_amount_currency': 172.4,
                    'tax_amount_currency': 22.41,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 0.49,
            'total_included_currency': 0.56,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'base_amount_currency': 0.49,
                    'tax_amount_currency': 0.07,
                },
            ],
        }
        expected_base_line_tax_details_values_3 = {
            'total_excluded_currency': 0.5,
            'total_included_currency': 0.62,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 0.5,
                    'tax_amount_currency': 0.12,
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
            expected_base_amount=173.39,
            expected_tax_amount=22.6,
            expected_total_amount=195.99,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 1.0, 'price_unit': 0.5, 'tax_ids': tax_13},
                {'quantity': 1.0, 'price_unit': 0.5, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 0.49,
            'total_included_currency': 0.56,
            'taxes_data': [
                {
                    'tax_id': tax_13.id,
                    'base_amount_currency': 0.5,
                    'tax_amount_currency': 0.07,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 0.5,
            'total_included_currency': 0.62,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 0.5,
                    'tax_amount_currency': 0.12,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
            ],
            expected_base_amount=0.99,
            expected_tax_amount=0.19,
            expected_total_amount=1.18,
        )

        document = self.populate_document(self.init_document(
            lines=[
                {'quantity': 100.0, 'price_unit': 0.55, 'discount': 17.92, 'tax_ids': tax_23},
                {'quantity': 10.0, 'price_unit': 2.0, 'discount': 10.0, 'tax_ids': tax_23},
            ],
        ))
        expected_base_line_tax_details_values_1 = {
            'total_excluded_currency': 45.15,
            'total_included_currency': 55.53,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 45.15,
                    'tax_amount_currency': 10.38,
                },
            ],
        }
        expected_base_line_tax_details_values_2 = {
            'total_excluded_currency': 18.0,
            'total_included_currency': 22.14,
            'taxes_data': [
                {
                    'tax_id': tax_23.id,
                    'base_amount_currency': 18.0,
                    'tax_amount_currency': 4.14,
                },
            ],
        }
        self.assert_tax_amounts(
            document=document,
            expected_base_lines_tax_details=[
                expected_base_line_tax_details_values_1,
                expected_base_line_tax_details_values_2,
            ],
            expected_base_amount=63.15,
            expected_tax_amount=14.52,
            expected_total_amount=77.67,
        )

        self._run_js_tests()

    def test_taxes_l10n_pt_vendor_bill_manual_tax_amount(self):
        tax_23 = self.percent_tax(23)

        invoice = self.env['account.move'].create({
            'move_type': 'in_invoice',
            'invoice_date': '2020-01-01',
            'invoice_line_ids': [
                Command.create({
                    'product_id': self.product_a.id,
                    'price_unit': 123.0,
                    'tax_ids': [Command.set(tax_23.ids)],
                })
            ],
        })
        base_lines, _tax_lines = invoice._get_rounded_base_and_tax_lines()
        self.assert_py_tax_amounts(
            base_lines,
            expected_base_lines_tax_details=[{
                'total_excluded_currency': 123.0,
                'total_included_currency': 151.29,
                'taxes_data': [
                    {
                        'tax_id': tax_23.id,
                        'base_amount_currency': 123.0,
                        'tax_amount_currency': 28.29,
                    },
                ],
            }],
            expected_base_amount=123.0,
            expected_tax_amount=28.29,
            expected_total_amount=151.29,
        )
        self._assert_tax_totals_summary(invoice.tax_totals, {
            'same_tax_base': True,
            'currency_id': self.currency.id,
            'base_amount_currency': 123.0,
            'tax_amount_currency': 28.29,
            'total_amount_currency': 151.29,
            'subtotals': [
                {
                    'name': "Untaxed Amount",
                    'base_amount_currency': 123.0,
                    'tax_amount_currency': 28.29,
                    'tax_groups': [
                        {
                            'id': self.tax_groups[0].id,
                            'base_amount_currency': 123.0,
                            'tax_amount_currency': 28.29,
                            'display_base_amount_currency': 123.0,
                        },
                    ],
                },
            ],
        })

        # Manual edition of the tax amount.
        tax_line = invoice.line_ids.filtered('tax_repartition_line_id')
        invoice.line_ids = [Command.update(tax_line.id, {'amount_currency': 28.30})]
        base_lines, _tax_lines = invoice._get_rounded_base_and_tax_lines()
        self.assert_py_tax_amounts(
            base_lines,
            expected_base_lines_tax_details=[{
                'total_excluded_currency': 122.99,
                'total_included_currency': 151.29,
                'taxes_data': [
                    {
                        'tax_id': tax_23.id,
                        'base_amount_currency': 122.99,
                        'tax_amount_currency': 28.30,
                    },
                ],
            }],
            expected_base_amount=122.99,
            expected_tax_amount=28.30,
            expected_total_amount=151.29,
        )
        self._assert_tax_totals_summary(invoice.tax_totals, {
            'same_tax_base': True,
            'currency_id': self.currency.id,
            'base_amount_currency': 122.99,
            'tax_amount_currency': 28.30,
            'total_amount_currency': 151.29,
            'subtotals': [
                {
                    'name': "Untaxed Amount",
                    'base_amount_currency': 122.99,
                    'tax_amount_currency': 28.30,
                    'tax_groups': [
                        {
                            'id': self.tax_groups[0].id,
                            'base_amount_currency': 122.99,
                            'tax_amount_currency': 28.30,
                            'display_base_amount_currency': 122.99,
                        },
                    ],
                },
            ],
        })
