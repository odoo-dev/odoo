from freezegun import freeze_time
from dateutil.relativedelta import relativedelta

from odoo import fields
from odoo.tests import tagged
from odoo.exceptions import UserError
from .common import PurchaseTestCommon


@tagged('post_install', '-at_install')
class TestAccruedPurchaseStock(PurchaseTestCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        product = cls.env['product.product'].create({
            'name': "Product",
            'list_price': 30.0,
            'uom_id': cls.uom.id,
        })
        cls.partner_a = cls.vendor
        cls.purchase_order = cls._create_purchase(
            cls,
            product=product,
            quantity=10.0,
            price_unit=product.list_price,
            partner_id=cls.partner_a.id,
        )

    def test_purchase_stock_accruals(self):
        # receive 2 on 2020-01-02
        receipt1 = self._receive(self.purchase_order, quantity=2)
        receipt1.write({'date': fields.Date.to_date('2020-01-02')})

        # receive 3 on 2020-01-06
        receipt2 = self._receive(self.purchase_order, quantity=3)
        receipt2.write({'date': fields.Date.to_date('2020-01-06')})

        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order',
            'active_ids': self.purchase_order.ids,
        }).create({
            'account_id': self.account_expense.id,
            'date': '2020-01-01',
        })
        # nothing to invoice on 2020-01-01
        with self.assertRaises(UserError):
            wizard.create_entries()

        # 2 to invoice on 2020-01-04
        wizard.date = fields.Date.to_date('2020-01-04')
        self.assertRecordValues(self.env['account.move'].search(wizard.create_entries()['domain']).line_ids, [
            # reverse move lines
            {'account_id': self.account_expense.id, 'debit': 0, 'credit': 60},
            {'account_id': wizard.account_id.id, 'debit': 60, 'credit': 0},
            # move lines
            {'account_id': self.account_expense.id, 'debit': 60, 'credit': 0},
            {'account_id': wizard.account_id.id, 'debit': 0, 'credit': 60},
        ])

        # 5 to invoice on 2020-01-07
        wizard.date = fields.Date.to_date('2020-01-07')
        self.assertRecordValues(self.env['account.move'].search(wizard.create_entries()['domain']).line_ids, [
            # reverse move lines
            {'account_id': self.account_expense.id, 'debit': 0, 'credit': 150},
            {'account_id': wizard.account_id.id, 'debit': 150, 'credit': 0},
            # move lines
            {'account_id': self.account_expense.id, 'debit': 150, 'credit': 0},
            {'account_id': wizard.account_id.id, 'debit': 0, 'credit': 150},
        ])

    def test_purchase_stock_invoiced_accrued_entries(self):
        # deliver 2 on 2020-01-02
        receipt1 = self._receive(self.purchase_order, quantity=2)
        receipt1.write({'date': fields.Date.to_date('2020-01-02')})

        # invoice on 2020-01-04
        bill1 = self._create_bill(purchase_order=self.purchase_order, post=False)
        bill1.invoice_date = fields.Date.to_date('2020-01-04')
        bill1.action_post()

        # deliver 3 on 2020-01-06
        receipt2 = self._receive(self.purchase_order, quantity=3)
        receipt2.write({'date': fields.Date.to_date('2020-01-06')})

        # invoice on 2020-01-08
        bill2 = self._create_bill(purchase_order=self.purchase_order, post=False)
        bill2.invoice_date = fields.Date.to_date('2020-01-08')
        bill2.action_post()

        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order',
            'active_ids': self.purchase_order.ids,
        }).create({
            'account_id': self.account_expense.id,
            'date': '2020-01-02',
        })

        # 2 to invoice on 2020-01-07
        self.assertRecordValues(self.env['account.move'].search(wizard.create_entries()['domain']).line_ids, [
            # reverse move lines
            {'account_id': self.account_expense.id, 'debit': 0, 'credit': 60},
            {'account_id': wizard.account_id.id, 'debit': 60, 'credit': 0},
            # move lines
            {'account_id': self.account_expense.id, 'debit': 60, 'credit': 0},
            {'account_id': wizard.account_id.id, 'debit': 0, 'credit': 60},
        ])

        # nothing to invoice on 2020-01-05
        wizard.date = fields.Date.to_date('2020-01-05')
        with self.assertRaises(UserError):
            wizard.create_entries()

        # 3 to invoice on 2020-01-07
        wizard.date = fields.Date.to_date('2020-01-07')
        self.assertRecordValues(self.env['account.move'].search(wizard.create_entries()['domain']).line_ids, [
            # reverse move lines
            {'account_id': self.account_expense.id, 'debit': 0, 'credit': 90},
            {'account_id': wizard.account_id.id, 'debit': 90, 'credit': 0},
            # move lines
            {'account_id': self.account_expense.id, 'debit': 90, 'credit': 0},
            {'account_id': wizard.account_id.id, 'debit': 0, 'credit': 90},
        ])

        # nothing to invoice on 2020-01-09
        wizard.date = fields.Date.to_date('2020-01-09')
        with self.assertRaises(UserError):
            wizard.create_entries()

    @freeze_time('2025-07-01')
    def test_purchase_stock_accruals_anglo_saxon_price_diff(self):
        """ With anglo-saxon accounting, ensure that accrued wizard generates entries for
        difference between product standard cost and invoiced price or delivered price."""
        self.env.company.anglo_saxon_accounting = True
        account_receivable = self.account_receivable
        self.product.categ_id = self.category_standard
        # Config a product to be in perpetual valuation and use a price diff. account.
        stock_price_diff_acc_id = self.env['account.account'].create({
            'name': 'default_account_stock_price_diff',
            'code': 'STOCKDIFF',
            'reconcile': True,
            'account_type': 'asset_current',
        })
        # `product` standard price: $ 800.00, vendor price: $ 1,000.00
        self.product.categ_id.update({
            'property_valuation': 'real_time',
            'property_price_difference_account_id': stock_price_diff_acc_id.id,
        })
        account_stock_variation = self.product.categ_id.account_stock_variation_id
        self.product.write({
            'standard_price': 800.0,
            'list_price': 1000.0,
        })
        purchase_order = self._create_purchase(
            product=self.product,
            quantity=10,
            price_unit=self.product.list_price,  # $1,000.00
            partner_id=self.partner_a.id,
        )
        # Create two invoices in the past.
        invoice_1 = self._create_bill(purchase_order=purchase_order, quantity=2, post=False)
        invoice_1.write({
            'invoice_date': fields.Date.to_date('2025-04-01'),
            'date': fields.Date.to_date('2025-04-01'),
        })
        invoice_1.action_post()
        invoice_2 = self._create_bill(purchase_order=purchase_order, quantity=5, price_unit=900.00, post=False)
        invoice_2.write({
            'move_type': 'in_invoice',
            'invoice_date': fields.Date.to_date('2025-06-01'),
            'date': fields.Date.to_date('2025-06-01'),
        })
        invoice_2.action_post()

        # Receive 1 unit yesterday.
        with freeze_time('2025-06-30'):
            self._receive(purchase_order, quantity=1)
        # Receive two more units today.
        self._receive(purchase_order, quantity=2)

        # Use accrued order wizard and check generated values for date in the past.
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order',
            'active_ids': [purchase_order.id],
        }).create({
            'account_id': account_receivable.id,
            'date': '2025-05-31',
        })
        account_move_domain = wizard.create_entries()['domain']
        account_moves = self.env['account.move'].search(account_move_domain)
        # Expense: $ 2,000.00 (invoiced 2x $ 1,000.00 but nothing received yet.)
        # Price diff.: $ 400.00 ($ 2,000.00 - (2x $ 800.00) = $ 2,000.00 - $ 1,600.00)
        self.assertRecordValues(account_moves.line_ids.sorted('id'), [
            # Accrued revenues entries.
            {'account_id': self.account_expense.id, 'debit': 0, 'credit': 2000},
            {'account_id': account_receivable.id, 'debit': 2000, 'credit': 0},
            {'account_id': stock_price_diff_acc_id.id, 'debit': 0, 'credit': 400},
            {'account_id': account_stock_variation.id, 'debit': 400, 'credit': 0},
            # Reversal of accrued revenues entries.
            {'account_id': self.account_expense.id, 'debit': 2000, 'credit': 0},
            {'account_id': account_receivable.id, 'debit': 0, 'credit': 2000},
            {'account_id': stock_price_diff_acc_id.id, 'debit': 400, 'credit': 0},
            {'account_id': account_stock_variation.id, 'debit': 0, 'credit': 400},
        ])

        # Use accrued order wizard and check generated values (at last week.)
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order',
            'active_ids': [purchase_order.id],
        }).create({
            'account_id': account_receivable.id,
            'date': fields.Date.today() - relativedelta(days=7),
        })
        account_move_domain = wizard.create_entries()['domain']
        account_moves = self.env['account.move'].search(account_move_domain)
        # Expense: $ 6,500.00 (invoiced (2x $ 1,000.00) + (5x $ 900.00) = 2,000.00 $ + 4,500.00 $)
        # Price diff.: $ 900.00 ($ 6,500.00 - (7x $ 800.00) = $ 6,500.00 - $ 5,600.00)
        self.assertRecordValues(account_moves.line_ids.sorted('id'), [
            # Accrued revenues entries.
            {'account_id': self.account_expense.id, 'debit': 0, 'credit': 6500},
            {'account_id': account_receivable.id, 'debit': 6500, 'credit': 0},
            {'account_id': stock_price_diff_acc_id.id, 'debit': 0, 'credit': 900},
            {'account_id': account_stock_variation.id, 'debit': 900, 'credit': 0},
            # Reversal of accrued revenues entries.
            {'account_id': self.account_expense.id, 'debit': 6500, 'credit': 0},
            {'account_id': account_receivable.id, 'debit': 0, 'credit': 6500},
            {'account_id': stock_price_diff_acc_id.id, 'debit': 900, 'credit': 0},
            {'account_id': account_stock_variation.id, 'debit': 0, 'credit': 900},
        ])

        # Use accrued order wizard and check generated values (at yesterday.)
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order',
            'active_ids': [purchase_order.id],
        }).create({
            'account_id': account_receivable.id,
            'date': fields.Date.today() - relativedelta(days=1),
        })
        account_move_domain = wizard.create_entries()['domain']
        account_moves = self.env['account.move'].search(account_move_domain)
        # Expense: $ 5,500.00 (invoiced (2x $ 1,000.00) + (5x $ 900.00) - received (1x $ 1,000.00) = 2,000.00 $ + 4,500.00 $ - $ 1,000.00)
        # Price diff.: $ 700.00 ($ 5,500.00 - (6x $ 800.00) = $ 5,500.00 - $ 4,800.00)
        self.assertRecordValues(account_moves.line_ids.sorted('id'), [
            # Accrued revenues entries.
            {'account_id': self.account_expense.id, 'debit': 0, 'credit': 5500},
            {'account_id': account_receivable.id, 'debit': 5500, 'credit': 0},
            {'account_id': stock_price_diff_acc_id.id, 'debit': 0, 'credit': 700},
            {'account_id': account_stock_variation.id, 'debit': 700, 'credit': 0},
            # Reversal of accrued revenues entries.
            {'account_id': self.account_expense.id, 'debit': 5500, 'credit': 0},
            {'account_id': account_receivable.id, 'debit': 0, 'credit': 5500},
            {'account_id': stock_price_diff_acc_id.id, 'debit': 700, 'credit': 0},
            {'account_id': account_stock_variation.id, 'debit': 0, 'credit': 700},
        ])

        # Use accrued order wizard and check generated values (at today.)
        wizard = self.env['account.accrued.orders.wizard'].with_context({
            'active_model': 'purchase.order',
            'active_ids': [purchase_order.id],
        }).create({
            'account_id': account_receivable.id,
            'date': fields.Date.today(),
        })
        account_move_domain = wizard.create_entries()['domain']
        account_moves = self.env['account.move'].search(account_move_domain)
        # Expense: $ 3,500.00 (invoiced (2x $ 1,000.00) + (5x $ 900.00) - received (3x $ 1,000.00) = 2,000.00 $ + 4,500.00 $ - $ 3,000.00)
        # Price diff.: $ 300.00 ($ 3,500.00 - (4x $ 800.00) = $ 3,500.00 - $ 3,200.00)
        self.assertRecordValues(account_moves.line_ids.sorted('id'), [
            # Accrued revenues entries.
            {'account_id': self.account_expense.id, 'debit': 0, 'credit': 3500},
            {'account_id': account_receivable.id, 'debit': 3500, 'credit': 0},
            {'account_id': stock_price_diff_acc_id.id, 'debit': 0, 'credit': 300},
            {'account_id': account_stock_variation.id, 'debit': 300, 'credit': 0},
            # Reversal of accrued revenues entries.
            {'account_id': self.account_expense.id, 'debit': 3500, 'credit': 0},
            {'account_id': account_receivable.id, 'debit': 0, 'credit': 3500},
            {'account_id': stock_price_diff_acc_id.id, 'debit': 300, 'credit': 0},
            {'account_id': account_stock_variation.id, 'debit': 0, 'credit': 300},
        ])
