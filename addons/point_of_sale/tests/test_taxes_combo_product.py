from odoo import Command
from odoo.addons.account.tests.test_taxes_combo_product import TestTaxesComboProduct
from odoo.addons.point_of_sale.tests.test_frontend import TestTaxCommonPOS
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestTaxesComboProductPos(TestTaxCommonPOS, TestTaxesComboProduct):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

    def test_taxes_l10n_be_pos(self):
        tests = self._test_taxes_l10n_be()
        for i, test in enumerate(tests, start=1):
            self.ensure_products_on_document(test[1], f'product_{i}')
            self.ensure_combo_products_on_document(test[1], test[2], f'product_combo_{i}')
        self.assert_pos_orders_and_invoices(
            tour='test_taxes_l10n_be_pos',
            tests_with_orders=list(tests),
        )

    def test_change_pricelist_pos(self):
        percent_tax = self.percent_tax(21.0)

        product_1 = self.create_product(
            name="product_1",
            list_price=700.0,
            taxes=percent_tax,
        )
        product_2 = self.create_product(
            name="product_2",
            list_price=400.0,
        )
        combo_choice_1 = self.env['product.combo'].create({
            'name': "test_change_of_pricelist_pos_1",
            'combo_item_ids': [Command.create({'product_id': product_1.id})],
        })
        combo_choice_2 = self.env['product.combo'].create({
            'name': "test_change_of_pricelist_pos_2",
            'combo_item_ids': [Command.create({'product_id': product_2.id})],
        })
        combo = self.create_product(
            name="test_change_of_pricelist_pos",
            list_price=1000.0,
            type='combo',
            combo_ids=[Command.set((combo_choice_1 + combo_choice_2).ids)],
        )

        config = self.main_pos_config
        config.use_pricelist = True
        default_pricelist = config.pricelist_id
        default_pricelist.item_ids = [
            Command.create({
                'compute_price': 'fixed',
                'fixed_price': 500.0,
                'product_tmpl_id': product_1.product_tmpl_id.id,
            }),
            Command.create({
                'compute_price': 'fixed',
                'fixed_price': 700.0,
                'product_tmpl_id': combo.product_tmpl_id.id,
            }),
        ]
        another_pricelist = self.env['product.pricelist'].create({
            'name': "another_pricelist",
            'item_ids': [
                Command.create({
                    'compute_price': 'fixed',
                    'fixed_price': 200.0,
                    'product_tmpl_id': product_1.product_tmpl_id.id,
                }),
                Command.create({
                    'compute_price': 'fixed',
                    'fixed_price': 300.0,
                    'product_tmpl_id': combo.product_tmpl_id.id,
                }),
            ],
        })
        another_pricelist_global_discount = self.env['product.pricelist'].create({
            'name': "another_pricelist_global_discount",
            'item_ids': [
                Command.create({
                    'base': 'pricelist',
                    'compute_price': 'percentage',
                    'applied_on': '3_global',
                    'percent_price': 10.0,
                }),
            ],
        })
        config.available_pricelist_ids = [Command.set((default_pricelist + another_pricelist + another_pricelist_global_discount).ids)]

        self.assert_pos_orders_and_invoices(
            tour='test_change_pricelist_pos',
            tests_with_orders=[
                (
                    'another_pricelist_global_discount',
                    {
                        'total_amount_currency': 1020.27,
                        'tax_amount_currency': 120.27,
                    },
                ),
                (
                    'test_change_pricelist_pos_another_pricelist',
                    {
                        'total_amount_currency': 321.0,
                        'tax_amount_currency': 21.0,
                    },
                ),
                (
                    'test_change_pricelist_pos_default_pricelist',
                    {
                        'total_amount_currency': 781.67,
                        'tax_amount_currency': 81.67,
                    },
                ),
            ],
        )
