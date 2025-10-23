from odoo import Command
from odoo.addons.account.tests.common import TestTaxCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesComputation(TestTaxCommon):

    def test_taxes_ordering(self):
        tax_division = self.division_tax(10.0, sequence=1)
        tax_fixed = self.fixed_tax(10.0, sequence=2)
        tax_percent = self.percent_tax(10.0, sequence=3)
        tax_group = self.group_of_taxes(tax_fixed + tax_percent, sequence=4)
        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 200.0, 'tax_ids': tax_group | tax_division},
                {
                    'raw_total_included_currency': 252.22,
                    'raw_total_excluded_currency': 200.0,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 200.0,
                            'raw_tax_amount_currency': 22.22,
                        },
                        {
                            'raw_base_amount_currency': 200.0,
                            'raw_tax_amount_currency': 10.0,
                        },
                        {
                            'raw_base_amount_currency': 200.0,
                            'raw_tax_amount_currency': 20.0,
                        },
                    ),
                },
            )

        tax_percent1 = self.percent_tax(0.0, price_include_override='tax_included')
        tax_percent2 = self.percent_tax(8.0, price_include_override='tax_included')
        tax_group1 = self.group_of_taxes(tax_percent1, sequence=5)
        tax_group2 = self.group_of_taxes(tax_percent2, sequence=6)
        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 124.4, 'tax_ids': tax_group1 | tax_group2},
                {
                    'raw_total_included_currency': 124.4,
                    'raw_total_excluded_currency': 115.19,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 115.19,
                            'raw_tax_amount_currency': 0.0,
                        },
                        {
                            'raw_base_amount_currency': 115.19,
                            'raw_tax_amount_currency': 9.21,
                        },
                    ),
                },
            )
        self._run_js_tests()

    def test_taxes_filtering(self):
        tax_percent_1 = self.percent_tax(10.0)
        tax_percent_2 = self.percent_tax(20.0)
        self.assert_taxes_computation(
            {'price_unit': 100.0, 'tax_ids': tax_percent_1 | tax_percent_2},
            {
                'raw_total_included_currency': 110.0,
                'raw_total_excluded_currency': 100.0,
                'taxes_data': (
                    {
                        'raw_base_amount_currency': 100.0,
                        'raw_tax_amount_currency': 10.0,
                    },
                ),
            },
            excluded_tax_ids=tax_percent_2.ids,
        )
        self._run_js_tests()

    def test_random_case_1(self):
        tax_percent_8_price_included = self.percent_tax(8.0, price_include_override='tax_included')
        tax_percent_0_price_included = self.percent_tax(0.0, price_include_override='tax_included')

        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 124.40, 'tax_ids': tax_percent_8_price_included + tax_percent_0_price_included},
                {
                    'raw_total_included_currency': 124.40,
                    'raw_total_excluded_currency': 115.19,
                    'taxes_data': (
                        {'raw_base_amount_currency': 115.19, 'raw_tax_amount_currency': 9.21},
                        {'raw_base_amount_currency': 115.19, 'raw_tax_amount_currency': 0.0},
                    ),
                },
            )
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 124.40, 'tax_ids': tax_percent_8_price_included + tax_percent_0_price_included},
                {
                    'raw_total_included_currency': 124.40,
                    'raw_total_excluded_currency': 115.185185,
                    'taxes_data': (
                        {'raw_base_amount_currency': 115.185185, 'raw_tax_amount_currency': 9.214815},
                        {'raw_base_amount_currency': 115.185185, 'raw_tax_amount_currency': 0.0},
                    ),
                },
            )
        self._run_js_tests()

    def test_random_case_2(self):
        new_currency = self.new_currency(0.05)
        tax_percent_5_price_included = self.percent_tax(5.0, price_include_override='tax_included')

        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 5.0, 'tax_ids': tax_percent_5_price_included, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 5.0,
                    'raw_total_included': 5.0,
                    'raw_total_excluded_currency': 4.75,
                    'raw_total_excluded': 4.75,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 4.75,
                            'raw_base_amount': 4.75,
                            'raw_tax_amount_currency': 0.25,
                            'raw_tax_amount': 0.25,
                        },
                    ),
                },
            )
            self.assert_taxes_computation(
                {'price_unit': 10.0, 'tax_ids': tax_percent_5_price_included, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 10.0,
                    'raw_total_included': 10.0,
                    'raw_total_excluded_currency': 9.5,
                    'raw_total_excluded': 9.5,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 9.5,
                            'raw_base_amount': 9.5,
                            'raw_tax_amount_currency': 0.5,
                            'raw_tax_amount': 0.5,
                        },
                    ),
                },
            )
            self.assert_taxes_computation(
                {'price_unit': 50.0, 'tax_ids': tax_percent_5_price_included, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 50.0,
                    'raw_total_included': 50.0,
                    'raw_total_excluded_currency': 47.6,
                    'raw_total_excluded': 47.6,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 47.6,
                            'raw_base_amount': 47.6,
                            'raw_tax_amount_currency': 2.4,
                            'raw_tax_amount': 2.4,
                        },
                    ),
                },
            )
        self._run_js_tests()

    def test_random_case_3(self):
        tax_percent_15_price_excluded = self.percent_tax(15.0)
        tax_percent_5_5_price_included = self.percent_tax(5.5, price_include_override='tax_included')

        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 2300.0, 'tax_ids': tax_percent_15_price_excluded + tax_percent_5_5_price_included},
                {
                    'raw_total_included_currency': 2627.01,
                    'raw_total_excluded_currency': 2180.09,
                    'taxes_data': (
                        {'raw_base_amount_currency': 2180.09, 'raw_tax_amount_currency': 327.01},
                        {'raw_base_amount_currency': 2180.09, 'raw_tax_amount_currency': 119.91},
                    ),
                },
            )
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 2300.0, 'tax_ids': tax_percent_15_price_excluded + tax_percent_5_5_price_included},
                {
                    'raw_total_included_currency': 2627.014218,
                    'raw_total_excluded_currency': 2180.094787,
                    'taxes_data': (
                        {'raw_base_amount_currency': 2180.094787, 'raw_tax_amount_currency': 327.014218},
                        {'raw_base_amount_currency': 2180.094787, 'raw_tax_amount_currency': 119.905213},
                    ),
                },
            )
        self._run_js_tests()

    def test_random_case_4(self):
        tax_percent_12_price_included = self.percent_tax(12.0, price_include_override='tax_included')

        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 52.50, 'tax_ids': tax_percent_12_price_included},
                {
                    'raw_total_included_currency': 52.50,
                    'raw_total_excluded_currency': 46.87,
                    'taxes_data': (
                        {'raw_base_amount_currency': 46.87, 'raw_tax_amount_currency': 5.63},
                    ),
                },
            )
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 52.50, 'tax_ids': tax_percent_12_price_included},
                {
                    'raw_total_included_currency': 52.50,
                    'raw_total_excluded_currency': 46.875,
                    'taxes_data': (
                        {'raw_base_amount_currency': 46.875, 'raw_tax_amount_currency': 5.625},
                    ),
                },
            )
        self._run_js_tests()

    def test_random_case_5(self):
        new_currency = self.new_currency(1.0)
        tax_percent_19 = self.percent_tax(19.0)
        tax_percent_19_price_included = self.percent_tax(19.0, price_include_override='tax_included')

        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 22689.0, 'tax_ids': tax_percent_19, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 27000.0,
                    'raw_total_included': 27000.0,
                    'raw_total_excluded_currency': 22689.0,
                    'raw_total_excluded': 22689.0,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 22689.0,
                            'raw_base_amount': 22689.0,
                            'raw_tax_amount_currency': 4311.0,
                            'raw_tax_amount': 4311.0,
                        },
                    ),
                },
            )
            self.assert_taxes_computation(
                {'price_unit': 9176.0, 'tax_ids': tax_percent_19, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 10919.0,
                    'raw_total_included': 10919.0,
                    'raw_total_excluded_currency': 9176.0,
                    'raw_total_excluded': 9176.0,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 9176.0,
                            'raw_base_amount': 9176.0,
                            'raw_tax_amount_currency': 1743.0,
                            'raw_tax_amount': 1743.0,
                        },
                    ),
                },
            )
            self.assert_taxes_computation(
                {'price_unit': 27000.0, 'tax_ids': tax_percent_19_price_included, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 27000.0,
                    'raw_total_included': 27000.0,
                    'raw_total_excluded_currency': 22689.0,
                    'raw_total_excluded': 22689.0,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 22689.0,
                            'raw_base_amount': 22689.0,
                            'raw_tax_amount_currency': 4311.0,
                            'raw_tax_amount': 4311.0,
                        },
                    ),
                },
            )
            self.assert_taxes_computation(
                {'price_unit': 10920.0, 'tax_ids': tax_percent_19_price_included, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 10920.0,
                    'raw_total_included': 10920.0,
                    'raw_total_excluded_currency': 9176.0,
                    'raw_total_excluded': 9176.0,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 9176.0,
                            'raw_base_amount': 9176.0,
                            'raw_tax_amount_currency': 1744.0,
                            'raw_tax_amount': 1744.0,
                        },
                    ),
                },
            )
        self._run_js_tests()

    def test_random_case_6(self):
        new_currency = self.new_currency(0.000001)
        tax_percent_20_price_included = self.percent_tax(20.0, price_include_override='tax_included')

        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 399.999999, 'tax_ids': tax_percent_20_price_included, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 399.999999,
                    'raw_total_included': 400.0,
                    'raw_total_excluded_currency': 333.333332,
                    'raw_total_excluded': 333.33,
                    'taxes_data': (
                        # 399.999999 / 1.20 * 0.20 ~= 66.666667
                        # 399.999999 - 66.666667 = 333.333332
                        {
                            'raw_base_amount_currency': 333.333332,
                            'raw_base_amount': 333.33,
                            'raw_tax_amount_currency': 66.666667,
                            'raw_tax_amount': 66.67,
                        },
                    ),
                },
            )
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 399.999999, 'tax_ids': tax_percent_20_price_included, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 399.999999,
                    'raw_total_included': 400.0,
                    'raw_total_excluded_currency': 333.3333325,
                    'raw_total_excluded': 333.33,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 333.3333325,
                            'raw_base_amount': 333.33,
                            'raw_tax_amount_currency': 66.6666665,
                            'raw_tax_amount': 66.67,
                        },
                    ),
                },
            )
        self._run_js_tests()

    def test_random_case_7(self):
        new_currency = self.new_currency(0.000001)
        tax_percent_21_price_included = self.percent_tax(21.0, price_include_override='tax_included')

        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 11.90, 'tax_ids': tax_percent_21_price_included},
                {
                    'raw_total_included_currency': 11.90,
                    'raw_total_excluded_currency': 9.83,
                    'taxes_data': (
                        {'raw_base_amount_currency': 9.83, 'raw_tax_amount_currency': 2.07},
                    ),
                },
            )
            self.assert_taxes_computation(
                {'price_unit': 2.80, 'tax_ids': tax_percent_21_price_included},
                {
                    'raw_total_included_currency': 2.80,
                    'raw_total_excluded_currency': 2.31,
                    'taxes_data': (
                        {'raw_base_amount_currency': 2.31, 'raw_tax_amount_currency': 0.49},
                    ),
                },
            )
            self.assert_taxes_computation(
                {'price_unit': 7.0, 'tax_ids': tax_percent_21_price_included, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 7.0,
                    'raw_total_included': 7.0,
                    'raw_total_excluded_currency': 5.785124,
                    'raw_total_excluded': 5.79,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 5.785124,
                            'raw_base_amount': 5.79,
                            'raw_tax_amount_currency': 1.214876,
                            'raw_tax_amount': 1.21,
                        },
                    ),
                },
            )
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 11.90, 'tax_ids': tax_percent_21_price_included},
                {
                    'raw_total_included_currency': 11.90,
                    'raw_total_excluded_currency': 9.834711,
                    'taxes_data': (
                        {'raw_base_amount_currency': 9.834711, 'raw_tax_amount_currency': 2.065289},
                    ),
                },
            )
            self.assert_taxes_computation(
                {'price_unit': 2.80, 'tax_ids': tax_percent_21_price_included},
                {
                    'raw_total_included_currency': 2.80,
                    'raw_total_excluded_currency': 2.31405,
                    'taxes_data': (
                        {'raw_base_amount_currency': 2.31405, 'raw_tax_amount_currency': 0.48595},
                    ),
                },
            )
            self.assert_taxes_computation(
                {'price_unit': 7.0, 'tax_ids': tax_percent_21_price_included, 'currency_id': new_currency},
                {
                    'raw_total_included_currency': 7.0,
                    'raw_total_included': 7.0,
                    'raw_total_excluded_currency': 5.785124,
                    'raw_total_excluded': 5.79,
                    'taxes_data': (
                        {
                            'raw_base_amount_currency': 5.785124,
                            'raw_base_amount': 5.79,
                            'raw_tax_amount_currency': 1.214876,
                            'raw_tax_amount': 1.21,
                        },
                    ),
                },
            )
        self._run_js_tests()

    def test_random_case_8(self):
        tax_percent_20_withholding = self.percent_tax(-20.0)
        tax_percent_4 = self.percent_tax(4.0, include_base_amount=True)
        tax_percent_22 = self.percent_tax(22.0)
        taxes = tax_percent_20_withholding + tax_percent_4 + tax_percent_22

        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 50.0, 'tax_ids': taxes},
                {
                    'raw_total_included_currency': 53.44,
                    'raw_total_excluded_currency': 50.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 50.0, 'raw_tax_amount_currency': -10.0},
                        {'raw_base_amount_currency': 50.0, 'raw_tax_amount_currency': 2.0},
                        {'raw_base_amount_currency': 52.0, 'raw_tax_amount_currency': 11.44},
                    ),
                },
            )
        self._run_js_tests()

    def test_random_case_9(self):
        tax_division_100 = self.division_tax(100.0, price_include_override='tax_included')

        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 100.0, 'tax_ids': tax_division_100},
                {
                    'raw_total_included_currency': 100.0,
                    'raw_total_excluded_currency': 0.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 0.0, 'raw_tax_amount_currency': 100.0},
                    ),
                },
            )
        self._run_js_tests()

    def test_random_case_10_reverse_charge(self):
        """ Reverse charge taxes are always price-excluded. """
        tax = self.percent_tax(
            21.0,
            invoice_repartition_line_ids=[
                Command.create({'repartition_type': 'base', 'factor_percent': 100.0}),
                Command.create({'repartition_type': 'tax', 'factor_percent': 100.0}),
                Command.create({'repartition_type': 'tax', 'factor_percent': -100.0}),
            ],
            refund_repartition_line_ids=[
                Command.create({'repartition_type': 'base', 'factor_percent': 100.0}),
                Command.create({'repartition_type': 'tax', 'factor_percent': 100.0}),
                Command.create({'repartition_type': 'tax', 'factor_percent': -100.0}),
            ],
        )

        line = {'price_unit': 100.0, 'tax_ids': tax}
        params = [
            line,
            {
                'raw_total_included_currency': 100.0,
                'raw_total_excluded_currency': 100.0,
                'taxes_data': (
                    {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 21.0},
                    {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': -21.0},
                ),
            }
        ]

        self.assert_taxes_computation(*params)
        tax.price_include_override = 'tax_included'
        self.assert_taxes_computation(*params)
        self._run_js_tests()

    def test_fixed_tax_price_included_affect_base_on_0(self):
        tax = self.fixed_tax(0.05, price_include_override='tax_included', include_base_amount=True)
        with self.with_tax_calculation_rounding_method('round_per_line'):
            self.assert_taxes_computation(
                {'price_unit': 0.0, 'tax_ids': tax},
                {
                    'raw_total_included_currency': 0.0,
                    'raw_total_excluded_currency': -0.05,
                    'taxes_data': (
                        {'raw_base_amount_currency': -0.05, 'raw_tax_amount_currency': 0.05},
                    ),
                },
            )
        self._run_js_tests()

    def test_percent_taxes_for_l10n_in(self):
        """ Test suite for the complex GST taxes in l10n_in. This case implies 3 percentage taxes:
        t1: % tax, include_base_amount
        t2: same % as t1, include_base_amount, not is_base_affected
        t3: % tax

        This case is complex because the amounts of t1 and t2 must always be the same.
        Furthermore, it's a complicated setup due to the usage of include_base_amount / is_base_affected.
        """
        tax1 = self.percent_tax(6)
        tax2 = self.percent_tax(6)
        tax3 = self.percent_tax(3)

        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 100.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 115.0,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 3.0},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount    is_base_affected
        # ----------------------------------------------------------------
        # tax1                      T                   T
        # tax2                                          T
        # tax3                                          T
        tax1.include_base_amount = True
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 100.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 115.54,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 106.0, 'raw_tax_amount_currency': 6.36},
                        {'raw_base_amount_currency': 106.0, 'raw_tax_amount_currency': 3.18},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount    is_base_affected
        # ----------------------------------------------------------------
        # tax1                      T                   T
        # tax2
        # tax3                                          T
        tax2.is_base_affected = False
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 100.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 115.18,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 106.0, 'raw_tax_amount_currency': 3.18},
                    ),
                },
                excluded_special_modes=['total_included'],
            )

        # tax       price_incl      incl_base_amount    is_base_affected
        # ----------------------------------------------------------------
        # tax1                      T                   T
        # tax2                      T                   T
        # tax3                                          T
        tax2.is_base_affected = True
        tax2.include_base_amount = True
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 100.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 115.7308,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 106.0, 'raw_tax_amount_currency': 6.36},
                        {'raw_base_amount_currency': 112.36, 'raw_tax_amount_currency': 3.3708},
                    ),
                },
                excluded_special_modes=['total_included'],  # Impossible.
            )

        # tax       price_incl      incl_base_amount    is_base_affected
        # ----------------------------------------------------------------
        # tax1                      T                   T
        # tax2                      T
        # tax3                                          T
        tax2.is_base_affected = False
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 100.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 115.36,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 112.0, 'raw_tax_amount_currency': 3.36},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount    is_base_affected
        # ----------------------------------------------------------------
        # tax1      T               T                   T
        # tax2      T               T
        # tax3                                          T
        tax1.price_include_override = 'tax_included'
        tax2.price_include_override = 'tax_included'
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 112.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 115.36,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 112.0, 'raw_tax_amount_currency': 3.36},
                    ),
                },
            )

        # Ensure tax1 & tax2 give always the same result.
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 17.79, 'tax_ids': tax1 + tax2},
                {
                    'raw_total_included_currency': 17.79,
                    'raw_total_excluded_currency': 15.883929,
                    'taxes_data': (
                        {'raw_base_amount_currency': 15.883929, 'raw_tax_amount_currency': 0.953036},
                        {'raw_base_amount_currency': 15.883929, 'raw_tax_amount_currency': 0.953036},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount    is_base_affected
        # ----------------------------------------------------------------
        # tax1      T               T
        # tax2      T               T
        tax1.is_base_affected = False
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 200.0, 'tax_ids': tax1 + tax2},
                {
                    'raw_total_included_currency': 200.0,
                    'raw_total_excluded_currency': 178.571429,
                    'taxes_data': (
                        {'raw_base_amount_currency': 178.571429, 'raw_tax_amount_currency': 10.714286},
                        {'raw_base_amount_currency': 178.571429, 'raw_tax_amount_currency': 10.714286},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount    is_base_affected
        # ----------------------------------------------------------------
        # tax1      T               T                   T
        # tax2
        # tax3                                          T
        tax1.is_base_affected = True
        tax2.price_include = False
        tax2.include_base_amount = False
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 106.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 115.18,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 106.0, 'raw_tax_amount_currency': 3.18},
                    ),
                },
                excluded_special_modes=['total_included'],
            )

        # tax       price_incl      incl_base_amount    is_base_affected
        # ----------------------------------------------------------------
        # tax1      T               T                   T
        # tax2                                          T
        # tax3                                          T
        tax2.is_base_affected = True
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 106.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 115.54,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 106.0, 'raw_tax_amount_currency': 6.36},
                        {'raw_base_amount_currency': 106.0, 'raw_tax_amount_currency': 3.18},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount    is_base_affected
        # ----------------------------------------------------------------
        # tax1      T                                   T
        # tax2
        # tax3                                          T
        tax1.include_base_amount = False
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 106.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 115.0,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 6.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 3.0},
                    ),
                },
            )
        self._run_js_tests()

    def test_division_taxes_for_l10n_br(self):
        """ Test suite for the complex division taxes in l10n_be. This case implies 5 division taxes
        and is quite complicated to handle because they have to be computed all together and are
        computed as part of the price_unit.
        """
        tax1 = self.division_tax(5)
        tax2 = self.division_tax(3)
        tax3 = self.division_tax(0.65)
        tax4 = self.division_tax(9)
        tax5 = self.division_tax(15)

        # Same of tax4/tax5 except the amount is based on 32% of the base amount.
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 32.33, 'tax_ids': tax1 + tax2 + tax3 + tax4 + tax5},
                {
                    'raw_total_included_currency': 48.00297,
                    'raw_total_excluded_currency': 32.33,
                    'taxes_data': (
                        {'raw_base_amount_currency': 32.33, 'raw_tax_amount_currency': 2.400148},
                        {'raw_base_amount_currency': 32.33, 'raw_tax_amount_currency': 1.440089},
                        {'raw_base_amount_currency': 32.33, 'raw_tax_amount_currency': 0.312019},
                        {'raw_base_amount_currency': 32.33, 'raw_tax_amount_currency': 4.320267},
                        {'raw_base_amount_currency': 32.33, 'raw_tax_amount_currency': 7.200445},
                    ),
                },
            )

        (tax1 + tax2 + tax3 + tax4 + tax5).price_include_override = 'tax_included'
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 48.0, 'tax_ids': tax1 + tax2 + tax3 + tax4 + tax5},
                {
                    'raw_total_included_currency': 48.0,
                    'raw_total_excluded_currency': 32.328,
                    'taxes_data': (
                        {'raw_base_amount_currency': 32.328, 'raw_tax_amount_currency': 2.4},
                        {'raw_base_amount_currency': 32.328, 'raw_tax_amount_currency': 1.44},
                        {'raw_base_amount_currency': 32.328, 'raw_tax_amount_currency': 0.312},
                        {'raw_base_amount_currency': 32.328, 'raw_tax_amount_currency': 4.32},
                        {'raw_base_amount_currency': 32.328, 'raw_tax_amount_currency': 7.2},
                    ),
                },
            )
        self._run_js_tests()

    def test_fixed_taxes_for_l10n_be(self):
        """ Test suite for the mixing of fixed and percentage taxes in l10n_be. This case implies a fixed tax that affect
        the base of the following percentage tax. We also have to maintain the case in which the fixed tax is after the percentage
        one.
        """
        tax1 = self.fixed_tax(1)
        tax2 = self.percent_tax(21)
        tax3 = self.fixed_tax(2)

        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 20.0, 'quantity': 5, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 136.0,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 5.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 21.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 10.0},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount
        # -----------------------------------------------
        # tax1                      T
        # tax2
        # tax3
        tax1.include_base_amount = True
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 19.0, 'quantity': 5, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 131.0,
                    'raw_total_excluded_currency': 95.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 95.0, 'raw_tax_amount_currency': 5.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 21.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 10.0},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount
        # -----------------------------------------------
        # tax1                      T
        # tax2      T
        # tax3
        tax2.price_include_override = 'tax_included'
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 120.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 123.0,
                    'raw_total_excluded_currency': 99.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 99.0, 'raw_tax_amount_currency': 1.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 21.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 2.0},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount
        # -----------------------------------------------
        # tax1                      T
        # tax2      T               T
        # tax3
        tax2.include_base_amount = True
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 120.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 123.0,
                    'raw_total_excluded_currency': 99.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 99.0, 'raw_tax_amount_currency': 1.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 21.0},
                        {'raw_base_amount_currency': 121.0, 'raw_tax_amount_currency': 2.0},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount
        # -----------------------------------------------
        # tax1
        # tax2      T               T
        # tax3
        tax1.include_base_amount = False
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 121.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 124.0,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 1.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 21.0},
                        {'raw_base_amount_currency': 121.0, 'raw_tax_amount_currency': 2.0},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount
        # -----------------------------------------------
        # tax1
        # tax2                      T
        # tax3
        tax2.price_include_override = 'tax_excluded'
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 100.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 124.0,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 1.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 21.0},
                        {'raw_base_amount_currency': 121.0, 'raw_tax_amount_currency': 2.0},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount
        # -----------------------------------------------
        # tax1      T
        # tax2      T               T
        # tax3
        tax1.price_include_override = 'tax_included'
        tax2.price_include_override = 'tax_included'
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 122.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 124.0,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 1.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 21.0},
                        {'raw_base_amount_currency': 121.0, 'raw_tax_amount_currency': 2.0},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount
        # -----------------------------------------------
        # tax1      T
        # tax2      T
        # tax3
        tax2.include_base_amount = False
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 122.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 124.0,
                    'raw_total_excluded_currency': 100.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 1.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 21.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 2.0},
                    ),
                },
            )

        # tax       price_incl      incl_base_amount
        # -----------------------------------------------
        # tax1      T               T
        # tax2      T               T
        # tax3
        tax1.include_base_amount = True
        tax2.include_base_amount = True
        with self.with_tax_calculation_rounding_method('round_globally'):
            self.assert_taxes_computation(
                {'price_unit': 121.0, 'tax_ids': tax1 + tax2 + tax3},
                {
                    'raw_total_included_currency': 123.0,
                    'raw_total_excluded_currency': 99.0,
                    'taxes_data': (
                        {'raw_base_amount_currency': 99.0, 'raw_tax_amount_currency': 1.0},
                        {'raw_base_amount_currency': 100.0, 'raw_tax_amount_currency': 21.0},
                        {'raw_base_amount_currency': 121.0, 'raw_tax_amount_currency': 2.0},
                    ),
                },
            )
        self._run_js_tests()

    def test_adapt_price_unit_to_another_taxes(self):
        tax_fixed_incl = self.fixed_tax(10, price_include_override='tax_included')
        tax_fixed_excl = self.fixed_tax(10, price_include_override='tax_excluded')
        tax_include_src = self.percent_tax(21, price_include_override='tax_included')
        tax_include_dst = self.percent_tax(6, price_include_override='tax_included')
        tax_exclude_src = self.percent_tax(15, price_include_override='tax_excluded')
        tax_exclude_dst = self.percent_tax(21, price_include_override='tax_excluded')

        self.assert_adapt_price_unit_to_another_taxes(
            121.0,
            tax_include_src,
            tax_include_dst,
            106.0,
        )
        self.assert_adapt_price_unit_to_another_taxes(
            100.0,
            tax_exclude_src,
            tax_include_dst,
            100.0,
        )
        self.assert_adapt_price_unit_to_another_taxes(
            121.0,
            tax_include_src,
            tax_exclude_dst,
            100.0,
        )
        self.assert_adapt_price_unit_to_another_taxes(
            100.0,
            tax_exclude_src,
            tax_exclude_dst,
            100.0,
        )
        self.assert_adapt_price_unit_to_another_taxes(
            100.0,
            tax_fixed_incl + tax_exclude_src,
            tax_fixed_incl + tax_include_dst,
            100.0,
        )
        self.assert_adapt_price_unit_to_another_taxes(
            100.0,
            tax_fixed_excl + tax_include_src,
            tax_fixed_excl + tax_exclude_dst,
            100.0,
        )
        self._run_js_tests()
