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
        self.env.company.tax_calculation_rounding_method = 'round_globally'
        tax1 = self.fixed_tax(1, include_base_amount=True, tax_group_id=self.tax_groups[0].id)
        tax2 = self.percent_tax(21, tax_group_id=self.tax_groups[1].id)
        taxes = tax1 + tax2

        # document = self.populate_document(self.init_document(
        #     lines=[
        #         {'price_unit': 99.0,    'tax_ids': taxes,       '_combo_extra_price': 0.0},
        #         {'price_unit': 20.0,    'tax_ids': tax2,        '_combo_extra_price': 0.0},
        #     ],
        # ))
        # expected_values = {
        #     'same_tax_base': False,
        #     'currency_id': self.currency.id,
        #     'base_amount_currency': 110.0,
        #     'tax_amount_currency': 24.31,
        #     'total_amount_currency': 134.31,
        #     'subtotals': [
        #         {
        #             'name': "Untaxed Amount",
        #             'base_amount_currency': 110.0,
        #             'tax_amount_currency': 24.31,
        #             'tax_groups': [
        #                 {
        #                     'id': self.tax_groups[0].id,
        #                     'base_amount_currency': 91.5,  # Should be 99.0 but can't be fixed since we merge lines together.
        #                     'tax_amount_currency': 1.0,
        #                     'display_base_amount_currency': None,
        #                 },
        #                 {
        #                     'id': self.tax_groups[1].id,
        #                     'base_amount_currency': 111.0,
        #                     'tax_amount_currency': 23.31,
        #                     'display_base_amount_currency': 111.0,
        #                 },
        #             ],
        #         },
        #     ],
        # }
        # yield "price_excluded", document, [({0, 1}, 110.0)], expected_values
        #
        # document = self.populate_document(self.init_document(
        #     lines=[
        #         {'price_unit': 99.0,    'tax_ids': taxes,       '_combo_extra_price': 5.0},
        #         {'price_unit': 20.0,    'tax_ids': tax2,        '_combo_extra_price': 0.0},
        #     ],
        # ))
        # expected_values = {
        #     'same_tax_base': False,
        #     'currency_id': self.currency.id,
        #     'base_amount_currency': 115.0,
        #     'tax_amount_currency': 25.36,
        #     'total_amount_currency': 140.36,
        #     'subtotals': [
        #         {
        #             'name': "Untaxed Amount",
        #             'base_amount_currency': 115.0,
        #             'tax_amount_currency': 25.36,
        #             'tax_groups': [
        #                 {
        #                     'id': self.tax_groups[0].id,
        #                     'base_amount_currency': 95.64,  # Should be 99.0 but can't be fixed since we merge lines together.
        #                     'tax_amount_currency': 1.0,
        #                     'display_base_amount_currency': None,
        #                 },
        #                 {
        #                     'id': self.tax_groups[1].id,
        #                     'base_amount_currency': 116.0,
        #                     'tax_amount_currency': 24.36,
        #                     'display_base_amount_currency': 116.0,
        #                 },
        #             ],
        #         },
        #     ],
        # }
        # yield "price_excluded, extra_price", document, [({0, 1}, 110.0)], expected_values
        #
        # document = self.populate_document(self.init_document(
        #     lines=[
        #         {'price_unit': 10.0,    'quantity': 3,  'tax_ids': taxes,       '_combo_extra_price': 1.0},
        #         {'price_unit': 10.0,    'quantity': 2,  'tax_ids': taxes,       '_combo_extra_price': 1.0},
        #     ],
        # ))
        # expected_values = {
        #     'same_tax_base': False,
        #     'currency_id': self.currency.id,
        #     'base_amount_currency': 45.0,
        #     'tax_amount_currency': 15.5,
        #     'total_amount_currency': 60.5,
        #     'subtotals': [
        #         {
        #             'name': "Untaxed Amount",
        #             'base_amount_currency': 45.0,
        #             'tax_amount_currency': 15.5,
        #             'tax_groups': [
        #                 {
        #                     'id': self.tax_groups[0].id,
        #                     'base_amount_currency': 45.0,  # Should be 50.0 but can't be fixed since we merge lines together.
        #                     'tax_amount_currency': 5.0,
        #                     'display_base_amount_currency': None,
        #                 },
        #                 {
        #                     'id': self.tax_groups[1].id,
        #                     'base_amount_currency': 50.0,
        #                     'tax_amount_currency': 10.5,
        #                     'display_base_amount_currency': 50.0,
        #                 },
        #             ],
        #         },
        #     ],
        # }
        # yield "price_excluded, extra_price, quantity on child", document, [({0, 1}, 40.0)], expected_values
        #
        # document = self.populate_document(self.init_document(
        #     lines=[
        #         {'price_unit': 16.79,   'tax_ids': taxes,       '_combo_extra_price': 0.0},
        #         {'price_unit': 17.79,   'tax_ids': tax2,        '_combo_extra_price': 0.0},
        #         {'price_unit': 16.79,   'tax_ids': taxes,       '_combo_extra_price': 0.0},
        #         {'price_unit': 17.79,   'tax_ids': tax2,        '_combo_extra_price': 0.0},
        #     ],
        # ))
        # expected_values = {
        #     'same_tax_base': False,
        #     'currency_id': self.currency.id,
        #     'base_amount_currency': 60.34,
        #     'tax_amount_currency': 15.09,
        #     'total_amount_currency': 75.43,
        #     'subtotals': [
        #         {
        #             'name': "Untaxed Amount",
        #             'base_amount_currency': 60.34,
        #             'tax_amount_currency': 15.09,
        #             'tax_groups': [
        #                 {
        #                     'id': self.tax_groups[0].id,
        #                     'base_amount_currency': 29.17,  # Should be 33.58 but can't be fixed since we merge lines together.
        #                     'tax_amount_currency': 2.0,
        #                     'display_base_amount_currency': None,
        #                 },
        #                 {
        #                     'id': self.tax_groups[1].id,
        #                     'base_amount_currency': 62.34,
        #                     'tax_amount_currency': 13.09,
        #                     'display_base_amount_currency': 62.34,
        #                 },
        #             ],
        #         },
        #     ],
        # }
        # yield "price_excluded, multiple_combos", document, [({0, 1}, 30.17), ({2, 3}, 30.17)], expected_values
        #
        # document = self.populate_document(self.init_document(
        #     lines=[
        #         {'price_unit': 500.0,       'tax_ids': taxes,       '_combo_extra_price': 0.0},
        #         {'price_unit': 400.0,       'tax_ids': [],          '_combo_extra_price': 0.0},
        #     ],
        # ))
        # expected_values = {
        #     'same_tax_base': False,
        #     'currency_id': self.currency.id,
        #     'base_amount_currency': 700.0,
        #     'tax_amount_currency': 82.88,
        #     'total_amount_currency': 782.88,
        #     'subtotals': [
        #         {
        #             'name': "Untaxed Amount",
        #             'base_amount_currency': 700.0,
        #             'tax_amount_currency': 82.88,
        #             'tax_groups': [
        #                 {
        #                     'id': self.tax_groups[0].id,
        #                     'base_amount_currency': 388.89,  # Should be 50.0 but can't be fixed since we merge lines together.
        #                     'tax_amount_currency': 1.0,
        #                     'display_base_amount_currency': None,
        #                 },
        #                 {
        #                     'id': self.tax_groups[1].id,
        #                     'base_amount_currency': 389.89,
        #                     'tax_amount_currency': 81.88,
        #                     'display_base_amount_currency': 389.89,
        #                 },
        #             ],
        #         },
        #     ],
        # }
        # yield "price_excluded, line_with_no_tax", document, [({0, 1}, 700.0)], expected_values

        taxes.price_include_override = 'tax_included'
        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 121.0,   'tax_ids': taxes,       '_combo_extra_price': 0.0},
                {'price_unit': 24.2,    'tax_ids': tax2,        '_combo_extra_price': 0.0},
            ],
        ))
        expected_values = {
            'same_tax_base': False,
            'currency_id': self.currency.id,
            'base_amount_currency': 90.91,
            'tax_amount_currency': 20.3,
            'total_amount_currency': 111.21,
            'subtotals': [
                {
                    'name': "Untaxed Amount",
                    'base_amount_currency': 90.91,
                    'tax_amount_currency': 20.3,
                    'tax_groups': [
                        {
                            'id': self.tax_groups[0].id,
                            'base_amount_currency': 75.59,  # Should be 90.91 but can't be fixed since we merge lines together.
                            'tax_amount_currency': 1.0,
                            'display_base_amount_currency': None,
                        },
                        {
                            'id': self.tax_groups[1].id,
                            'base_amount_currency': 91.91,
                            'tax_amount_currency': 19.3,
                            'display_base_amount_currency': 91.91,
                        },
                    ],
                },
            ],
        }
        yield "price_included", document, [({0, 1}, 110.0)], expected_values

    def test_taxes_l10n_be_generic_helpers(self):
        for test_mode, document, line_indexes_combo_price, expected_values in self._test_taxes_l10n_be():
            with self.subTest(test_code=test_mode):
                self.assert_combo_product(document, line_indexes_combo_price, expected_values)
        self._run_js_tests()

    def _test_taxes_l10n_be_certification_blackbox(self):
        """ !!!! THOSE TESTS ARE THERE TO CERTIFY THE USE OF THE BELGIUM BLACKBOX IN ODOO.
        Therefore, they have to stay like this to stay compliant.
        """
        self.env.company.tax_calculation_rounding_method = 'round_globally'
        tax_12 = self.percent_tax(12, price_include_override='tax_included', tax_group_id=self.tax_groups[0].id)
        tax_21 = self.percent_tax(21, price_include_override='tax_included', tax_group_id=self.tax_groups[1].id)

        document = self.populate_document(self.init_document(
            lines=[
                {'price_unit': 20.0,    'tax_ids': tax_12,      '_combo_extra_price': 0.0},
                {'price_unit': 28.0,    'tax_ids': tax_12,      '_combo_extra_price': 0.0},
                {'price_unit': 24.0,    'tax_ids': tax_21,      '_combo_extra_price': 0.0},
            ],
        ))
        self.assert_py_tax_totals_summary(document, {
            'same_tax_base': False,
            'currency_id': self.currency.id,
            'base_amount_currency': 62.69,
            'tax_amount_currency': 9.31,
            'total_amount_currency': 72.0,
            'subtotals': [
                {
                    'name': "Untaxed Amount",
                    'base_amount_currency': 62.69,
                    'tax_amount_currency': 9.31,
                    'tax_groups': [
                        {
                            'id': self.tax_groups[0].id,
                            'base_amount_currency': 42.86,
                            'tax_amount_currency': 5.14,
                            'display_base_amount_currency': 42.86,
                        },
                        {
                            'id': self.tax_groups[1].id,
                            'base_amount_currency': 19.83,
                            'tax_amount_currency': 4.17,
                            'display_base_amount_currency': 19.83,
                        },
                    ],
                },
            ],
        })

        expected_values = {
            'same_tax_base': False,
            'currency_id': self.currency.id,
            'base_amount_currency': 50.5,
            'tax_amount_currency': 7.5,
            'total_amount_currency': 58.0,
            'subtotals': [
                {
                    'name': "Untaxed Amount",
                    'base_amount_currency': 50.5,
                    'tax_amount_currency': 7.5,
                    'tax_groups': [
                        {
                            'id': self.tax_groups[0].id,
                            'base_amount_currency': 34.53,
                            'tax_amount_currency': 4.14,
                            'display_base_amount_currency': 34.53,
                        },
                        {
                            'id': self.tax_groups[1].id,
                            'base_amount_currency': 15.97,
                            'tax_amount_currency': 3.36,
                            'display_base_amount_currency': 15.97,
                        },
                    ],
                },
            ],
        }
        yield "price_excluded", document, [({0, 1, 2}, 58.0)], expected_values

    def test_taxes_l10n_be_certification_blackbox_generic_helpers(self):
        for test_mode, document, line_indexes_combo_price, expected_values in self._test_taxes_l10n_be_certification_blackbox():
            with self.subTest(test_code=test_mode):
                self.assert_combo_product(document, line_indexes_combo_price, expected_values)
        self._run_js_tests()
