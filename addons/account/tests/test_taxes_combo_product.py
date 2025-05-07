from odoo.addons.account.tests.common import TestTaxCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesComboProduct(TestTaxCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.currency = cls.env.company.currency_id

        cls.tax_groups = cls.env['account.tax.group'].create([
            {'name': str(i), 'sequence': str(i)}
            for i in range(1, 6)
        ])

    def _test_taxes_l10n_be(self):
        """ Test suite for the mixing of fixed and percentage taxes in l10n_be. This case implies a fixed tax that affect
        the base of the following percentage tax.
        """
        tax1 = self.fixed_tax(1, include_base_amount=True, tax_group_id=self.tax_groups[0].id)
        tax2 = self.percent_tax(21, tax_group_id=self.tax_groups[1].id)
        taxes = tax1 + tax2

        with self.with_tax_calculation_rounding_method('round_per_line'):
            document = self.populate_document(self.init_document(
                lines=[
                    {'price_unit': 99.0,    'tax_ids': taxes,       'combo_extra_price': 0.0},
                    {'price_unit': 20.0,    'tax_ids': tax2,        'combo_extra_price': 0.0},
                ],
            ))
            self.assert_py_tax_totals_summary(document, {
                'same_tax_base': False,
                'currency_id': self.currency.id,
                'base_amount_currency': 119.0,
                'tax_amount_currency': 26.2,
                'total_amount_currency': 145.2,
                'subtotals': [
                    {
                        'name': "Untaxed Amount",
                        'base_amount_currency': 119.0,
                        'tax_amount_currency': 26.2,
                        'tax_groups': [
                            {
                                'id': self.tax_groups[0].id,
                                'base_amount_currency': 99.0,
                                'tax_amount_currency': 1.0,
                                'display_base_amount_currency': None,
                            },
                            {
                                'id': self.tax_groups[1].id,
                                'base_amount_currency': 120.0,
                                'tax_amount_currency': 25.2,
                                'display_base_amount_currency': 120.0,
                            },
                        ],
                    },
                ],
            })

            expected_values = {
                'same_tax_base': False,
                'currency_id': self.currency.id,
                'base_amount_currency': 110.0,
                'tax_amount_currency': 24.31,
                'total_amount_currency': 134.31,
                'subtotals': [
                    {
                        'name': "Untaxed Amount",
                        'base_amount_currency': 110.0,
                        'tax_amount_currency': 24.31,
                        'tax_groups': [
                            {
                                'id': self.tax_groups[0].id,
                                'base_amount_currency': 91.51,
                                'tax_amount_currency': 1.0,
                                'display_base_amount_currency': None,
                            },
                            {
                                'id': self.tax_groups[1].id,
                                'base_amount_currency': 111.0,
                                'tax_amount_currency': 23.31,
                                'display_base_amount_currency': 111.0,
                            },
                        ],
                    },
                ],
            }
            yield "round_per_line, price_excluded", document, [({0, 1}, 110.0)], expected_values

            document = self.populate_document(self.init_document(
                lines=[
                    {'price_unit': 99.0,    'tax_ids': taxes,       'combo_extra_price': 5.0},
                    {'price_unit': 20.0,    'tax_ids': tax2,        'combo_extra_price': 0.0},
                ],
            ))

            expected_values = {
                'same_tax_base': False,
                'currency_id': self.currency.id,
                'base_amount_currency': 115.0,
                'tax_amount_currency': 25.36,
                'total_amount_currency': 140.36,
                'subtotals': [
                    {
                        'name': "Untaxed Amount",
                        'base_amount_currency': 115.0,
                        'tax_amount_currency': 25.36,
                        'tax_groups': [
                            {
                                'id': self.tax_groups[0].id,
                                'base_amount_currency': 96.51,
                                'tax_amount_currency': 1.0,
                                'display_base_amount_currency': None,
                            },
                            {
                                'id': self.tax_groups[1].id,
                                'base_amount_currency': 116.0,
                                'tax_amount_currency': 24.36,
                                'display_base_amount_currency': 116.0,
                            },
                        ],
                    },
                ],
            }
            yield "round_per_line, price_excluded, extra_price", document, [({0, 1}, 110.0)], expected_values

        with self.with_tax_calculation_rounding_method('round_globally'):
            document = self.populate_document(self.init_document(
                lines=[
                    {'price_unit': 16.79,   'tax_ids': taxes,       'combo_extra_price': 0.0},
                    {'price_unit': 17.79,   'tax_ids': tax2,        'combo_extra_price': 0.0},
                    {'price_unit': 16.79,   'tax_ids': taxes,       'combo_extra_price': 0.0},
                    {'price_unit': 17.79,   'tax_ids': tax2,        'combo_extra_price': 0.0},
                ],
            ))
            self.assert_py_tax_totals_summary(document, {
                'same_tax_base': False,
                'currency_id': self.currency.id,
                'base_amount_currency': 69.16,
                'tax_amount_currency': 16.94,
                'total_amount_currency': 86.1,
                'subtotals': [
                    {
                        'name': "Untaxed Amount",
                        'base_amount_currency': 69.16,
                        'tax_amount_currency': 16.94,
                        'tax_groups': [
                            {
                                'id': self.tax_groups[0].id,
                                'base_amount_currency': 33.58,
                                'tax_amount_currency': 2.0,
                                'display_base_amount_currency': None,
                            },
                            {
                                'id': self.tax_groups[1].id,
                                'base_amount_currency': 71.16,
                                'tax_amount_currency': 14.94,
                                'display_base_amount_currency': 71.16,
                            },
                        ],
                    },
                ],
            })

            expected_values = {
                'same_tax_base': False,
                'currency_id': self.currency.id,
                'base_amount_currency': 60.34,
                'tax_amount_currency': 15.09,
                'total_amount_currency': 75.43,
                'subtotals': [
                    {
                        'name': "Untaxed Amount",
                        'base_amount_currency': 60.34,
                        'tax_amount_currency': 15.09,
                        'tax_groups': [
                            {
                                'id': self.tax_groups[0].id,
                                'base_amount_currency': 29.3,
                                'tax_amount_currency': 2.0,
                                'display_base_amount_currency': None,
                            },
                            {
                                'id': self.tax_groups[1].id,
                                'base_amount_currency': 62.34,
                                'tax_amount_currency': 13.09,
                                'display_base_amount_currency': 62.34,
                            },
                        ],
                    },
                ],
            }
            yield "round_globally, price_excluded, multiple_combos", document, [({0, 1}, 30.17), ({2, 3}, 30.17)], expected_values

    def test_taxes_l10n_be_generic_helpers(self):
        for test_mode, document, combo_price, expected_values in self._test_taxes_l10n_be():
            with self.subTest(test_code=test_mode):
                self.assert_combo_product(document, combo_price, expected_values)
        # self._run_js_tests()
