# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields
from odoo.exceptions import UserError
from odoo.fields import Command
from odoo.tests import freeze_time, tagged

from odoo.addons.sale.tests.common import TestSaleCommon


@freeze_time("2022-01-01")
@tagged("post_install", "-at_install")
class TestAccruedSaleOrders(TestSaleCommon):
    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.other_currency = cls.setup_other_currency("EUR")
        cls.alt_inc_account = cls.company_data["default_account_revenue"].copy()
        # set 'invoice_policy' to 'delivery' to take 'qty_delivered' into account when computing
        # 'untaxed_amount_to_invoice'
        # set 'type' to 'service' to allow manualy set 'qty_delivered' even with sale_stock
        cls.product_a.update({"type": "service", "invoice_policy": "delivery"})
        cls.product_b.update({
            "type": "service",
            "invoice_policy": "delivery",
            "property_account_income_id": cls.alt_inc_account.id,
        })
        cls.default_plan = cls.env["account.analytic.plan"].create({"name": "Default"})
        cls.analytic_account_a = cls.env["account.analytic.account"].create({
            "name": "analytic_account_a",
            "plan_id": cls.default_plan.id,
            "company_id": False,
        })
        cls.analytic_account_b = cls.env["account.analytic.account"].create({
            "name": "analytic_account_b",
            "plan_id": cls.default_plan.id,
            "company_id": False,
        })
        cls.sale_order = cls.env["sale.order"].create({
            "partner_id": cls.partner_a.id,
            "order_line": [
                Command.create({
                    "name": cls.product_a.name,
                    "product_id": cls.product_a.id,
                    "product_uom_qty": 10.0,
                    "price_unit": cls.product_a.list_price,
                    "tax_ids": False,
                    "analytic_distribution": {
                        cls.analytic_account_a.id: 80.0,
                        cls.analytic_account_b.id: 20.0,
                    },
                }),
                Command.create({
                    "name": cls.product_b.name,
                    "product_id": cls.product_b.id,
                    "product_uom_qty": 10.0,
                    "price_unit": cls.product_b.list_price,
                    "tax_ids": False,
                    "analytic_distribution": {cls.analytic_account_b.id: 100.0},
                }),
            ],
        })
        cls.sale_order.action_confirm()
        cls.account_expense = cls.company_data["default_account_expense"]
        cls.account_revenue = cls.company_data["default_account_revenue"]
        cls.wizard = (
            cls
            .env["account.accrued.orders.wizard"]
            .with_context({"active_model": "sale.order", "active_ids": cls.sale_order.ids, 'default_accrual_type': 'invoice_to_be_issued'})
            .create({"account_id": cls.account_expense.id, "date": fields.Date.today()})
        )

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
            'list_price': 100.0,
        })

    def _create_sale_order(self, product, qty=10.0):
        sale_order = self.env['sale.order'].create({
            'partner_id': self.partner_a.id,
            'order_line': [Command.create({
                'name': product.name,
                'product_id': product.id,
                'product_uom_qty': qty,
                'price_unit': product.list_price,
                'tax_ids': False,
            })],
        })
        sale_order.action_confirm()
        return sale_order

    def _create_invoice(self, sale_order, invoice_date=False):
        invoice = sale_order._create_invoices()
        invoice.invoice_date = invoice_date or fields.Date.today()
        invoice.action_post()
        return invoice

    def _cancel_accrual_entries(self, moves):
        moves.filtered(lambda m: m.state == 'posted').button_draft()
        moves.unlink()

    def _filter_reversal(self, moves):
        """ `moves.line_ids` without the scheduled reversal move's lines (its exact mirror). """
        return moves.filtered(lambda m: not m.reversed_entry_id).line_ids

    def test_invoice_to_be_issued(self):
        """ A non-stock-tracked product's "Invoices to be Issued" accrual: check both the
        created journal entries and the inventory valuation report's accrual breakdown. """
        product = self._create_accrual_product(storable=False, real_time=False)
        sale_order = self._create_sale_order(product)
        accrual_account = product.product_tmpl_id._get_product_accounts()['invoices_to_issue']
        income_account = product.product_tmpl_id._get_product_accounts()['income']

        # nothing to invoice: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'sale.order.line',
            'active_ids': sale_order.order_line.ids,
            'default_accrual_type': 'invoice_to_be_issued',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # 5 qty delivered, nothing invoiced yet
        sale_order.order_line.qty_delivered = 5

        # Not a stock-tracked product: no place in a *stock* valuation report.
        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertNotIn('accrual', report_data)
        self.assertFalse(report_data['stock_variation']['lines'])

        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': income_account.id, 'debit': 0, 'credit': 500},
            {'account_id': accrual_account.id, 'debit': 500, 'credit': 0},
        ])

        # The closing action is scoped to storable products, so it has nothing to do here.
        self._cancel_accrual_entries(account_move)
        with self.assertRaises(UserError):
            self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)

    def test_invoiced_not_delivered(self):
        """ A non-stock-tracked product's "Invoiced Not Delivered" accrual: the invoice is
        posted for the full ordered quantity before anything is delivered, so the accrual
        reverses the revenue already recognized until the goods actually go out. """
        product = self._create_accrual_product(storable=False, real_time=False)
        # Invoice on ordered quantities, or nothing would be invoiceable with none delivered.
        product.invoice_policy = 'order'
        sale_order = self._create_sale_order(product)
        accrual_account = product.product_tmpl_id._get_product_accounts()['invoiced_not_delivered']
        income_account = product.product_tmpl_id._get_product_accounts()['income']

        # nothing invoiced yet: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'sale.order.line',
            'active_ids': sale_order.order_line.ids,
            'default_accrual_type': 'invoiced_not_delivered',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # full quantity invoiced, nothing delivered yet
        self._create_invoice(sale_order)

        # Not a stock-tracked product: no place in a *stock* valuation report.
        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertNotIn('accrual', report_data)
        self.assertFalse(report_data['stock_variation']['lines'])

        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': income_account.id, 'debit': 1000, 'credit': 0},
            {'account_id': accrual_account.id, 'debit': 0, 'credit': 1000},
        ])

        # The closing action is scoped to storable products, so it has nothing to do here
        # either, even though the invoice itself is still posted.
        self._cancel_accrual_entries(account_move)
        with self.assertRaises(UserError):
            self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)

    def test_invoice_to_be_issued_realtime(self):
        """ Same as `test_invoice_to_be_issued`, but for a storable, real-time-valued
        product: an invoice also posts a COGS entry crediting `stock_valuation` and
        debiting `expense`, so the accrual needs its own undo for that too. """
        product = self._create_accrual_product(storable=True, real_time=True)
        sale_order = self._create_sale_order(product)
        accrual_account = product.product_tmpl_id._get_product_accounts()['invoices_to_issue']
        stock_valuation_account = product.product_tmpl_id._get_product_accounts()['stock_valuation']
        income_account = product.product_tmpl_id._get_product_accounts()['income']
        expense_account = product.product_tmpl_id._get_product_accounts()['expense']

        # nothing to invoice: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'sale.order.line',
            'active_ids': sale_order.order_line.ids,
            'default_accrual_type': 'invoice_to_be_issued',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # 5 qty delivered, nothing invoiced yet
        sale_order.order_line.qty_delivered = 5

        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertEqual(report_data['accrual']['lines'], [{
            'display_name': 'Invoices to be Issued',
            'account_id': False,
            'debit': 500.0,
            'credit': 0,
            'lines': [{
                'display_name': expense_account.display_name,
                'account_id': expense_account.id,
                'debit': 500.0,
                'credit': 0,
            }],
        }])
        self.assertEqual(report_data['ending_stock']['lines_by_account_id'][stock_valuation_account.id], {'value': -500.0})
        self.assertEqual(report_data['ending_stock']['lines_by_account_id'][expense_account.id], {'value': 500.0})
        self.assertFalse(report_data['stock_variation']['lines'])

        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': income_account.id, 'debit': 0, 'credit': 500},
            {'account_id': stock_valuation_account.id, 'debit': 0, 'credit': 500},
            {'account_id': accrual_account.id, 'debit': 500, 'credit': 0},
            {'account_id': expense_account.id, 'debit': 500, 'credit': 0},
        ])

        # Real-time has no separate "correction" concept, so the closing action
        # reproduces the exact same thing.
        self._cancel_accrual_entries(account_move)
        action = self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)
        moves = self.env['account.move'].search(action['domain'])
        self.assertRecordValues(self._filter_reversal(moves), [
            {'account_id': income_account.id, 'debit': 0, 'credit': 500},
            {'account_id': stock_valuation_account.id, 'debit': 0, 'credit': 500},
            {'account_id': accrual_account.id, 'debit': 500, 'credit': 0},
            {'account_id': expense_account.id, 'debit': 500, 'credit': 0},
        ])

    def test_invoiced_not_delivered_realtime(self):
        """ Same as `test_invoiced_not_delivered`, but for a storable, real-time-valued
        product: the invoice's own COGS entry already touched `stock_valuation`/`expense`,
        so reverting it undoes that same pair instead of a plain revenue-only reversal. """
        product = self._create_accrual_product(storable=True, real_time=True)
        product.invoice_policy = 'order'
        sale_order = self._create_sale_order(product)
        accrual_account = product.product_tmpl_id._get_product_accounts()['invoiced_not_delivered']
        stock_valuation_account = product.product_tmpl_id._get_product_accounts()['stock_valuation']
        income_account = product.product_tmpl_id._get_product_accounts()['income']
        expense_account = product.product_tmpl_id._get_product_accounts()['expense']

        # nothing invoiced yet: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'sale.order.line',
            'active_ids': sale_order.order_line.ids,
            'default_accrual_type': 'invoiced_not_delivered',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # full quantity invoiced, nothing delivered yet
        self._create_invoice(sale_order)

        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertEqual(report_data['accrual']['lines'], [{
            'display_name': 'Invoiced Not Delivered',
            'account_id': False,
            'debit': 0,
            'credit': 1000.0,
            'lines': [{
                'display_name': expense_account.display_name,
                'account_id': expense_account.id,
                'debit': 0,
                'credit': 1000.0,
            }],
        }])
        # Posting the invoice also nudges the `qty_available` proxy as if the goods had
        # been delivered, contributing -1000 here; the accrual's own +1000 correction
        # nets that back to 0 — correct, since nothing was actually delivered.
        self.assertEqual(report_data['ending_stock']['lines_by_account_id'][stock_valuation_account.id], {'value': 0.0})
        self.assertEqual(report_data['ending_stock']['lines_by_account_id'][expense_account.id], {'value': -1000.0})
        self.assertFalse(report_data['stock_variation']['lines'])

        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': income_account.id, 'debit': 1000, 'credit': 0},
            {'account_id': stock_valuation_account.id, 'debit': 1000, 'credit': 0},
            {'account_id': accrual_account.id, 'debit': 0, 'credit': 1000},
            {'account_id': expense_account.id, 'debit': 0, 'credit': 1000},
        ])

        self._cancel_accrual_entries(account_move)
        action = self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)
        moves = self.env['account.move'].search(action['domain'])
        self.assertRecordValues(self._filter_reversal(moves), [
            {'account_id': income_account.id, 'debit': 1000, 'credit': 0},
            {'account_id': stock_valuation_account.id, 'debit': 1000, 'credit': 0},
            {'account_id': accrual_account.id, 'debit': 0, 'credit': 1000},
            {'account_id': expense_account.id, 'debit': 0, 'credit': 1000},
        ])

    def test_invoice_to_be_issued_periodic(self):
        """ Same as `test_invoice_to_be_issued`, but for a storable, periodic-valued
        product. The classic revenue line still applies, but the `qty_available`
        correction it also needs is the closing action's job, not a plain accrual
        entry's. """
        product = self._create_accrual_product(storable=True, real_time=False)
        sale_order = self._create_sale_order(product)
        accrual_account = product.product_tmpl_id._get_product_accounts()['invoices_to_issue']
        stock_valuation_account = product.product_tmpl_id._get_product_accounts()['stock_valuation']
        stock_variation_account = product.product_tmpl_id._get_product_accounts()['stock_variation']
        income_account = product.product_tmpl_id._get_product_accounts()['income']

        # nothing to invoice: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'sale.order.line',
            'active_ids': sale_order.order_line.ids,
            'default_accrual_type': 'invoice_to_be_issued',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # 5 qty delivered, nothing invoiced yet
        sale_order.order_line.qty_delivered = 5

        # No "Invoices to be Issued" entry (periodic has nothing to do with stock
        # valuation), but the pending correction already previews through Ending Stock.
        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertNotIn('accrual', report_data)
        self.assertEqual(report_data['ending_stock']['lines_by_account_id'][stock_valuation_account.id], {'value': -500.0})
        self.assertEqual(report_data['ending_stock']['lines_by_account_id'][stock_variation_account.id], {'value': 500.0})

        # The plain wizard only ever posts the classic pair.
        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': income_account.id, 'debit': 0, 'credit': 500},
            {'account_id': accrual_account.id, 'debit': 500, 'credit': 0},
        ])

        # The closing action reproduces that pair, plus the correction it alone posts.
        self._cancel_accrual_entries(account_move)
        action = self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)
        moves = self.env['account.move'].search(action['domain'])
        self.assertRecordValues(self._filter_reversal(moves), [
            {'account_id': income_account.id, 'debit': 0, 'credit': 500},
            {'account_id': stock_valuation_account.id, 'debit': 0, 'credit': 500},
            {'account_id': accrual_account.id, 'debit': 500, 'credit': 0},
            {'account_id': stock_variation_account.id, 'debit': 500, 'credit': 0},
        ])

    def test_invoiced_not_delivered_periodic(self):
        """ Same as `test_invoiced_not_delivered`, but for a storable, periodic-valued
        product. Same split as `test_invoice_to_be_issued_periodic`: the wizard only
        posts the classic pair, the correction is the closing action's job. """
        product = self._create_accrual_product(storable=True, real_time=False)
        product.invoice_policy = 'order'
        sale_order = self._create_sale_order(product)
        accrual_account = product.product_tmpl_id._get_product_accounts()['invoiced_not_delivered']
        stock_valuation_account = product.product_tmpl_id._get_product_accounts()['stock_valuation']
        stock_variation_account = product.product_tmpl_id._get_product_accounts()['stock_variation']
        income_account = product.product_tmpl_id._get_product_accounts()['income']

        # nothing invoiced yet: no entries to be created
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'sale.order.line',
            'active_ids': sale_order.order_line.ids,
            'default_accrual_type': 'invoiced_not_delivered',
        }).create({
            'date': fields.Date.today(),
        })
        with self.assertRaises(UserError):
            wizard.create_entries()

        # full quantity invoiced, nothing delivered yet
        self._create_invoice(sale_order)

        # Still no "Invoiced Not Delivered" entry. Posting the invoice nudges the
        # `qty_available` proxy as if the goods had been delivered, but an invoice never
        # really removes any inventory value for a periodic product (see
        # `get_inventory_value`): that nudge is itself an artifact of invoicing, not of
        # anything physical, so it's excluded from Ending Stock's valuation-account total
        # up front, leaving only its counterpart under Stock Variation.
        report_data = self.env['account.stock.valuation.report'].with_company(self.env.company)._get_report_data()
        self.assertNotIn('accrual', report_data)
        self.assertEqual(report_data['ending_stock']['lines_by_account_id'][stock_valuation_account.id], {'value': 0.0})
        self.assertEqual(report_data['ending_stock']['lines_by_account_id'][stock_variation_account.id], {'value': 0.0})
        # Nothing physically delivered, nothing really posted to the valuation account
        # either: no genuine gap left for Stock Variation to flag.
        self.assertFalse(report_data['stock_variation']['lines'])

        account_move = self.env['account.move'].search(wizard.create_entries()['domain'])
        self.assertRecordValues(self._filter_reversal(account_move), [
            {'account_id': income_account.id, 'debit': 1000, 'credit': 0},
            {'account_id': accrual_account.id, 'debit': 0, 'credit': 1000},
        ])

        # For the same reason, the closing action's own GL reconciliation has nothing left
        # to do here either: it just reproduces the accrual entry as-is.
        self._cancel_accrual_entries(account_move)
        action = self.env.company.action_close_stock_valuation(auto_post=True, include_accruals=True)
        moves = self.env['account.move'].search(action['domain'])
        forward_lines = self._filter_reversal(moves).sorted(lambda l: (l.account_id.id, l.debit, l.credit))
        self.assertRecordValues(forward_lines, [
            {'account_id': accrual_account.id, 'debit': 0, 'credit': 1000},
            {'account_id': income_account.id, 'debit': 1000, 'credit': 0},
        ])

    def test_multi_currency_accrued_order(self):
        # 5 qty of each product billeable
        self.sale_order.order_line.qty_delivered = 5
        # self.sale_order.order_line.product_uom_qty = 5
        # set currency != company currency
        self.sale_order.currency_id = self.other_currency
        self.assertRecordValues(
            self.env["account.move"].search(self.wizard.create_entries()["domain"]).line_ids,
            [
                # reverse move lines
                {
                    "account_id": self.account_revenue.id,
                    "debit": 5000 / 2,
                    "credit": 0,
                    "amount_currency": 5000,
                },
                {
                    "account_id": self.alt_inc_account.id,
                    "debit": 1000 / 2,
                    "credit": 0,
                    "amount_currency": 1000,
                },
                {
                    "account_id": self.account_expense.id,
                    "debit": 0,
                    "credit": 6000 / 2,
                    "amount_currency": 0.0,
                },
                # move lines
                {
                    "account_id": self.account_revenue.id,
                    "debit": 0,
                    "credit": 5000 / 2,
                    "amount_currency": -5000,
                },
                {
                    "account_id": self.alt_inc_account.id,
                    "debit": 0,
                    "credit": 1000 / 2,
                    "amount_currency": -1000,
                },
                {
                    "account_id": self.account_expense.id,
                    "debit": 6000 / 2,
                    "credit": 0,
                    "amount_currency": 0.0,
                },
            ],
        )

    def test_analytic_account_accrued_order(self):
        self.sale_order.order_line.qty_delivered = 10

        self.assertRecordValues(
            self.env["account.move"].search(self.wizard.create_entries()["domain"]).line_ids,
            [
                # reverse move lines
                {
                    "account_id": self.account_revenue.id,
                    "debit": 10000.0,
                    "credit": 0.0,
                    "analytic_distribution": {
                        str(self.analytic_account_a.id): 80.0,
                        str(self.analytic_account_b.id): 20.0,
                    },
                },
                {
                    "account_id": self.alt_inc_account.id,
                    "debit": 2000.0,
                    "credit": 0.0,
                    "analytic_distribution": {str(self.analytic_account_b.id): 100.0},
                },
                {
                    "account_id": self.account_expense.id,
                    "debit": 0.0,
                    "credit": 12000.0,
                    "analytic_distribution": {
                        str(self.analytic_account_a.id): 66.67,
                        str(self.analytic_account_b.id): 33.33,
                    },
                },
                # move lines
                {
                    "account_id": self.account_revenue.id,
                    "debit": 0.0,
                    "credit": 10000.0,
                    "analytic_distribution": {
                        str(self.analytic_account_a.id): 80.0,
                        str(self.analytic_account_b.id): 20.0,
                    },
                },
                {
                    "account_id": self.alt_inc_account.id,
                    "debit": 0.0,
                    "credit": 2000.0,
                    "analytic_distribution": {str(self.analytic_account_b.id): 100.0},
                },
                {
                    "account_id": self.account_expense.id,
                    "debit": 12000.0,
                    "credit": 0.0,
                    "analytic_distribution": {
                        str(self.analytic_account_a.id): 66.67,
                        str(self.analytic_account_b.id): 33.33,
                    },
                },
            ],
        )

    def test_product_name_in_accrued_revenue_entry(self):
        self.sale_order.order_line.qty_delivered = 5

        so_context = {
            "active_model": "sale.order",
            "active_ids": self.sale_order.ids,
            "active_id": self.sale_order.id,
            "default_journal_id": self.company_data["default_journal_sale"].id,
        }
        payment_params = {"advance_payment_method": "percentage", "amount": 50.0}
        downpayment = (
            self.env["sale.advance.payment.inv"].with_context(so_context).create(payment_params)
        )
        invoice = downpayment._create_invoices(self.sale_order)
        invoice.invoice_date = self.wizard.date
        invoice.action_post()
        self.wizard.create_entries()
        self.assertFalse(self.wizard.display_amount)
        self.assertRecordValues(
            self.env["account.move"].search(self.wizard.create_entries()["domain"]).line_ids,
            [
                # reverse move lines
                {"account_id": self.account_revenue.id, "debit": 5000, "credit": 0},
                {"account_id": self.alt_inc_account.id, "debit": 1000, "credit": 0},
                {"account_id": self.wizard.account_id.id, "debit": 0, "credit": 6000},
                # move lines
                {"account_id": self.account_revenue.id, "debit": 0, "credit": 5000},
                {"account_id": self.alt_inc_account.id, "debit": 0, "credit": 1000},
                {"account_id": self.wizard.account_id.id, "debit": 6000, "credit": 0},
            ],
        )
