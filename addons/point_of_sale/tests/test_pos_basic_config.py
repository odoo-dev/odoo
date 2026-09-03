# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo import Command, fields, tests, tools
from odoo.exceptions import ValidationError, UserError
from odoo.tests import Form

from odoo.addons.point_of_sale.tests.common import CommonPosTest


@tests.tagged('post_install', '-at_install')
class TestPoSBasicConfig(CommonPosTest):
    """ Test PoS with basic configuration

    The tests contain base scenarios in using pos.
    More specialized cases are tested in other tests.
    """
    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.config = cls.pos_config
        cls.product0 = cls.create_product('Product 0', cls.categ_basic, 0.0, 0.0)
        cls.product1 = cls.create_product('Product 1', cls.categ_basic, 10.0, 5)
        cls.product2 = cls.create_product('Product 2', cls.categ_basic, 20.0, 10)
        cls.product3 = cls.create_product('Product 3', cls.categ_basic, 30.0, 15)
        cls.product4 = cls.create_product('Product_4', cls.categ_basic, 9.96, 4.98)
        cls.product7 = cls.create_product('Product 7', cls.categ_basic, 7, 7, tax_ids=cls.taxes['tax7'].ids)

        cls.products = cls.product0 | cls.product1 | cls.product2 | cls.product3 | cls.product4
        cls.company_data_2 = cls.setup_other_company()

    def test_pos_session_name_sequencing(self):
        """ This test check if the session name is correctly set according to the sequence """

        sequence = self.env['ir.sequence'].search([('code', '=', 'pos.session')])
        sequence.prefix = '/'
        sequence.write({'number_next_actual': 1000})
        name = self.config.name

        self.open_new_session(0)
        self.assertEqual(self.pos_session.name, name + '/01000')

        self.pos_session.close_session_from_ui()

        sequence.prefix = 'TEST/'

        self.open_new_session(0)
        self.assertEqual(self.pos_session.name, 'TEST/01001')

    def test_load_data_should_not_fail(self):
        """load_data shouldn't fail

        (Include test conditions here if possible)

        - When there are partners that belong to different company
        """

        # create a partner that belongs to different company
        company2 = self.company_data_2['company']
        self.env['res.partner'].create({
            'name': 'Test',
            'company_id': company2.id,
        })

        self.open_new_session()

        # calling load_data should not raise an error
        self.pos_session.load_data()

    def test_load_data_picks_the_company_website_domain(self):
        if self.env['ir.module.module']._get('website').state != 'installed':
            self.skipTest("website module is required for this test")

        company_website = self.config.company_id.website_id

        if company_website:
            company_website.write({'domain': 'https://custom.test.domain.com'})
            self.open_new_session()
            response = self.pos_session.load_data({'only_records': True})

            self.assertEqual(response['pos.config'][0]['_base_url'], company_website.domain)

    def test_limited_products_loading(self):
        self.env['ir.config_parameter'].sudo().set_int('point_of_sale.limited_product_count', 3)

        # Make the service products that are available in the pos inactive.
        # We don't need them to test the loading of 'consu' products.
        self.env['product.template'].search([('available_in_pos', '=', True), ('type', '=', 'service')]).write({'available_in_pos': False})

        session = self.open_new_session(0)
        self.product1.write({'company_id': False})
        self.product2.write({'company_id': False})
        self.product3.write({'company_id': False})

        def get_top_product_ids(count):
            session.config_id.iface_tipproduct = True
            data = session.load_data()
            special_product = session.config_id._get_special_products().ids
            available_top_product = [product for product in data['product.template']['records'] if product['product_variant_ids'][0] not in special_product]
            return [p['product_variant_ids'][0] for p in available_top_product[:count]]

        self.patch(self.env.cr, 'now', lambda: datetime.now() + timedelta(days=1))
        self.env['pos.order'].sync_from_ui([self.create_ui_order_data([(self.product1, 1)])])
        self.assertEqual(get_top_product_ids(1), [self.product1.id])

        self.patch(self.env.cr, 'now', lambda: datetime.now() + timedelta(days=2))
        self.env['pos.order'].sync_from_ui([self.create_ui_order_data([(self.product2, 1)])])
        self.assertEqual(get_top_product_ids(2), [self.product1.id, self.product2.id])

        self.patch(self.env.cr, 'now', lambda: datetime.now() + timedelta(days=3))
        self.env['pos.order'].sync_from_ui([self.create_ui_order_data([(self.product3, 1)])])
        self.assertEqual(get_top_product_ids(3), [self.product1.id, self.product2.id, self.product3.id])

    def test_pos_payment_method_copy(self):
        """
        Test POS payment method copy:
            - Create two payment methods in which one of the payment method's journal type be cash
            - Copy multiple payment methods
            - Check the duplicated cash payment method journal should be empty
        """
        pm_1 = self.cash_pm
        pm_2 = self.bank_pm
        pm_3, pm_4 = (pm_1 + pm_2).copy()

        self.assertTrue(pm_3)
        self.assertFalse(pm_3.journal_id)
        self.assertTrue(pm_4)
        self.assertEqual(pm_4.journal_id.type, "bank")

    def test_single_config_global_invoice(self):
        """For a single POS config, create multiple orders and consolidate them into a single invoice"""
        self.open_new_session()
        # create orders
        orders = []
        orders.extend((
            self.create_ui_order_data([(self.product1, 2), (self.product4, 3)], payments=[(self.bank_pm, 49.88)]),
            self.create_ui_order_data([(self.product4, 1), (self.product2, 5)], payments=[(self.bank_pm, 109.96)])
        ))

        # sync orders
        self.env['pos.order'].sync_from_ui(orders)
        # close the session
        self.pos_session.close_session_from_ui()

        pos_orders = self.env['pos.order'].search([])
        # set customer for the orders
        pos_orders.write({'partner_id': self.customer.id})

        # create consolidated invoice
        self.env['pos.make.invoice'].create({
            "consolidated_billing": True,
        }).with_context({
            "active_ids": pos_orders.ids,
        }).action_create_invoices()
        # check if have single invoice
        self.assertEqual(len(pos_orders), 2)
        self.assertEqual(len(pos_orders.account_move), 1)
        self.assertEqual(pos_orders.account_move.partner_id, self.customer)
        self.assertEqual(pos_orders.account_move.amount_total, sum(pos_orders.mapped('amount_total')))
        self.assertEqual(pos_orders.account_move.payment_state, pos_orders.account_move._get_invoice_in_payment_state())
        self.assertEqual(pos_orders.account_move.state, 'posted')
        self.assertEqual(pos_orders.account_move.amount_residual, 0)

    def test_multi_config_global_invoice(self):
        self.open_new_session()
        orders = []
        orders.extend((
            self.create_ui_order_data([(self.product1, 3), (self.product2, 10)], payments=[(self.bank_pm, 230)]),
            self.create_ui_order_data([(self.product1, 5), (self.product0, 10)], payments=[(self.bank_pm, 50)])
        ))
        self.env['pos.order'].sync_from_ui(orders)
        self.pos_session.close_session_from_ui()

        # open new session & create orders
        self.open_new_session()
        orders2 = []
        orders2.extend((
            self.create_ui_order_data([(self.product1, 2), (self.product4, 3)], payments=[(self.bank_pm, 49.88)]),
            self.create_ui_order_data([(self.product4, 1), (self.product2, 5)], payments=[(self.bank_pm, 109.96)])
        ))
        self.env['pos.order'].sync_from_ui(orders2)
        self.pos_session.close_session_from_ui()

        pos_orders = self.env['pos.order'].search([])
        # set customer for the orders
        pos_orders.write({'partner_id': self.customer.id})

        # create consolidated invoice
        self.env['pos.make.invoice'].create({
            "consolidated_billing": True,
        }).with_context({
            "active_ids": pos_orders.ids,
        }).action_create_invoices()
        # check if have single invoice
        self.assertEqual(len(pos_orders), 4)
        self.assertTrue(all(order.state == 'done' for order in pos_orders))
        self.assertEqual(len(pos_orders.account_move), 1)
        self.assertNotEqual(self.pos_session.move_ids, pos_orders.account_move)
        self.assertEqual(pos_orders.account_move.partner_id, self.customer)
        self.assertEqual(pos_orders.account_move.amount_total, round(sum(pos_orders.mapped('amount_total')), 2))
        self.assertEqual(pos_orders.account_move.payment_state, pos_orders.account_move._get_invoice_in_payment_state())
        self.assertEqual(pos_orders.account_move.state, 'posted')
        self.assertEqual(pos_orders.account_move.amount_residual, 0)

    def test_pos_archived_combination(self):
        product = self.env['product.template'].create({
            'name': 'Product Test',
            'available_in_pos': True,
            'list_price': 10,
            'taxes_id': False,
        })

        attribute_1, attribute_2, attribute_3 = self.env['product.attribute'].create([{
            'name': 'Attribute 1',
            'create_variant': 'always',
            'value_ids': [(0, 0, {
                'name': 'Value 1',
            }), (0, 0, {
                'name': 'Value 2',
            })],
        }, {
            'name': 'Attribute 2',
            'create_variant': 'always',
            'value_ids': [(0, 0, {
                'name': 'Value 1',
            }), (0, 0, {
                'name': 'Value 2',
            })],
        }, {
            'name': 'Attribute 3',
            'create_variant': 'always',
            'value_ids': [(0, 0, {
                'name': 'Value 1',
            }), (0, 0, {
                'name': 'Value 2',
            })],
        }])

        _, _, ptal = self.env['product.template.attribute.line'].create([{
            'product_tmpl_id': product.id,
            'attribute_id': attribute_1.id,
            'value_ids': [(6, 0, attribute_1.value_ids.ids)],
            'sequence': 3,
        }, {
            'product_tmpl_id': product.id,
            'attribute_id': attribute_2.id,
            'value_ids': [(6, 0, attribute_2.value_ids.ids)],
            'sequence': 2,
        }, {
            'product_tmpl_id': product.id,
            'attribute_id': attribute_3.id,
            'value_ids': [(6, 0, attribute_3.value_ids.ids)],
            'sequence': 1,
        }])

        product.write({
            'attribute_line_ids': [(2, ptal.id)],
        })

        self.open_new_session()
        response = self.pos_session.load_data()
        product_data = next((item for item in response['product.template']['records'] if item['id'] == product.id), None)

        self.assertEqual(len(product_data['_archived_combinations']), 0, "There should be no archived combinations for the product")

        first_variant = product.product_variant_ids[0]
        first_variant.write({'active': False})

        response = self.pos_session.load_data()
        product_data = next((item for item in response['product.template']['records'] if item['id'] == product.id), None)

        self.assertEqual(len(product_data['_archived_combinations']), 1, "There should be one archived combination for the product")
        self.assertEqual(len(product_data['_archived_combinations'][0]), 2, "Archived combination should have two values")
        self.assertTrue(all(value in product_data['_archived_combinations'][0] for value in first_variant.product_template_attribute_value_ids.ids), "Archived combination should match the first variant's attribute values")

    def test_refunded_order_id(self):
        """
        An order containing refunded lines from two different orders is no longer allowed,
        but some legacy records of this kind may still exist.
        This test ensures that the refunded_order_id is correctly computed in such cases.
        """
        current_session = self.open_new_session()
        orders = list(self._create_orders([
            {'pos_order_lines_ui_args': [(self.product1, 1)]},
            {'pos_order_lines_ui_args': [(self.product2, 1)]}
        ]).values())

        refund_order = self.env['pos.order'].create({
            'company_id': self.env.company.id,
            'session_id': current_session.id,
            'lines': [
                (0, 0, {
                    'product_id': self.product1.id,
                    'price_unit': -10,
                    'qty': 1,
                    'tax_ids': [[6, False, []]],
                    'price_subtotal': -10,
                    'price_subtotal_incl': -10,
                    'refunded_orderline_id': orders[0].lines[0].id
                }),
                (0, 0, {
                    'product_id': self.product2.id,
                    'price_unit': -10,
                    'qty': 1,
                    'tax_ids': [[6, False, []]],
                    'price_subtotal': -10,
                    'price_subtotal_incl': -10,
                    'refunded_orderline_id': orders[1].lines[0].id
                })
            ],
            'amount_paid': -10,
            'amount_total': -10,
            'amount_tax': 0.0,
            'amount_return': 0.0,
        })

        self.assertEqual(refund_order.refunded_order_id, orders[0])

    def test_cannot_archive_journal_linked_to_pos_payment_method(self):
        """Test that archiving a journal linked to a POS payment method is blocked, and allowed when not linked."""

        test_journal = self.env['account.journal'].create({
            'name': 'Test POS Journal',
            'type': 'cash',
            'code': 'TPJ',
            'company_id': self.env.company.id,
        })
        test_payment_method = self.env['pos.payment.method'].create({
            'name': 'Test PM',
            'type': 'cash',
            'journal_id': test_journal.id,
            'receivable_account_id': self.cash_pm.receivable_account_id.id,
        })

        with self.assertRaises(ValidationError):
            test_journal.action_archive()

        # Unlink the payment method and try again (should succeed)
        test_payment_method.journal_id = False
        test_journal.action_archive()
        self.assertFalse(test_journal.active, "Journal should be archived when not linked to a POS payment method.")

    def test_archive_delete_special_product(self):
        self.config.iface_tipproduct = True
        special_product = self.env.ref('point_of_sale.product_product_tip')
        with self.assertRaisesRegex(UserError, "a special product in a Point of Sale configuration"):
            special_product.action_archive()
        with self.assertRaisesRegex(UserError, "a special product in a Point of Sale configuration"):
            special_product.product_variant_ids[0].action_archive()
        with self.assertRaisesRegex(UserError, "a special product in a Point of Sale configuration"):
            special_product.unlink()
        with self.assertRaisesRegex(UserError, "a special product in a Point of Sale configuration"):
            special_product.product_variant_ids[0].unlink()

    def test_pos_invoice_not_to_review_pos_only_user(self):
        """POS invoices must not be 'marked as 'to review' even when
        the invoicing user has no accounting review permissions."""
        self.open_new_session()

        pos_only_user = self.env['res.users'].create({
            'name': 'POS Only User',
            'login': 'pos_only_user',
            'password': 'pos_only_user',
            'group_ids': [self.env.ref('point_of_sale.group_pos_manager').id],
        })

        orders = self._create_orders([{
            'pos_order_lines_ui_args': [(self.product1, 1)],
            'customer': self.customer,
            'is_invoiced': False,
        }])
        orders = sum(orders.values(), self.env['pos.order'])

        orders.with_user(pos_only_user)._generate_pos_order_invoice()

        self.assertEqual(orders.account_move.review_state, 'no_review')

    def test_delete_archive_product_pos_category_with_active_pos_session(self):
        self.env['pos.session'].search([('state', '!=', 'closed')]).state = "closed"
        category1 = self.env['pos.category'].create({'name': 'Category 1'})
        category2 = self.env['pos.category'].create({'name': 'Category 2'})

        product1 = self.create_product('Product 1', self.categ_basic, 0.0, 0.0)
        product2 = self.create_product('Product 2', self.categ_basic, 0.0, 0.0)

        product1.pos_categ_ids = [(6, 0, [category1.id])]
        product2.pos_categ_ids = [(6, 0, [category2.id])]

        # Open unrestricted session -> everything protected.
        self.pos_config.open_ui()
        self.pos_config.iface_available_categ_ids = []

        with self.assertRaisesRegex(UserError, "active Point of Sale session"):
            product2.action_archive()

        with self.assertRaisesRegex(UserError, "active Point of Sale session"):
            category2.unlink()

        # Open restricted session for category1 only.
        self.pos_config.iface_available_categ_ids = [(6, 0, [category1.id])]

        # category1/product1 still protected.
        with self.assertRaisesRegex(UserError, "active Point of Sale session"):
            product1.product_variant_id.action_archive()

        with self.assertRaisesRegex(UserError, "currently in use in a point of sale"):
            category1.action_archive()

        # category2/product2 no longer protected.
        product2.action_archive()
        product2.unlink()

        category2.action_archive()
        category2.unlink()

        # After session close, only config protection remains.
        self.pos_config.current_session_id.state = 'closed'

        with self.assertRaisesRegex(UserError, "currently in use in a point of sale"):
            category1.unlink()

    def test_basic_config_values(self):
        config = self.pos_config
        self.assertEqual(config.currency_id, self.company_currency)
        self.assertEqual(config.pricelist_id.currency_id, self.company_currency)

    def test_other_currency_config_values(self):
        config = self.pos_config_foreign
        self.assertEqual(config.currency_id, self.other_currency)
        self.assertEqual(config.pricelist_id.currency_id, self.other_currency)

    def test_product_price(self):
        def get_price(pricelist, product):
            return pricelist._get_product_price(product, 1)

        # check usd pricelist
        pricelist = self.pos_config.pricelist_id
        for product in self.products:
            self.assertAlmostEqual(get_price(pricelist, product), product.lst_price)

        # check eur pricelist
        # exchange rate to the other currency is set to 0.5, thus, lst_price
        # is expected to have half its original value.
        pricelist = self.pos_config_foreign.pricelist_id
        for product in self.products:
            self.assertAlmostEqual(get_price(pricelist, product), product.lst_price * 0.5)

    def test_taxes(self):
        tax7 = self.taxes['tax7']
        self.assertEqual(tax7.name, 'Tax 7%')
        self.assertAlmostEqual(tax7.amount, 7)
        self.assertEqual(tax7.invoice_repartition_line_ids.mapped('account_id').id, self.tax_received_account.id)
        tax10 = self.taxes['tax10']
        self.assertEqual(tax10.name, 'Tax 10%')
        self.assertAlmostEqual(tax10.amount, 10)
        self.assertEqual(tax10.price_include, True)
        self.assertEqual(tax10.invoice_repartition_line_ids.mapped('account_id').id, self.tax_received_account.id)
        tax_group_7_10 = self.taxes['tax_group_7_10']
        self.assertEqual(tax_group_7_10.name, 'Tax 7+10%')
        self.assertEqual(tax_group_7_10.amount_type, 'group')
        self.assertEqual(sorted(tax_group_7_10.children_tax_ids.ids), sorted((tax7 | tax10).ids))

    def test_archive_used_journal(self):
        journal = self.env['account.journal'].create({
            'name': 'BANKOS',
            'company_id': self.company.id,
            'code': 'BANKOS',
            'type': 'bank',
            'invoice_reference_type': 'invoice',
            'invoice_reference_model': 'odoo'
        })
        payment_method = self.env['pos.payment.method'].create({
            'name': 'Lets Pay for Tests', 'journal_id': journal.id, 'type': 'bank'})
        self.pos_config.write({'payment_method_ids': [payment_method.id]})
        journal.write({'pos_payment_method_ids': [payment_method.id]})
        session = self.env['pos.session'].create(
            {
                'name': 'lets sell some tests',
                'config_id': self.pos_config.id,
                'user_id': self.env.user.id,
                'state': 'opened'
            }
        )
        order = self.env['pos.order'].create(
            {
                'name': 'MIX',
                'amount_tax': 0,
                'amount_total': 0,
                'amount_paid': 0,
                'amount_return': 0,
                'company_id': self.company.id,
                'pricelist_id': self.currency_pricelist.id,
                'session_id': session.id
            }
        )
        self.env['pos.payment'].create(
            {
                'amount': 100,
                'payment_date': '2025-01-01',
                'payment_method_id': payment_method.id,
                'pos_order_id': order.id
            }
        )
        with self.assertRaises(ValidationError):
            journal.action_archive()

    def test_card_payment_method_initialization(self):
        """Test that the 'Card' payment method created by default has an outstanding account."""
        card_pm = self.env['pos.payment.method'].search([
            ('name', '=', 'Card'), ('company_id', '=', self.env.company.id),
        ], limit=1)
        self.assertTrue(card_pm)
        self.assertTrue(card_pm.outstanding_account_id)

    def test_pos_loaded_product_taxes_on_branch(self):
        """ Check loaded product taxes on branch company """
        # create the following branch hierarchy:
        #     Parent company
        #         |----> Branch X
        #                   |----> Branch XX
        company = self.config.company_id
        branch_x = self.env['res.company'].create({
            'name': 'Parent Company',
            'country_id': company.country_id.id,
            'parent_id': company.id,
        })
        branch_xx = self.env['res.company'].create({
            'name': 'Branch XX',
            'country_id': company.country_id.id,
            'parent_id': branch_x.id,
        })
        self.cr.precommit.run()  # load the CoA
        # create taxes for the parent company and its branches
        tax_groups = self.env['account.tax.group'].create([
            {'name': 'Tax Group', 'company_id': company.id},
            {'name': 'Tax Group X', 'company_id': branch_x.id},
            {'name': 'Tax Group XX', 'company_id': branch_xx.id}
        ])
        tax_a = self.env['account.tax'].create({
            'name': 'Tax A',
            'type_tax_use': 'sale',
            'amount_type': 'percent',
            'amount': 10,
            'tax_group_id': tax_groups[0].id,
            'company_id': company.id,
        })
        tax_b = self.env['account.tax'].create({
            'name': 'Tax B',
            'type_tax_use': 'sale',
            'amount_type': 'percent',
            'amount': 15,
            'tax_group_id': tax_groups[0].id,
            'company_id': company.id,
        })
        tax_x = self.env['account.tax'].create({
            'name': 'Tax X',
            'type_tax_use': 'sale',
            'amount_type': 'percent',
            'amount': 20,
            'tax_group_id': tax_groups[1].id,
            'company_id': branch_x.id,
        })
        tax_xx = self.env['account.tax'].create({
            'name': 'Tax XX',
            'type_tax_use': 'sale',
            'amount_type': 'percent',
            'amount': 25,
            'tax_group_id': tax_groups[2].id,
            'company_id': branch_xx.id,
        })
        # create several products with different taxes combination
        product_all_taxes = self.env['product.product'].create({
            'name': 'Product all taxes',
            'available_in_pos': True,
            'taxes_id': [Command.set((tax_a + tax_b + tax_x + tax_xx).ids)],
        })
        product_no_xx_tax = self.env['product.product'].create({
            'name': 'Product no tax from XX',
            'available_in_pos': True,
            'taxes_id': [Command.set((tax_a + tax_b + tax_x).ids)],
        })
        product_no_branch_tax = self.env['product.product'].create({
            'name': 'Product no tax from branch',
            'available_in_pos': True,
            'taxes_id': [Command.set((tax_a + tax_b).ids)],
        })
        product_no_tax = self.env['product.product'].create({
            'name': 'Product no tax',
            'available_in_pos': True,
            'taxes_id': [],
        })
        # configure a session on Branch XX
        self.xx_bank_journal = self.env['account.journal'].with_company(branch_xx).create({
            'name': 'Bank',
            'type': 'bank',
            'company_id': branch_xx.id,
            'code': 'BNK',
            'sequence': 15,
        })
        xx_config = self.env['pos.config'].with_company(branch_xx).create({
            'name': 'Branch XX config',
            'company_id': branch_xx.id,
        })
        xx_account_receivable = self.company_data['default_account_receivable'].copy({'company_ids': [Command.set(branch_xx.ids)]})
        xx_cash_journal = self.company_data['default_journal_cash'].copy({'company_id': branch_xx.id})
        xx_cash_payment_method = self.env['pos.payment.method'].create({
            'name': 'XX Cash Payment',
            'type': 'cash',
            'receivable_account_id': xx_account_receivable.id,
            'journal_id': xx_cash_journal.id,
            'company_id': branch_xx.id,
        })
        xx_config.write({'payment_method_ids': [
            Command.set(xx_cash_payment_method.ids),
        ]})
        self.config = xx_config
        pos_session = self.open_new_session()
        # load the session data from Branch XX:
        # - Product all taxes           => tax from Branch XX should be set
        # - Product no tax from XX      => tax from Branch X should be set
        # - Product no tax from branch  => 2 taxes from parent company should be set
        # - Product no tax              => no tax should be set
        pos_data = pos_session.load_data()
        self.assertEqual(
            next(iter(filter(lambda p: p['id'] == product_all_taxes.product_tmpl_id.id, pos_data['product.template']['records'])))['taxes_id'],
            tax_xx.ids
        )
        self.assertEqual(
            next(iter(filter(lambda p: p['id'] == product_no_xx_tax.product_tmpl_id.id, pos_data['product.template']['records'])))['taxes_id'],
            tax_x.ids
        )
        tax_data_no_branch = next(iter(filter(lambda p: p['id'] == product_no_branch_tax.product_tmpl_id.id, pos_data['product.template']['records'])))['taxes_id']
        tax_data_no_branch.sort()
        self.assertEqual(
            tax_data_no_branch,
            (tax_a + tax_b).ids
        )
        self.assertEqual(
            next(iter(filter(lambda p: p['id'] == product_no_tax.product_tmpl_id.id, pos_data['product.template']['records'])))['taxes_id'],
            []
        )

        # `pos_user` is already taken by the common setup; this is a second,
        # branch-scoped user.
        pos_user = self.env['res.users'].create({
            'name': 'Joe Odoo',
            'login': 'pos_user_branch',
            'password': 'pos_user_branch',
            'group_ids': [
                (4, self.env.ref('base.group_user').id),
                (4, self.env.ref('point_of_sale.group_pos_user').id),
            ],
            'tz': 'America/New_York',
            'company_id': branch_xx.id,
            'company_ids': [Command.set([company.id, branch_x.id, branch_xx.id])],
        })

        def get_taxes_name_popup(product):
            product = product.product_tmpl_id
            # In order to simulate the state of the cache when we run this
            # function over RPC, we need to fetch the below data first,
            # invalidate our cache, and then enter `get_product_info_pos`
            # with the arguments already loaded. This is necessary to test
            # an access rights issue when trying to load product info.
            branch_xx_id = branch_xx.id
            xx_config_id = xx_config.id
            product_all_taxes_lst_price = product_all_taxes.lst_price
            self.env.invalidate_all()
            return [tax['name'] for tax in product.with_user(pos_user).with_context(allowed_company_ids=[branch_xx_id]).get_product_info_pos(product_all_taxes_lst_price, 1, xx_config_id)['all_prices']['tax_details']]

        self.assertEqual(get_taxes_name_popup(product_all_taxes), ["Tax XX"])
        self.assertEqual(get_taxes_name_popup(product_no_xx_tax), ["Tax X"])
        self.assertEqual(get_taxes_name_popup(product_no_branch_tax), ["Tax A", "Tax B"])
        self.assertEqual(get_taxes_name_popup(product_no_tax), [])

    def test_get_product_info_pos_with_fiscal_position(self):
        tax_15 = self.env['account.tax'].create({
            'name': 'tax_15',
            'type_tax_use': 'sale',
            'amount_type': 'percent',
            'amount': 15.0,
        })
        tax_30 = self.env['account.tax'].create({
            'name': 'tax_30',
            'type_tax_use': 'sale',
            'amount_type': 'percent',
            'amount': 30.0,
            'original_tax_ids': [Command.set(tax_15.ids)],
        })
        fp = self.env['account.fiscal.position'].create({
            'name': 'Maps 15 to 30',
            'tax_ids': [Command.set(tax_30.ids)],
        })
        product = self.create_product('Product FP', self.categ_basic, 100.0, tax_ids=tax_15.ids)
        template = product.product_tmpl_id

        def get_display_info(fp_id=False):
            info = template.with_context(fiscal_position_id=fp_id).get_product_info_pos(100.0, 1, self.config.id)['all_prices']
            return (info['price_with_tax'], [t['name'] for t in info['tax_details']])

        self.assertEqual(get_display_info(), (115.0, ['tax_15']))
        self.assertEqual(get_display_info(fp.id), (130.0, ['tax_30']))

    def test_combo_product_variant_error(self):
        """This tests make sure that product containing variants cannot change type to combo"""

        size_attribute = self.env['product.attribute'].create({'name': 'Size'})
        a1 = self.env['product.attribute.value'].create({'name': 'V0hFCg==', 'attribute_id': size_attribute.id})
        self.variant_product = self.env["product.product"].create(
            {
                "name": "Test product",
                "attribute_line_ids": [(0, 0, {
                    "attribute_id": size_attribute.id,
                    "value_ids": [(6, 0, [a1.id])]
                })],
            })
        with self.assertRaises(UserError):
            with Form(self.variant_product.product_tmpl_id) as product:
                product.type = "combo"

    def test_product_combo_variants(self):
        # Create product and combo
        product = self.env['product.product'].create({
            'name': 'Test Product 1',
            'list_price': 100,
            'taxes_id': False,
            'available_in_pos': True,
        })

        product_combo = self.env['product.combo'].create({
            'name': 'Product combo',
            'combo_item_ids': [
                Command.create({
                    'product_id': product.id,
                    'extra_price': 0,
                }),
            ],
        })
        # Add attribute and values, simulating variant creation
        size_attribute = self.env['product.attribute'].create({'name': 'Size'})
        attribute_value_1 = self.env['product.attribute.value'].create({'name': 'Large', 'attribute_id': size_attribute.id})
        attribute_value_2 = self.env['product.attribute.value'].create({'name': 'Small', 'attribute_id': size_attribute.id})
        original_product_id = product.id
        product.product_tmpl_id.with_context(create_product_product=True).write({
            'attribute_line_ids': [(0, 0, {
                'attribute_id': size_attribute.id,
                'value_ids': [(6, 0, [attribute_value_1.id, attribute_value_2.id])],
            })],
        })
        # Check that original product should not be in combo anymore (replace by variants)
        self.assertNotIn(
            original_product_id,
            product_combo.combo_item_ids.mapped('product_id').ids,
            'Original product should not be in combo'
        )

    def test_01_check_product_cost(self):
        # Product price should be half of the original price because currency rate is 0.5.
        # (see `self._create_other_currency_config` method)
        # Except for product2 where the price is specified in the pricelist.

        # change the price of product2 to 12.99 fixed. No need to convert.
        pricelist_item = self.env['product.pricelist.item'].create({
            'product_tmpl_id': self.product2.product_tmpl_id.id,
            'fixed_price': 12.99,
        })
        self.pos_config_foreign.pricelist_id.write({'item_ids': [(6, 0, (self.pos_config_foreign.pricelist_id.item_ids | pricelist_item).ids)]})

        self.assertAlmostEqual(self.pos_config_foreign.pricelist_id._get_product_price(self.product1, 1), 5.00)
        self.assertAlmostEqual(self.pos_config_foreign.pricelist_id._get_product_price(self.product2, 1), 12.99)
        self.assertAlmostEqual(self.pos_config_foreign.pricelist_id._get_product_price(self.product3, 1), 15.00)
        self.assertAlmostEqual(self.pos_config_foreign.pricelist_id._get_product_price(self.product7, 1), 3.50)

    def test_combo_prices_converted_to_pos_currency(self):
        # A combo's `base_price` and its items' `extra_price` are stored in the
        # company currency. When loaded in a PoS running another currency they
        # must be converted, just like standalone product prices (rate 0.5).
        combo = self.env['product.combo'].create({
            'name': 'Combo choice',
            'company_id': self.company.id,
            'combo_item_ids': [
                (0, 0, {'product_id': self.product1.product_variant_id.id, 'extra_price': 20.0}),
                (0, 0, {'product_id': self.product3.product_variant_id.id, 'extra_price': 0.0}),
            ],
        })
        # base_price is the min lst_price among the items, in company currency (product1 = 10.0).
        self.assertAlmostEqual(combo.base_price, 10.0)

        combo_read = self.env['product.combo']._load_pos_data_read(combo, self.pos_config_foreign)[0]
        self.assertAlmostEqual(combo_read['base_price'], 5.0)

        combo_item_read = self.env['product.combo.item']._load_pos_data_read(combo.combo_item_ids, self.pos_config_foreign)
        extra_prices = {rec['product_id']: rec['extra_price'] for rec in combo_item_read}
        self.assertAlmostEqual(extra_prices[self.product1.product_variant_id.id], 10.0)
        self.assertAlmostEqual(extra_prices[self.product3.product_variant_id.id], 0.0)

    def test_bank_journal_balance(self):
        """Verify that debit and credit are balanced when adding a difference to the bank."""

        # Make a sale paid by bank
        self.pos_config_foreign.open_ui()
        session_id = self.pos_config_foreign.current_session_id
        order = self.env['pos.order'].create({
            'company_id': self.env.company.id,
            'session_id': session_id.id,
            'partner_id': False,
            'lines': [(0, 0, {
                'name': 'OL/0001',
                'product_id': self.product1.id,
                'price_unit': 10.00,
                'discount': 0,
                'qty': 1,
                'tax_ids': False,
                'price_subtotal': 10.00,
                'price_subtotal_incl': 10.00,
            })],
            'pricelist_id': self.pos_config_foreign.pricelist_id.id,
            'amount_paid': 10.00,
            'amount_total': 10.00,
            'amount_tax': 0.0,
            'amount_return': 0.0,
            'to_invoice': False,
        })

        # Make payment
        payment_context = {"active_ids": order.ids, "active_id": order.id}
        order_payment = self.env['pos.make.payment'].with_context(**payment_context).create({
            'amount': order.amount_total,
            'payment_method_id': self.bank_pm_foreign.id
        })
        order_payment.with_context(**payment_context).check()

        # Close session with counted +10 for bank compared with expected
        session_id.close_session_from_ui()  # Real 20, expected 10, diff 10

        # Check debit/credit session's balance
        for move in session_id._get_related_account_moves():
            debit = credit = 0.0
            for line in move.line_ids:
                debit += line.debit
                credit += line.credit
            self.assertEqual(tools.float_compare(debit, credit, precision_rounding=self.pos_config_foreign.currency_id.rounding), 0)  # debit and credit should be equal

    def test_with_session_check_product_cost(self):
        def find_by(list_of_dicts, key, value):
            return next((d for d in list_of_dicts if d.get(key) == value), None)

        self.pos_config_foreign.open_ui()
        product = self.pos_config_foreign.current_session_id.load_data({'only_records': True})['product.product']

        self.assertAlmostEqual(find_by(product, 'id', self.product1.id)['lst_price'], 5.00)
        self.assertAlmostEqual(find_by(product, 'id', self.product2.id)['lst_price'], 10.00)
        self.assertAlmostEqual(find_by(product, 'id', self.product3.id)['lst_price'], 15.00)
        self.assertAlmostEqual(find_by(product, 'id', self.product7.id)['lst_price'], 3.50)

    def test_pos_data_standard_price_converted(self):
        self.pos_config_foreign.open_ui()
        res = self.pos_config_foreign.current_session_id.load_data({'only_records': True})
        product1_data = next(filter(lambda product: product['display_name'] == "Product 1", res['product.product']))
        self.assertEqual(product1_data['standard_price'], 2.5)  # standard price should be converted

    def test_pos_data_shared_product_cost_currency(self):
        """ A product shared across companies (company_id = False) takes its sale-price
        currency from the main company but its cost currency from the active company.
        When the POS runs in a company whose currency differs from the main company, the
        cost (standard_price) must be converted from cost_currency_id, not currency_id,
        otherwise it gets wrongly multiplied by the exchange rate even though it is
        already expressed in the POS currency.
        """
        main_company = self.env['res.company']._get_main_company()
        self.assertNotEqual(main_company.currency_id, self.other_currency)

        other_company = self.env['res.company'].create({
            'name': 'Other Currency Company',
            'currency_id': self.other_currency.id,
        })
        self.env.user.company_ids |= other_company

        self.env['res.currency.rate'].create({
            'name': fields.Date.today(),
            'currency_id': main_company.currency_id.id,
            'rate': 2.0,
            'company_id': other_company.id,
        })

        shared_product = self.env['product.product'].create({
            'name': 'Shared Product',
            'available_in_pos': True,
            'is_storable': True,
            'taxes_id': [(5, 0, 0)],
            'lst_price': 100.0,
            'company_id': False,
        }).with_company(other_company)
        # standard_price is company-dependent: set it for the active company, where it
        # is therefore expressed in that company's currency (the "other" currency).
        shared_product.standard_price = 100.0

        self.assertEqual(shared_product.currency_id, main_company.currency_id)
        self.assertEqual(shared_product.cost_currency_id, self.other_currency)

        self.assertEqual(self.pos_config_foreign.currency_id, self.other_currency)
        [data] = shared_product._load_pos_data_read(shared_product, self.pos_config_foreign)

        self.assertAlmostEqual(data['standard_price'], 100.0)
        self.assertAlmostEqual(data['lst_price'], 50.0)
