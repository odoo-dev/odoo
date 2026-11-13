from odoo.tests import tagged

from odoo.addons.account.models.account_tax import TAX_REPRESENTATION_PROFILE
from odoo.addons.account.tests.common import TestTaxCommon


@tagged('post_install', '-at_install')
class TestTaxesBaseLinesTaxDetails(TestTaxCommon):

    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.env.company.tax_rounding_policy = 'document'

    def test_dispatch_delta_on_base_lines(self):
        """ Make sure that the base line delta is dispatched evenly on base lines.
        Needed for BIS3 rule PEPPOL-EN16931-R120.
        """
        tax_21 = self.percent_tax(21.0)
        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 10.04, 'discount': 10, 'tax_ids': tax_21},
            ] + [
                {'price_unit': 1.04, 'discount': 10, 'tax_ids': tax_21},
            ] * 10,
        ))

        line_1_expected_values = {
            'total_excluded': 9.01,
            'total_excluded_currency': 9.01,
            'total_included': 10.88,
            'total_included_currency': 10.88,
            'pins': None,
            'taxes_data': [
                {
                    'tax_id': tax_21.id,
                    'tax_amount': 1.8699999999999999,
                    'tax_amount_currency': 1.8699999999999999,
                    'base_amount': 9.01,
                    'base_amount_currency': 9.01,
                }
            ],
        }
        line_2_expected_values = {
            'total_excluded': 0.94,
            'total_excluded_currency': 0.94,
            'total_included': 1.14,
            'total_included_currency': 1.14,
            'pins': None,
            'taxes_data': [
                {
                    'tax_id': tax_21.id,
                    'tax_amount': 0.2,
                    'tax_amount_currency': 0.2,
                    'base_amount': 0.94,
                    'base_amount_currency': 0.94,
                }
            ],
        }

        expected_values = {
            'base_lines_tax_details': [
                line_1_expected_values,
                {
                    **line_2_expected_values,
                    'total_excluded': 0.93,
                    'total_excluded_currency': 0.93,
                    'total_included': 1.12,
                    'total_included_currency': 1.12,
                    'taxes_data': [
                        {
                            'tax_id': tax_21.id,
                            'tax_amount': 0.19,
                            'tax_amount_currency': 0.19,
                            'base_amount': 0.9299999999999999,
                            'base_amount_currency': 0.9299999999999999,
                        }
                    ],
                },
                line_2_expected_values,
                line_2_expected_values,
                line_2_expected_values,
                line_2_expected_values,
                line_2_expected_values,
                line_2_expected_values,
                line_2_expected_values,
                line_2_expected_values,
                line_2_expected_values,
            ]
        }

        self.assert_base_lines_tax_details(document, expected_values)
        self._run_js_tests()

    def test_distribute_delta_amount_smoothly_ties(self):
        """ A share falling exactly on a half unit is rounded the same way on both sides (to the even
        integer, like the python builtin 'round'), so python and javascript spread a delta identically.
        """
        self.assert_distribute_delta_amount_smoothly(3, 0.03, [0.4, 0.3, 0.3], [0.012, 0.009, 0.009])
        # 0.025 is 2.5 cents: 2 of them are spread by factor, not 3.
        self.assert_distribute_delta_amount_smoothly(2, 0.025, [1.0], [0.02])
        # The second and third factors each get half a cent, rounded to 0: the leftover cent goes to the biggest factor.
        self.assert_distribute_delta_amount_smoothly(2, 0.02, [0.5, 0.25, 0.25], [0.02, 0.0, 0.0])
        self.assert_distribute_delta_amount_smoothly(2, -0.02, [0.5, 0.25, 0.25], [-0.02, 0.0, 0.0])
        self._run_js_tests()

    def test_check_tax_representation(self):
        """ The identities of a representation profile are checked with their tolerance, the failures being returned. """
        AccountTax = self.env['account.tax']
        tax_15 = self.percent_tax(15.0)
        with self.with_tax_rounding_policy('line'):
            # Each line has a tax of round(0.0225) = 0.02, so 0.20 in total for a base of 1.50, i.e. 0.23 of tax.
            document = self.populate_document(self.init_document(
                lines=[{'price_unit': 0.15, 'tax_ids': tax_15}] * 10,
            ))
        base_lines = document['lines']
        AccountTax._represent_tax_details(base_lines, self.env.company, {**TAX_REPRESENTATION_PROFILE, 'gross_amounts': 'raw'})

        def failed_rules(*identities):
            profile = {**TAX_REPRESENTATION_PROFILE, 'identities': identities}
            return [violation['rule'] for violation in AccountTax._represent_tax_details(base_lines, self.env.company, profile)]

        self.assertEqual(failed_rules(('exact', 'tax_is_base_x_rate', 'exact')), ['exact'])
        self.assertEqual(failed_rules(('abs', 'tax_is_base_x_rate', ('abs', 0.01))), ['abs'])
        self.assertEqual(failed_rules(('abs', 'tax_is_base_x_rate', ('abs', 0.03))), [])
        self.assertEqual(failed_rules(('propagated', 'tax_is_base_x_rate', 'propagated')), ['propagated'])
        self.assertEqual(failed_rules(
            ('lines', 'line_net_is_qty_x_price', 'exact'),
            ('sum', 'base_is_sum_of_lines', 'exact'),
        ), [])

        # A line amount moved away from the booked amounts by the format.
        base_lines[0]['tax_details']['raw_gross_total_excluded_currency'] += 0.02
        base_lines[0]['tax_details']['gross_total_excluded_currency'] = base_lines[0]['tax_details']['raw_gross_total_excluded_currency']
        self.assertEqual(failed_rules(
            ('lines', 'line_net_is_qty_x_price', ('abs', 0.01)),
            ('sum', 'base_is_sum_of_lines', ('abs', 0.01)),
        ), ['lines', 'sum'])
        self.assertEqual(failed_rules(
            ('lines', 'line_net_is_qty_x_price', ('abs', 0.02)),
            ('sum', 'base_is_sum_of_lines', ('abs', 0.02)),
        ), [])

    def test_dispatch_delta_on_net_zero_tax(self):
        """Check that the base line delta still is dispatched if net tax is zero."""
        def get_expected_values(base_values, tax):
            expected_tax_total = sum(values[2] for values in base_expected_values)
            self.assertTrue(
                tax.company_id.currency_id.is_zero(expected_tax_total),
                "Expected taxes should add up to zero.",
            )
            return {
                'base_lines_tax_details': [{
                    'pins': None,
                    'taxes_data': [{
                        'base_amount': total_excluded,
                        'base_amount_currency': total_excluded,
                        'tax_amount': tax_amount,
                        'tax_amount_currency': tax_amount,
                        'tax_id': tax.id,
                    }],
                    'total_excluded': total_excluded,
                    'total_excluded_currency': total_excluded,
                    'total_included': total_included,
                    'total_included_currency': total_included,
                } for total_excluded, total_included, tax_amount in base_values],
            }

        with self.subTest("19.99% tax, 100% global discount"):
            tax_19_99 = self.percent_tax(19.99)
            lines_vals = [{
                'price_unit': price,
                'quantity': 1,
                'tax_ids': tax_19_99,
            } for price in (19.99, 19.99, -39.98)]
            document = self.populate_document(self.init_document(lines_vals))

            base_expected_values = [
            #   (total_excluded, total_included, tax_amount),
                (19.99, 23.99, 4.0),
                (19.99, 23.99, 4.0),
                (-39.98, -47.98, -8.0),
            ]
            expected_values = get_expected_values(base_expected_values, tax_19_99)
            self.assert_base_lines_tax_details(document, expected_values)
            self._run_js_tests()

        with self.subTest("7% tax, 30% line discount, 100% global discount"):
            tax_7 = self.percent_tax(7.0)
            lines_vals = [{
                'price_unit': price,
                'quantity': 4,
                'discount': 30,
                'tax_ids': tax_7,
            } for price in (1068, 46, 46, 298, 5)]
            lines_vals.append({'price_unit': -4096.4, 'tax_ids': tax_7})  # 100% discount
            document = self.populate_document(self.init_document(lines_vals))

            base_expected_values = [
            #   (total_excluded, total_included, tax_amount),
                (2990.4, 3199.73, 209.33),
                (128.8, 137.82, 9.02),
                (128.8, 137.82, 9.02),
                (834.4, 892.81, 58.41),
                (14.0, 14.98, 0.98),
                (-4096.4, -4383.16, -286.76),
            ]
            expected_values = get_expected_values(base_expected_values, tax_7)
            self.assert_base_lines_tax_details(document, expected_values)
            self._run_js_tests()

    def test_global_discount_raw_gross_total_excluded(self):
        """ Tests to ensure expected raw_gross_total_excluded is calculated
        correctly with both line discounts and global discounts
        """
        AccountTax = self.env['account.tax']
        company = self.env.company

        document = self.populate_document(self.init_document(lines=[
            {'price_unit': 100.0, 'quantity': 1.0, 'discount': 10.0},
            {'price_unit': -10.0, 'quantity': 1.0, 'special_type': 'global_discount'},
        ]))
        base_lines = document['lines']

        base_lines = AccountTax._dispatch_global_discount_lines(base_lines, company)
        AccountTax._squash_global_discount_lines(base_lines, company)
        AccountTax._represent_tax_details(base_lines, company, {
            **TAX_REPRESENTATION_PROFILE,
            'currencies': ('foreign', 'company'),
            'gross_amounts': 'raw',
            'dispatched_global_discounts': True,
        })

        self.assertEqual(len(base_lines), 1)
        tax_details = base_lines[0]['tax_details']

        self.assertEqual(tax_details['raw_gross_total_excluded'], 100)
        self.assertEqual(tax_details['raw_gross_price_unit'], 100)
        self.assertEqual(tax_details['raw_discount_amount'], 20)

    def test_include_base_amount_in_aggregate_tax_details(self):
        """ Test that the tax amount from a tax that is affecting the base of subsequent taxes
        is correctly propagated in '_aggregate_tax_details'
        """
        AccountTax = self.env['account.tax']
        tax_20 = AccountTax.create({
            'name': 'tax_20',
            'sequence': -1,
            'amount_type': 'percent',
            'amount': 20,
            'include_base_amount': True,
        })
        tax_18 = AccountTax.create({
            'name': 'tax_18',
            'amount_type': 'percent',
            'amount': 18,
        })
        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 2000.0, 'quantity': 5, 'discount': 20.0, 'tax_ids': tax_20 + tax_18},
            ],
        ))

        def tax_grouping_function(base_line, tax_data):
            if not tax_data:
                return None
            return {
                'amount': tax_data['tax'].amount,
            }

        aggregated_data = AccountTax._aggregate_tax_details([document['lines'][0]], tax_grouping_function)
        expected_values = [{
            'grouping_key': {'amount': 20.0},
            'taxes_data': [{
                'base_amount': 8000.0,
                'base_amount_currency': 8000.0,
                'batch': tax_20,
                'group': AccountTax,
                'is_reverse_charge': False,
                'original_price_include': False,
                'price_include': False,
                'raw_base_amount': 8000.0,
                'raw_base_amount_currency': 8000.0,
                'raw_tax_amount': 1600.0,
                'raw_tax_amount_currency': 1600.0,
                'tax': tax_20,
                'tax_amount': 1600.0,
                'tax_amount_currency': 1600.0,
                'taxes': tax_18,
            }],
            'base_amount': 8000.0,
            'base_amount_currency': 8000.0,
            'raw_base_amount': 8000.0,
            'raw_base_amount_currency': 8000.0,
            'raw_tax_amount': 1600.0,
            'raw_tax_amount_currency': 1600.0,
            'raw_total_excluded': 8000.0,
            'raw_total_excluded_currency': 8000.0,
            'tax_amount': 1600.0,
            'tax_amount_currency': 1600.0,
            'total_excluded': 8000.0,
            'total_excluded_currency': 8000.0,
        }, {
            'grouping_key': {'amount': 18.0},
            'taxes_data': [{
                'base_amount': 9600.0,
                'base_amount_currency': 9600.0,
                'group': AccountTax,
                'is_reverse_charge': False,
                'original_price_include': False,
                'batch': tax_18,
                'price_include': False,
                'raw_base_amount': 9600.0,
                'raw_base_amount_currency': 9600.0,
                'raw_tax_amount': 1728.0,
                'raw_tax_amount_currency': 1728.0,
                'tax': tax_18,
                'tax_amount': 1728.0,
                'tax_amount_currency': 1728.0,
                'taxes': AccountTax,
            }],
            'base_amount': 9600.0,
            'base_amount_currency': 9600.0,
            'raw_base_amount': 9600.0,
            'raw_base_amount_currency': 9600.0,
            'raw_tax_amount': 1728.0,
            'raw_tax_amount_currency': 1728.0,
            'raw_total_excluded': 9600.0,
            'raw_total_excluded_currency': 9600.0,
            'tax_amount': 1728.0,
            'tax_amount_currency': 1728.0,
            'total_excluded': 9600.0,
            'total_excluded_currency': 9600.0,
        }]
        for i, data in enumerate(aggregated_data.values()):
            self.assertDictEqual(expected_values[i], {key: value for key, value in data.items() if key != 'base_line_x_taxes_data'})
