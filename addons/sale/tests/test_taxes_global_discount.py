from odoo import Command
from odoo.exceptions import ValidationError
from odoo.tests import tagged

from odoo.addons.account.tests.test_taxes_global_discount import TestTaxesGlobalDiscount
from odoo.addons.sale.tests.common import TestTaxCommonSale


@tagged('post_install', '-at_install')
class TestTaxesGlobalDiscountSale(TestTaxCommonSale, TestTaxesGlobalDiscount):

    # -------------------------------------------------------------------------
    # GENERIC TAXES TEST SUITE
    # -------------------------------------------------------------------------

    def test_taxes_l10n_in_sale_orders(self):
        for test_mode, document, soft_checking, amount_type, amount, expected_values in self._test_taxes_l10n_in():
            with self.subTest(test_code=test_mode, amount=amount):
                sale_order = self.convert_document_to_sale_order(document)
                sale_order.action_confirm()
                self.apply_sale_order_discount(sale_order, amount_type, amount)
                self._assert_tax_totals_summary(sale_order.tax_totals, expected_values, soft_checking=soft_checking)

    def test_taxes_l10n_br_sale_orders(self):
        for test_mode, document, soft_checking, amount_type, amount, expected_values in self._test_taxes_l10n_br():
            with self.subTest(test_code=test_mode, amount=amount):
                sale_order = self.convert_document_to_sale_order(document)
                sale_order.action_confirm()
                self.apply_sale_order_discount(sale_order, amount_type, amount)
                self._assert_tax_totals_summary(sale_order.tax_totals, expected_values, soft_checking=soft_checking)

    def test_taxes_l10n_be_sale_orders(self):
        for test_mode, document, soft_checking, amount_type, amount, expected_values in self._test_taxes_l10n_be():
            with self.subTest(test_code=test_mode, amount=amount):
                sale_order = self.convert_document_to_sale_order(document)
                sale_order.action_confirm()
                self.apply_sale_order_discount(sale_order, amount_type, amount)
                self._assert_tax_totals_summary(sale_order.tax_totals, expected_values, soft_checking=soft_checking)

    # -------------------------------------------------------------------------
    # SPECIFIC TESTS
    # -------------------------------------------------------------------------

    def test_global_discount_with_sol_discount(self):
        product = self.company_data['product_order_cost']
        so = self.env['sale.order'].create({
            'partner_id': self.partner_a.id,
            'order_line': [
                # Standalone line with a discount already:
                Command.create({
                    'name': 'line_1',
                    'product_id': product.id,
                    'price_unit': 1000.0,
                    'discount': 50.0,
                }),
                # Standalone line without any discount:
                Command.create({
                    'name': 'line_2',
                    'product_id': product.id,
                    'price_unit': 2000.0,
                }),
            ],
        })
        so.action_confirm()
        self.assertRecordValues(so, [{
            'amount_untaxed': 2500.0,
            'amount_tax': 0.0,
            'amount_total': 2500.0,
        }])

        # Put a discount of 30% on all SO lines.
        wizard = self.env['sale.order.discount'].create({
            'sale_order_id': so.id,
            'discount_type': 'sol_discount',
            'discount_percentage': 0.3,
        })
        wizard.action_apply_discount()

        self.assertRecordValues(so.order_line, [
            {'name': 'line_1', 'discount': 30.0},
            {'name': 'line_2', 'discount': 30.0},
        ])
        self.assertRecordValues(so, [{
            'amount_untaxed': 2100.0,
            'amount_tax': 0.0,
            'amount_total': 2100.0,
        }])

        # Use the same wizard to clear the discount.
        wizard.discount_percentage = 0.0
        wizard.action_apply_discount()

        self.assertRecordValues(so.order_line, [
            {'name': 'line_1', 'discount': 0.0},
            {'name': 'line_2', 'discount': 0.0},
        ])
        self.assertRecordValues(so, [{
            'amount_untaxed': 3000.0,
            'amount_tax': 0.0,
            'amount_total': 3000.0,
        }])

        # Try to put a percentage higher than 100%.
        with self.assertRaises(ValidationError):
            wizard.discount_percentage = 110.0
