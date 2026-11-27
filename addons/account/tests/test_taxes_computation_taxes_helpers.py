from odoo import Command
from odoo.addons.account.models.account_tax__taxes_helpers import sum_and_distribute_amounts_to
from odoo.addons.account.tests.common import TestTaxCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesComputationTaxesHelpers(TestTaxCommon):

    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['ir.config_parameter'].sudo().set_bool('account.use_new_taxes_engine', True)
        cls.env.company.tax_calculation_rounding_method = 'round_globally'

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

        tax_fixed_incl.include_base_amount = True
        tax_fixed_excl.include_base_amount = True

        self.assert_adapt_price_unit_to_another_taxes(
            133.1,
            tax_fixed_incl + tax_include_src,
            tax_fixed_excl + tax_exclude_dst,
            100.0,
        )

        self._run_js_tests()

    def test_global_discount_100_percent_cash_rounding_up(self):
        """A 100% discount + round-up cash rounding must keep the total at 0: the base + tax
        residue left by the discount must not be inflated into a full rounding step."""
        tax = self.percent_tax(17)
        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 11.752137, 'tax_ids': tax},
                {'price_unit': 21.367521, 'tax_ids': tax},
            ],
            cash_rounding=self.cash_rounding_a,  # add_invoice_line, rounding 0.05, method 'UP'
        ))
        self.assert_global_discount_base_lines_tax_details(
            document=document,
            amount_type='percent',
            amount=100,
            expected_base_lines_tax_details=None,
            expected_base_amount=0.0,
            expected_tax_amount=0.0,
            expected_total_amount=0.0,
        )

        self._run_js_tests()

    def test_down_payment_taxes_fixed_tax_last_position(self):
        tax1 = self.percent_tax(20)
        tax2 = self.fixed_tax(10)
        taxes = tax1 + tax2

        document_params = self.init_document(lines=[{'price_unit': 100.0, 'tax_ids': taxes}])
        document = self.populate_document(document_params)

        self.assert_down_payment_base_lines_tax_details(
            document=document,
            amount_type='percent',
            amount=50.0,
            expected_base_lines_tax_details=None,
            expected_base_amount=50.0,
            expected_tax_amount=10.0,
            expected_total_amount=60.0,
        )

        tax2.include_base_amount = True

        self.assert_down_payment_base_lines_tax_details(
            document=document,
            amount_type='percent',
            amount=50.0,
            expected_base_lines_tax_details=None,
            expected_base_amount=50.0,
            expected_tax_amount=10.0,
            expected_total_amount=60.0,
        )

        self._run_js_tests()

    def test_down_payment_no_tax(self):
        document_params = self.init_document(lines=[
            {'price_unit': 35.0},
            {'price_unit': -5.0},
            {'price_unit': 30.0},
            {'price_unit': 15.0},
            {'price_unit': 15.0},
        ])
        document = self.populate_document(document_params)

        self.assert_down_payment_base_lines_tax_details(
            document=document,
            amount_type='percent',
            amount=50.0,
            expected_base_lines_tax_details=None,
            expected_base_amount=45.0,
            expected_tax_amount=0.0,
            expected_total_amount=45.0,
        )

        self._run_js_tests()

    def test_down_payment_fixed_amount_reverse_charge_tax(self):
        tax = self.percent_tax(
            21,
            invoice_repartition_line_ids=[
                Command.create({'factor_percent': 100, 'repartition_type': 'base'}),
                Command.create({'factor_percent': 100, 'repartition_type': 'tax'}),
                Command.create({'factor_percent': -100, 'repartition_type': 'tax'}),
            ],
            refund_repartition_line_ids=[
                Command.create({'factor_percent': 100, 'repartition_type': 'base'}),
                Command.create({'factor_percent': 100, 'repartition_type': 'tax'}),
                Command.create({'factor_percent': -100, 'repartition_type': 'tax'}),
            ],
        )

        document_params = self.init_document(lines=[{'price_unit': 12.0, 'tax_ids': tax}])
        document = self.populate_document(document_params)

        self.assert_down_payment_base_lines_tax_details(
            document=document,
            amount_type='fixed',
            amount=3.0,
            expected_base_lines_tax_details=[
                {
                    'total_excluded_currency': 3.0,
                    'delta_total_excluded_currency': 0.0,
                    'taxes_data': [
                        {
                            'tax_id': tax.id,
                            'tax_amount_currency': 0.63,
                            'base_amount_currency': 3.0,
                        },
                        {
                            'tax_id': tax.id,
                            'tax_amount_currency': -0.63,
                            'base_amount_currency': 3.0,
                        },
                    ],
                }
            ],
            expected_base_amount=3.0,
            expected_tax_amount=0.0,
            expected_total_amount=3.0,
        )
        self._run_js_tests()

    def test_include_base_amount_in_aggregate_base_line_tax_details(self):
        """ Test that the tax amount from a tax that is affecting the base of subsequent taxes
        is correctly propagated in '_aggregate_base_line_tax_details'
        """
        AccountTax = self.env['account.tax']
        tax_20 = self.percent_tax(20, include_base_amount=True)
        tax_18 = self.percent_tax(18)
        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 2000.0, 'quantity': 5, 'discount': 20.0, 'tax_ids': tax_20 + tax_18},
            ],
        ))
        AccountTax._add_tax_details(document['lines'], self.env.company)

        def tax_grouping_function(base_line, tax_data):
            if not tax_data:
                return None
            return {
                'amount': tax_data['tax'].amount,
            }

        aggregated_data = AccountTax._aggregate_base_line_tax_details(document['lines'][0], tax_grouping_function)
        expected_values = [{
            'base_amount': 8000.0,
            'base_amount_currency': 8000.0,
            'raw_base_amount': 8000.0,
            'raw_base_amount_currency': 8000.0,
            'raw_tax_amount': 1600.0,
            'raw_tax_amount_currency': 1600.0,
            'raw_total_excluded': 8000.0,
            'raw_total_excluded_currency': 8000.0,
            'target_base_amount': 8000.0,
            'target_base_amount_currency': 8000.0,
            'target_tax_amount': 1600.0,
            'target_tax_amount_currency': 1600.0,
            'target_total_excluded': 8000.0,
            'target_total_excluded_currency': 8000.0,
            'tax_amount': 1600.0,
            'tax_amount_currency': 1600.0,
            'total_excluded': 8000.0,
            'total_excluded_currency': 8000.0,
        }, {
            'base_amount': 9600.0,
            'base_amount_currency': 9600.0,
            'raw_base_amount': 9600.0,
            'raw_base_amount_currency': 9600.0,
            'raw_tax_amount': 1728.0,
            'raw_tax_amount_currency': 1728.0,
            'raw_total_excluded': 9600.0,
            'raw_total_excluded_currency': 9600.0,
            'target_base_amount': 9600.0,
            'target_base_amount_currency': 9600.0,
            'target_tax_amount': 1728.0,
            'target_tax_amount_currency': 1728.0,
            'target_total_excluded': 9600.0,
            'target_total_excluded_currency': 9600.0,
            'tax_amount': 1728.0,
            'tax_amount_currency': 1728.0,
            'total_excluded': 9600.0,
            'total_excluded_currency': 9600.0,
        }]
        for i, data in enumerate(aggregated_data.values()):
            for key in ('grouping_key', 'taxes_data'):
                data.pop(key)
            self.assertDictEqual(expected_values[i], data)

    def test_sum_and_distribute_amounts_to(self):
        def assert_factors(result, expected):
            self.assertEqual([round(x['amount'], 8) for x in result], expected)

        result = sum_and_distribute_amounts_to(
            amounts=[0.03],
            factors=[],
            rounding=0.01,
        )
        assert_factors(result, [])

        result = sum_and_distribute_amounts_to(
            amounts=[0.13, -0.03],
            factors=[{'factor': 3}, {'factor': 7}],
            rounding=0.01,
        )
        assert_factors(result, [0.03, 0.07])

        result = sum_and_distribute_amounts_to(
            amounts=[5],
            factors=[{'factor': 12}, {'factor': -7}],
            rounding=0.01,
        )
        assert_factors(result, [12.0, -7.0])

        result = sum_and_distribute_amounts_to(
            amounts=[5, 10],
            factors=[{'factor': 0}],
            rounding=0.01,
        )
        assert_factors(result, [0.0])

    def test_export_import_extra_tax_data(self):
        AccountTax = self.env['account.tax']

        tax = self.percent_tax(20)

        document = self.populate_document(self.init_document(lines=[
            {'price_unit': 10.0, 'tax_ids': tax},
            {'price_unit': 30.0},
        ]))
        document['lines'][0]['tax_details']['taxes_data'][0]['tax_amount_currency'] += 0.01
        document['lines'][1]['tax_details']['delta_total_excluded_currency'] += 0.01
        AccountTax._fix_base_lines_tax_details_on_manual_tax_amounts(document['lines'], self.env.company)

        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[
                {
                    'total_excluded_currency': 10.0,
                    'delta_total_excluded_currency': 0.0,
                    'taxes_data': [
                        {
                            'tax_id': tax.id,
                            'base_amount_currency': 10.0,
                            'tax_amount_currency': 2.01,
                        },
                    ],
                },
                {
                    'total_excluded_currency': 30.01,
                    'delta_total_excluded_currency': 0.0,
                    'taxes_data': [],
                },
            ],
            expected_base_amount=40.01,
            expected_tax_amount=2.01,
            expected_total_amount=42.02,
        )

        document['lines'][0] = AccountTax._prepare_base_line_for_taxes_computation(
            document['lines'][0],
            price_unit=10.01,
            extra_tax_data=AccountTax._export_base_line_extra_tax_data(document['lines'][0]),
        )
        AccountTax._add_tax_details(document['lines'], self.env.company)

        self.assert_base_lines_tax_details(
            document=document,
            expected_base_lines_tax_details=[
                {
                    'total_excluded_currency': 10.01,
                    'delta_total_excluded_currency': 0.0,
                    'taxes_data': [
                        {
                            'tax_id': tax.id,
                            'base_amount_currency': 10.01,
                            'tax_amount_currency': 2.0,
                        },
                    ],
                },
                {
                    'total_excluded_currency': 30.01,
                    'delta_total_excluded_currency': 0.0,
                    'taxes_data': [],
                },
            ],
            expected_base_amount=40.02,
            expected_tax_amount=2.0,
            expected_total_amount=42.02,
        )
