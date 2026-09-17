# -*- coding: utf-8 -*-
from odoo import fields, Command
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import Form, tagged
from odoo.exceptions import UserError


@tagged('post_install', '-at_install')
class TestAccruedPurchaseOrders(AccountTestInvoicingCommon):

    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.other_currency = cls.setup_other_currency('XAF')
        cls.alt_exp_account = cls.company_data['default_account_expense'].copy()
        # set 'type' to 'service' to allow manualy set 'qty_delivered' even with purchase_stock installed
        cls.product_a.update({'type': 'service', 'purchase_method': 'receive'})
        cls.product_b.update({'type': 'service', 'purchase_method': 'receive'})
        #analytic distribution
        cls.default_plan = cls.env['account.analytic.plan'].create({'name': 'Default'})
        cls.analytic_account_a = cls.env['account.analytic.account'].create({
            'name': 'analytic_account_a',
            'plan_id': cls.default_plan.id,
            'company_id': False,
        })
        cls.analytic_account_b = cls.env['account.analytic.account'].create({
            'name': 'analytic_account_b',
            'plan_id': cls.default_plan.id,
            'company_id': False,
        })
        cls.product_b.property_account_expense_id = cls.alt_exp_account
        cls.purchase_order = cls.env['purchase.order'].create({
            'partner_id': cls.partner_a.id,
            'order_line': [
                Command.create({
                    'name': cls.product_a.name,
                    'product_id': cls.product_a.id,
                    'product_qty': 10.0,
                    'uom_id': cls.product_a.uom_id.id,
                    'price_unit': cls.product_a.list_price,
                    'tax_ids': False,
                    'analytic_distribution': {
                        cls.analytic_account_a.id : 80.0,
                        cls.analytic_account_b.id : 20.0,
                    },
                }),
                Command.create({
                    'name': cls.product_b.name,
                    'product_id': cls.product_b.id,
                    'product_qty': 10.0,
                    'uom_id': cls.product_b.uom_id.id,
                    'price_unit': cls.product_b.list_price,
                    'tax_ids': False,
                    'analytic_distribution': {
                        cls.analytic_account_b.id : 100.0,
                    },
                }),
            ],
        })
        cls.purchase_order.button_confirm()
        cls.account_revenue = cls.company_data['default_account_revenue']
        cls.account_expense = cls.company_data['default_account_expense']
        cls.wizard = cls.create_wizard(cls)

    def create_wizard(self, **kwargs):
        account_id = kwargs.pop('account_id', self.account_revenue.id)

        return self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order',
            'active_ids': self.purchase_order.ids,
            'default_accrual_type': 'bill_to_receive',
            **kwargs,
        }).create({
            'account_id': account_id,
        })

    def _create_accrual_product(self, storable, real_time):
        category = self.env['product.category'].create({
            'name': 'Real Time Category' if real_time else 'Periodic Category',
            'property_valuation': 'real_time' if real_time else 'periodic',
        })
        return self.env['product.product'].create({
            'name': 'Storable Product' if storable else 'Non-stock Product',
            'type': 'consu',
            'is_storable': storable,
            'categ_id': category.id,
            'standard_price': 100.0,
        })

    def _create_purchase_order(self, product, qty, price_unit, fulfill=False):
        """ `fulfill=True` also fully receives and bills the PO on the spot, e.g. to give
        a test some pre-existing stock: fully received and fully billed leaves nothing
        pending to accrue. """
        purchase_order = self.env['purchase.order'].create({
            'partner_id': self.partner_a.id,
            'order_line': [Command.create({
                'name': product.name,
                'product_id': product.id,
                'product_qty': qty,
                'price_unit': price_unit,
                'tax_ids': False,
            })],
        })
        purchase_order.button_confirm()
        if fulfill:
            purchase_order.order_line.qty_received = qty
            self._create_bill(purchase_order)
        return purchase_order

    def _create_bill(self, purchase_order, invoice_date=False):
        move = self.env['account.move'].browse(purchase_order.action_create_invoice()['res_id'])
        move.invoice_date = invoice_date or fields.Date.today()
        move.action_post()
        return move

    def _cancel_accrual_entries(self, moves):
        moves.filtered(lambda m: m.state == 'posted').button_draft()
        moves.unlink()

    def _filter_reversal(self, moves):
        """ `moves.line_ids` without the scheduled reversal move's lines (its exact mirror). """
        return moves.filtered(lambda m: not m.reversed_entry_id).line_ids

    def test_bill_to_receive(self):
        """ A non-stock-tracked product's "Bills to Receive" accrual: check both the created
        journal entries and the inventory valuation report's accrual breakdown. """
        product = self._create_accrual_product(storable=False, real_time=False)
        self._create_purchase_order(product, qty=10.0, price_unit=200.0, fulfill=True)
        purchase_order = self._create_purchase_order(product, qty=10.0, price_unit=100.0)
        # No manual `account_id`: it must default to "Bills to Receive", never revenue.
        accrual_account = product.product_tmpl_id._get_product_accounts()['bills_to_receive']
        expense_account = product.product_tmpl_id._get_product_accounts()['expense']

        # nothing to bill: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order.line',
            'active_ids': purchase_order.order_line.ids,
            'default_accrual_type': 'bill_to_receive',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # 5 qty received, nothing billed yet
        purchase_order.order_line.qty_received = 5

        # Not a stock-tracked product: no place in a *stock* valuation report.
        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertNotIn('accrual', report_data)
        self.assertFalse(report_data["stock_variation"]["lines"])

        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': expense_account.id, 'debit': 500, 'credit': 0},
            {'account_id': accrual_account.id, 'debit': 0, 'credit': 500},
        ])

        # The closing action is scoped to storable products, so it has nothing to do here.
        self._cancel_accrual_entries(account_move)
        with self.assertRaises(UserError):
            self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)

    def test_billed_not_received(self):
        """ A non-stock-tracked product's "Billed Not Received" accrual: the vendor bill is
        posted for the full ordered quantity before anything is received, so the accrual
        reverses the expense already recognized until the goods actually come in. """
        product = self._create_accrual_product(storable=False, real_time=False)
        self._create_purchase_order(product, qty=10.0, price_unit=200.0, fulfill=True)
        # Bill on ordered quantities, or nothing would be invoiceable with none received.
        product.purchase_method = 'purchase'
        purchase_order = self._create_purchase_order(product, qty=10.0, price_unit=100.0)
        accrual_account = product.product_tmpl_id._get_product_accounts()['billed_not_received']
        expense_account = product.product_tmpl_id._get_product_accounts()['expense']

        # nothing billed yet: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order.line',
            'active_ids': purchase_order.order_line.ids,
            'default_accrual_type': 'billed_not_received',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # full quantity billed, nothing received yet
        self._create_bill(purchase_order)

        # Not a stock-tracked product: no place in a *stock* valuation report.
        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertNotIn('accrual', report_data)
        self.assertFalse(report_data["stock_variation"]["lines"])

        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': expense_account.id, 'debit': 0, 'credit': 1000},
            {'account_id': accrual_account.id, 'debit': 1000, 'credit': 0},
        ])

        # The closing action is scoped to storable products, so it has nothing to do here
        # either, even though the bill itself is still posted.
        self._cancel_accrual_entries(account_move)
        with self.assertRaises(UserError):
            self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)

    def test_bill_to_receive_realtime(self):
        """ Same as `test_bill_to_receive`, but for a storable, real-time-valued product:
        a real-time bill never posts to the expense account, so the only commercial line
        is the stock valuation adjustment, counterbalanced by the accrual account. """
        product = self._create_accrual_product(storable=True, real_time=True)
        self._create_purchase_order(product, qty=10.0, price_unit=200.0, fulfill=True)
        purchase_order = self._create_purchase_order(product, qty=10.0, price_unit=100.0)
        accrual_account = product.product_tmpl_id._get_product_accounts()['bills_to_receive']
        stock_valuation_account = product.product_tmpl_id._get_product_accounts()['stock_valuation']

        # nothing to bill: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order.line',
            'active_ids': purchase_order.order_line.ids,
            'default_accrual_type': 'bill_to_receive',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # 5 qty received, nothing billed yet
        purchase_order.order_line.qty_received = 5

        # No classic expense line for real-time: the accrual is purely an inventory
        # matter, so it shows up under "Bills to Receive" here...
        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertEqual(report_data['accrual']['lines'], [{
            'display_name': 'Bills to Receive',
            'account_id': False,
            'debit': 0,
            'credit': 500.0,
            'lines': [{
                'display_name': accrual_account.display_name,
                'account_id': accrual_account.id,
                'debit': 0,
                'credit': 500.0,
            }],
        }])
        # ... and, netted against Stock Variation, in Ending Stock too.
        self.assertEqual(report_data['ending_stock']['lines_by_account_id'][stock_valuation_account.id], {'value': 2500.0})
        self.assertFalse(report_data['stock_variation']['lines'])

        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': stock_valuation_account.id, 'debit': 500, 'credit': 0},
            {'account_id': accrual_account.id, 'debit': 0, 'credit': 500},
        ])

        # No separate "classic" line to add here (unlike periodic), so the closing
        # action reproduces the exact same thing.
        self._cancel_accrual_entries(account_move)
        action = self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)
        moves = self.env['account.move'].search(action['domain'])
        self.assertRecordValues(self._filter_reversal(moves), [
            {'account_id': stock_valuation_account.id, 'debit': 500, 'credit': 0},
            {'account_id': accrual_account.id, 'debit': 0, 'credit': 500},
        ])

    def test_billed_not_received_realtime(self):
        """ Same as `test_billed_not_received`, but for a storable, real-time-valued
        product: the bill posted straight to `stock_valuation` (no expense line at all,
        real-time never uses one), so reverting it credits/debits that account directly
        instead of `expense`. """
        product = self._create_accrual_product(storable=True, real_time=True)
        self._create_purchase_order(product, qty=10.0, price_unit=200.0, fulfill=True)
        product.purchase_method = 'purchase'
        purchase_order = self._create_purchase_order(product, qty=10.0, price_unit=100.0)
        accrual_account = product.product_tmpl_id._get_product_accounts()['billed_not_received']
        stock_valuation_account = product.product_tmpl_id._get_product_accounts()['stock_valuation']

        # nothing billed yet: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order.line',
            'active_ids': purchase_order.order_line.ids,
            'default_accrual_type': 'billed_not_received',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # full quantity billed, nothing received yet
        self._create_bill(purchase_order)

        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertEqual(report_data['accrual']['lines'], [{
            'display_name': 'Billed Not Received',
            'account_id': False,
            'debit': 1000.0,
            'credit': 0,
            'lines': [{
                'display_name': accrual_account.display_name,
                'account_id': accrual_account.id,
                'debit': 1000.0,
                'credit': 0,
            }],
        }])
        # Posting the bill also nudges the `qty_available` proxy as if the goods had been
        # received, contributing +1000 here; the accrual's own -1000 correction nets that
        # back to 0 — correct, since nothing was actually received.
        self.assertEqual(report_data['ending_stock']['lines_by_account_id'][stock_valuation_account.id], {'value': 2000.0})
        self.assertFalse(report_data['stock_variation']['lines'])

        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': stock_valuation_account.id, 'debit': 0, 'credit': 1000},
            {'account_id': accrual_account.id, 'debit': 1000, 'credit': 0},
        ])

        self._cancel_accrual_entries(account_move)
        action = self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)
        moves = self.env['account.move'].search(action['domain'])
        self.assertRecordValues(self._filter_reversal(moves), [
            {'account_id': stock_valuation_account.id, 'debit': 0, 'credit': 1000},
            {'account_id': accrual_account.id, 'debit': 1000, 'credit': 0},
        ])

    def test_bill_to_receive_periodic(self):
        """ Same as `test_bill_to_receive`, but for a storable, periodic-valued product.
        The classic expense line still applies, but the `qty_available` correction it
        also needs is the closing action's job, not a plain accrual entry's. """
        product = self._create_accrual_product(storable=True, real_time=False)
        self._create_purchase_order(product, qty=10.0, price_unit=200.0, fulfill=True)
        purchase_order = self._create_purchase_order(product, qty=10.0, price_unit=100.0)
        accrual_account = product.product_tmpl_id._get_product_accounts()['bills_to_receive']
        stock_valuation_account = product.product_tmpl_id._get_product_accounts()['stock_valuation']
        stock_variation_account = product.product_tmpl_id._get_product_accounts()['stock_variation']
        expense_account = product.product_tmpl_id._get_product_accounts()['expense']

        # nothing to bill: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order.line',
            'active_ids': purchase_order.order_line.ids,
            'default_accrual_type': 'bill_to_receive',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # 5 qty received, nothing billed yet
        purchase_order.order_line.qty_received = 5

        # No "Bills to Receive" entry (periodic has nothing to do with stock valuation),
        # but the pending closing correction already previews under Stock Variation, like
        # the closing entry it anticipates: its per-account breakdown stays out of Ending
        # Stock's own lines, but its $500 pending value still counts towards both totals.
        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertNotIn('accrual', report_data)
        self.assertNotIn(stock_valuation_account.id, report_data['ending_stock']['lines_by_account_id'])
        self.assertNotIn(stock_variation_account.id, report_data['ending_stock']['lines_by_account_id'])
        self.assertEqual(report_data['stock_variation']['lines'], [
            {'account_id': stock_valuation_account.id, 'debit': 2500.0, 'credit': 0},
            {'account_id': stock_variation_account.id, 'debit': 0, 'credit': 2500.0},
        ])
        self.assertEqual(report_data['stock_variation']['value'], 2500.0)
        self.assertEqual(report_data['ending_stock']['value'], 2500.0)

        # The plain wizard only ever posts the classic pair.
        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': expense_account.id, 'debit': 500, 'credit': 0},
            {'account_id': accrual_account.id, 'debit': 0, 'credit': 500},
        ])

        # The closing action reproduces that same pair in its own entry, plus a second,
        # separate entry for the correction it alone posts.
        self._cancel_accrual_entries(account_move)
        action = self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)
        moves = self.env['account.move'].search(action['domain']).filtered(lambda m: not m.reversed_entry_id)
        accrual_move = moves.filtered(lambda m: accrual_account in m.line_ids.account_id)
        closing_move = moves.filtered(lambda m: stock_variation_account in m.line_ids.account_id)
        self.assertEqual(len(moves), 2)
        self.assertRecordValues(accrual_move.line_ids, [
            {'account_id': expense_account.id, 'debit': 500, 'credit': 0},
            {'account_id': accrual_account.id, 'debit': 0, 'credit': 500},
        ])
        self.assertRecordValues(closing_move.line_ids, [
            {'account_id': stock_valuation_account.id, 'debit': 2500, 'credit': 0},
            {'account_id': stock_variation_account.id, 'debit': 0, 'credit': 2500},
        ])

    def test_billed_not_received_periodic(self):
        """ Same as `test_billed_not_received`, but for a storable, periodic-valued
        product. Same split as `test_bill_to_receive_periodic`: the wizard only posts
        the classic pair, the correction is the closing action's job. """
        product = self._create_accrual_product(storable=True, real_time=False)
        self._create_purchase_order(product, qty=10.0, price_unit=200.0, fulfill=True)
        product.purchase_method = 'purchase'
        purchase_order = self._create_purchase_order(product, qty=10.0, price_unit=100.0)
        accrual_account = product.product_tmpl_id._get_product_accounts()['billed_not_received']
        stock_valuation_account = product.product_tmpl_id._get_product_accounts()['stock_valuation']
        stock_variation_account = product.product_tmpl_id._get_product_accounts()['stock_variation']
        expense_account = product.product_tmpl_id._get_product_accounts()['expense']

        # nothing billed yet: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order.line',
            'active_ids': purchase_order.order_line.ids,
            'default_accrual_type': 'billed_not_received',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # full quantity billed, nothing received yet
        self._create_bill(purchase_order)

        # Still no "Billed Not Received" entry. Posting the bill nudges the `qty_available`
        # proxy as if the goods had been received, but a bill never really creates any
        # inventory value for a periodic product (see `get_inventory_value`): that nudge is
        # itself an artifact of billing, not of anything physical, so it's excluded from
        # Ending Stock's valuation-account total up front, leaving only its counterpart
        # under Stock Variation.
        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertNotIn('accrual', report_data)
        self.assertEqual(report_data['stock_variation']['lines'], [
            {'account_id': stock_valuation_account.id, 'debit': 2000.0, 'credit': 0},
            {'account_id': stock_variation_account.id, 'debit': 0, 'credit': 2000.0},
        ])
        self.assertEqual(report_data["stock_variation"]["value"], 2000.0)
        self.assertEqual(report_data["ending_stock"]["value"], 2000.0)

        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': expense_account.id, 'debit': 0, 'credit': 1000},
            {'account_id': accrual_account.id, 'debit': 1000, 'credit': 0},
        ])


        # The closing action reproduces that same pair in its own entry, plus a second,
        # separate entry for the correction it alone posts.
        self._cancel_accrual_entries(account_move)
        action = self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)
        moves = self.env['account.move'].search(action['domain']).filtered(lambda m: not m.reversed_entry_id)
        accrual_move = moves.filtered(lambda m: accrual_account in m.line_ids.account_id)
        closing_move = moves.filtered(lambda m: stock_variation_account in m.line_ids.account_id)
        self.assertEqual(len(moves), 2)
        self.assertRecordValues(
            forward_lines,
            [
                {"account_id": accrual_account.id, "debit": 1000, "credit": 0},
                {"account_id": expense_account.id, "debit": 0, "credit": 1000},
            ],
        )
        self.assertRecordValues(closing_move.line_ids, [
            {'account_id': stock_valuation_account.id, 'debit': 2000, 'credit': 0},
            {'account_id': stock_variation_account.id, 'debit': 0, 'credit': 2000},
        ])

    def test_multi_currency_accrued_order(self):
        # 5 qty of each product billeable
        self.purchase_order.order_line.qty_received = 5
        # set currency != company currency
        self.purchase_order.currency_id = self.other_currency
        moves = self.env['account.move'].search(self.wizard.create_entries()['domain'])
        for move in moves:
            self.assertEqual(move.currency_id, self.purchase_order.currency_id)
        self.assertRecordValues(moves.line_ids, [
            # reverse move lines
            {'account_id': self.account_expense.id, 'debit': 0, 'credit': 5000 / 2, 'amount_currency': -5000},
            {'account_id': self.alt_exp_account.id, 'debit': 0, 'credit': 1000 / 2, 'amount_currency': -1000},
            {'account_id': self.account_revenue.id, 'debit': 6000 / 2, 'credit': 0, 'amount_currency': 0.0},
            # move lines
            {'account_id': self.account_expense.id, 'debit': 5000 / 2, 'credit': 0, 'amount_currency': 5000},
            {'account_id': self.alt_exp_account.id, 'debit': 1000 / 2, 'credit': 0, 'amount_currency': 1000},
            {'account_id': self.account_revenue.id, 'debit': 0, 'credit': 6000 / 2, 'amount_currency': 0.0},
        ])

    def test_analytic_account_accrued_order(self):
        self.purchase_order.order_line.qty_received = 10

        self.assertRecordValues(self.env['account.move'].search(self.wizard.create_entries()['domain']).line_ids, [
            # reverse move lines
            {'account_id': self.account_expense.id, 'debit': 0.0, 'credit': 10000.0, 'analytic_distribution': {str(self.analytic_account_a.id): 80.0, str(self.analytic_account_b.id): 20.0}},
            {'account_id': self.alt_exp_account.id, 'debit': 0.0, 'credit': 2000.0, 'analytic_distribution': {str(self.analytic_account_b.id): 100.0}},
            {'account_id': self.account_revenue.id, 'debit': 12000.0, 'credit': 0.0, 'analytic_distribution': {str(self.analytic_account_a.id): 66.67, str(self.analytic_account_b.id): 33.33}},
            # move lines
            {'account_id': self.account_expense.id, 'debit': 10000.0, 'credit': 0.0, 'analytic_distribution': {str(self.analytic_account_a.id): 80.0, str(self.analytic_account_b.id): 20.0}},
            {'account_id': self.alt_exp_account.id, 'debit': 2000.0, 'credit': 0.0, 'analytic_distribution': {str(self.analytic_account_b.id): 100.0}},
            {'account_id': self.account_revenue.id, 'debit': 0.0, 'credit': 12000.0, 'analytic_distribution': {str(self.analytic_account_a.id): 66.67, str(self.analytic_account_b.id): 33.33}},
        ])

    def test_accrued_order_with_tax_included(self):
        tax_10_included = self.env['account.tax'].create({
            'name': 'Tax 10% included',
            'amount': 10.0,
            'type_tax_use': 'purchase',
            'price_include_override': 'tax_included',
        })
        self.purchase_order.order_line.tax_ids = tax_10_included
        self.purchase_order.order_line.qty_received = 5
        self.assertRecordValues(self.env['account.move'].search(self.wizard.create_entries()['domain']).line_ids, [
            # reverse move lines
            {'account_id': self.account_expense.id, 'debit': 0.0, 'credit': 4545.45},
            {'account_id': self.alt_exp_account.id, 'debit': 0.0, 'credit': 909.09},
            {'account_id': self.account_revenue.id, 'debit': 5454.54, 'credit': 0.0},
            # move lines
            {'account_id': self.account_expense.id, 'debit': 4545.45, 'credit': 0.0},
            {'account_id': self.alt_exp_account.id, 'debit': 909.09, 'credit': 0.0},
            {'account_id': self.account_revenue.id, 'debit': 0.0, 'credit': 5454.54},
        ])

    def test_accrued_order_returned(self):
        self.purchase_order.order_line.qty_received = 10
        # received products billed, nothing to bill left
        move = self.env['account.move'].browse(self.purchase_order.action_create_invoice()['res_id'])
        move.invoice_date = '2020-01-01'
        move.action_post()

        with self.assertRaises(UserError):
            self.wizard.create_entries()

        self.purchase_order.order_line.qty_received = 5
        res = self.env['account.move'].search(self.wizard.create_entries()['domain']).line_ids
        self.assertRecordValues(res, [
            # reverse move lines
            {'account_id': self.account_expense.id, 'debit': 5000.0, 'credit': 0.0},
            {'account_id': self.alt_exp_account.id, 'debit': 1000.0, 'credit': 0.0},
            {'account_id': self.account_revenue.id, 'debit': 0.0, 'credit': 6000.0},
            # move lines
            {'account_id': self.account_expense.id, 'debit': 0.0, 'credit': 5000.0},
            {'account_id': self.alt_exp_account.id, 'debit': 0.0, 'credit': 1000.0},
            {'account_id': self.account_revenue.id, 'debit': 6000.0, 'credit': 0.0},
        ])

        self.purchase_order.order_line.qty_received = 0
        res = self.env['account.move'].search(self.wizard.create_entries()['domain']).line_ids
        self.assertRecordValues(res, [
            # reverse move lines
            {'account_id': self.account_expense.id, 'debit': 10000.0, 'credit': 0.0},
            {'account_id': self.alt_exp_account.id, 'debit': 2000.0, 'credit': 0.0},
            {'account_id': self.account_revenue.id, 'debit': 0.0, 'credit': 12000.0},
            # move lines
            {'account_id': self.account_expense.id, 'debit': 0.0, 'credit': 10000.0},
            {'account_id': self.alt_exp_account.id, 'debit': 0.0, 'credit': 2000.0},
            {'account_id': self.account_revenue.id, 'debit': 12000.0, 'credit': 0.0},
        ])

    def test_accrual_entry_date_as_string_from_context(self):
        """
        Test that passing `accrual_entry_date` as a string in the context
        does not raise an error and accrual entries are created correctly.
        """
        self.purchase_order.order_line.qty_received = 10
        move = self.env['account.move'].browse(self.purchase_order.action_create_invoice()['res_id'])
        move.invoice_date = '2020-01-01'
        move.action_post()
        self.purchase_order.order_line.qty_received = 5
        wizard = self.wizard.with_context(accrual_entry_date='2020-01-30')
        res = self.env['account.move'].search(wizard.create_entries()['domain']).line_ids
        self.assertRecordValues(res, [
            # move lines
            {'account_id': self.account_expense.id, 'debit': 0.0, 'credit': 5000.0},
            {'account_id': self.alt_exp_account.id, 'debit': 0.0, 'credit': 1000.0},
            {'account_id': self.account_revenue.id, 'debit': 6000.0, 'credit': 0.0},
            # reverse move lines
            {'account_id': self.account_expense.id, 'debit': 5000.0, 'credit': 0.0},
            {'account_id': self.alt_exp_account.id, 'debit': 1000.0, 'credit': 0.0},
            {'account_id': self.account_revenue.id, 'debit': 0.0, 'credit': 6000.0},
        ])

    def test_error_when_different_currencies_accrued(self):
        """
        Tests that if two Purchase Orders with different currencies are selected for Accrued Expense Entry, 
        a UserError is raised.
        """
        purchase_orders = self.env['purchase.order'].create([
            {
                'partner_id': self.partner_a.id,
                'currency_id': self.company_data['currency'].id,
            }, 
            {
                'partner_id': self.partner_a.id,
                'currency_id': self.other_currency.id,
            }
        ])
        purchase_orders.button_confirm()
        accrued_wizard = self.create_wizard(active_ids=purchase_orders.ids)
        with self.assertRaises(UserError, msg="An error should be raised if two different currencies are used for Accrued Expense Entry."):
            accrued_wizard._compute_move_vals()

    def test_accrued_entries_with_discount(self):
        purchase_order = self.env['purchase.order'].create({
            'partner_id': self.partner_a.id,
            'order_line': [
                Command.create({
                    'name': self.product_a.name,
                    'product_id': self.product_a.id,
                    'product_qty': 10.0,
                    'uom_id': self.product_a.uom_id.id,
                    'price_unit': 10.0,
                    'tax_ids': False,
                    'discount': 10,
                }),
            ],
        })
        purchase_order.button_confirm()
        purchase_order.order_line.qty_received = 10
        accrued_wizard = self.create_wizard(active_ids=purchase_order.ids)

        res = self.env['account.move'].search(accrued_wizard.create_entries()['domain']).line_ids
        self.assertRecordValues(res, [
            {'debit': 0.0, 'credit': 90.0},
            {'debit': 90.0, 'credit': 0.0},
            {'debit': 90.0, 'credit': 0.0},
            {'debit': 0.0, 'credit': 90.0},
        ])

    def test_accrued_entries_with_no_date(self):
        wizard_form = Form(self.wizard)
        wizard_form.date = False
        with self.assertRaises(AssertionError):
            wizard_form.save()

    def test_accrued_order_wizard_zero_total(self):
        """
        Test that setting a PO line quantity to 0 (resulting in a 0 total)
        does not cause a ZeroDivisionError in the Accrued Expense Entry wizard.
        """
        purchase_order = self.env['purchase.order'].create({
            'partner_id': self.partner_a.id,
            'order_line': [
                Command.create({
                    'name': self.product_a.name,
                    'product_id': self.product_a.id,
                    'product_qty': 10.0,
                    'price_unit': 100.0,
                })
            ]
        })
        purchase_order.button_confirm()
        purchase_order.order_line.qty_received = 10.0
        purchase_order.order_line.product_qty = 0.0

        wizard = self.create_wizard(
            active_ids=purchase_order.ids,
            account_id=self.company_data['default_account_payable'].id,
        )

        accrued_entry = wizard.create_entries()
        self.assertTrue(accrued_entry)

    def test_duplicate_entry_detection(self):
        self.purchase_order.order_line.qty_received = 5
        accrual_entries = self.env['account.move'].search(self.wizard.with_context(default_accrual_type='bill_to_receive').create_entries()['domain'])
        duplicate = self.wizard.with_context(default_accrual_type='bill_to_receive').copy().duplicate_entry_id

        self.assertTrue(duplicate)
        self.assertIn(duplicate.id, accrual_entries.ids)

    def test_duplicate_entries_are_deleted(self):
        self.purchase_order.order_line.qty_received = 5
        accrual_entries = self.env['account.move'].search(self.create_wizard().create_entries()['domain'])

        self.assertTrue(accrual_entries.exists())

        new_accrual_entries = self.env['account.move'].search(self.create_wizard().create_entries()['domain'])

        self.assertTrue(new_accrual_entries.exists())
        self.assertFalse(accrual_entries.exists())
