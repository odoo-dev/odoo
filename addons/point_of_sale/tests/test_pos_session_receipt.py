# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import odoo
from odoo.addons.point_of_sale.tests.common import TestPoSCommon


@odoo.tests.tagged('post_install', '-at_install')
class TestPosSessionReceipt(TestPoSCommon):
    """
    TDD tests for the new POS session closing accounting model.

    NEW MODEL
    =========
    Anonymous orders (to_invoice=False):
      - A single out_receipt per session is created in journal_id (sale journal).
      - No partner on the receipt.
      - Revenue lines are aggregated by (account_id, tax_ids).
      - Cash / bank payment entries reconcile against the receipt's receivable lines,
        exactly as they previously reconciled against the session journal entry.

    Invoiced orders (to_invoice=True):
      - An out_invoice is created in journal_id (same journal, invoice_journal_id removed).
      - A direct account.payment is created per payment, reconciled immediately
        against the invoice. No intermediate "payment move" is created.
      - The session out_receipt does NOT include invoiced orders.

    Config:
      - journal_id  →  sale journal only (was any journal type).
      - invoice_journal_id  →  removed; journal_id is used for invoices too.
      - stock_journal_id  →  new general journal for stock valuation entries.
    """

    def setUp(self):
        super().setUp()
        self.config = self.basic_config
        # product with no tax – simplest case for line aggregation tests
        self.product100 = self.create_product('Product_100', self.categ_basic, 100, 50)
        # product with a 15% tax – used to test aggregation by tax rate
        self.tax15 = self.env['account.tax'].create({
            'name': '15%',
            'amount': 15,
            'amount_type': 'percent',
            'type_tax_use': 'sale',
        })
        self.product115 = self.create_product('Product_115', self.categ_basic, 115, 50)
        self.product115.taxes_id = self.tax15

    # -------------------------------------------------------------------------
    # 1. ANONYMOUS ORDERS → OUT_RECEIPT
    # -------------------------------------------------------------------------

    def test_anon_cash_creates_out_receipt(self):
        """
        Single anonymous cash order → the session creates one out_receipt,
        no partner, posted in journal_id (sale journal).
        Cash statement reconciles against the receipt's cash-pm receivable line.
        """
        self._run_test({
            'payment_methods': self.cash_pm1,
            'orders': [
                {
                    'pos_order_lines_ui_args': [(self.product100, 1)],
                    'payments': [(self.cash_pm1, 100)],
                    'customer': False,
                    'is_invoiced': False,
                    'uuid': 'anon-cash-001',
                },
            ],
            'journal_entries_before_closing': {},
            'journal_entries_after_closing': {
                # The session receipt replaces the old session journal entry.
                # move_type must be 'out_receipt', journal must be the sale journal.
                'session_journal_entry': {
                    'move_type': 'out_receipt',
                    'journal_id': self.config.journal_id.id,
                    'partner_id': False,
                    'line_ids': [
                        # Revenue line – credit
                        {
                            'account_id': self.sales_account.id,
                            'partner_id': False,
                            'debit': 0,
                            'credit': 100,
                            'reconciled': False,
                        },
                        # Receivable line for the cash payment method – debit
                        {
                            'account_id': self.cash_pm1.receivable_account_id.id,
                            'partner_id': False,
                            'debit': 100,
                            'credit': 0,
                            'reconciled': True,   # reconciled with cash statement
                        },
                    ],
                },
                'cash_statement': [
                    ((100,), {
                        'line_ids': [
                            {
                                'account_id': self.cash_pm1.journal_id.default_account_id.id,
                                'partner_id': False,
                                'debit': 100,
                                'credit': 0,
                                'reconciled': False,
                            },
                            {
                                'account_id': self.cash_pm1.receivable_account_id.id,
                                'partner_id': False,
                                'debit': 0,
                                'credit': 100,
                                'reconciled': True,  # reconciled with receipt
                            },
                        ]
                    }),
                ],
                'bank_payments': [],
            },
        })

    def test_anon_bank_creates_out_receipt(self):
        """
        Single anonymous bank order → out_receipt; bank account.payment
        reconciles against the receipt's bank-pm receivable line.
        """
        self._run_test({
            'payment_methods': self.cash_pm1 | self.bank_pm1,
            'orders': [
                {
                    'pos_order_lines_ui_args': [(self.product100, 1)],
                    'payments': [(self.bank_pm1, 100)],
                    'customer': False,
                    'is_invoiced': False,
                    'uuid': 'anon-bank-001',
                },
            ],
            'journal_entries_before_closing': {},
            'journal_entries_after_closing': {
                'session_journal_entry': {
                    'move_type': 'out_receipt',
                    'partner_id': False,
                    'line_ids': [
                        {
                            'account_id': self.sales_account.id,
                            'partner_id': False,
                            'debit': 0,
                            'credit': 100,
                            'reconciled': False,
                        },
                        {
                            'account_id': self.bank_pm1.receivable_account_id.id,
                            'partner_id': False,
                            'debit': 100,
                            'credit': 0,
                            'reconciled': True,
                        },
                    ],
                },
                'cash_statement': [],
                'bank_payments': [
                    ((100,), {
                        'line_ids': [
                            {
                                'account_id': self.bank_pm1.outstanding_account_id.id,
                                'partner_id': False,
                                'debit': 100,
                                'credit': 0,
                                'reconciled': False,
                            },
                            {
                                'account_id': self.bank_pm1.receivable_account_id.id,
                                'partner_id': False,
                                'debit': 0,
                                'credit': 100,
                                'reconciled': True,
                            },
                        ]
                    }),
                ],
            },
        })

    def test_anon_lines_aggregated_by_account_and_tax(self):
        """
        Two anonymous orders:
          - order A: product with no tax  →  revenue at sales_account, tax_ids=[]
          - order B: product with 15% tax →  revenue at sales_account, tax line at tax account

        The receipt must have:
          - one aggregated revenue line per (account, tax_ids) combination
          - one tax line for the 15% tax
          - one receivable line per payment method (combined)
        No per-order lines; no per-product lines.
        """
        self._run_test({
            'payment_methods': self.cash_pm1,
            'orders': [
                {
                    'pos_order_lines_ui_args': [(self.product100, 1)],
                    'payments': [(self.cash_pm1, 100)],
                    'customer': False,
                    'is_invoiced': False,
                    'uuid': 'agg-001',
                },
                {
                    'pos_order_lines_ui_args': [(self.product115, 1)],
                    'payments': [(self.cash_pm1, 115)],
                    'customer': False,
                    'is_invoiced': False,
                    'uuid': 'agg-002',
                },
            ],
            'journal_entries_before_closing': {},
            'journal_entries_after_closing': {
                'session_journal_entry': {
                    'move_type': 'out_receipt',
                    'partner_id': False,
                    'line_ids': [
                        # Revenue line for product100 (no tax): net 100
                        {
                            'account_id': self.sales_account.id,
                            'partner_id': False,
                            'debit': 0,
                            'credit': 100,
                            'reconciled': False,
                        },
                        # Revenue line for product115 (15% tax): net 100
                        {
                            'account_id': self.sales_account.id,
                            'partner_id': False,
                            'debit': 0,
                            'credit': 100,
                            'reconciled': False,
                        },
                        # Tax line: 15
                        {
                            'account_id': self.tax15.invoice_repartition_line_ids.filtered(
                                lambda l: l.repartition_type == 'tax'
                            ).account_id.id,
                            'partner_id': False,
                            'debit': 0,
                            'credit': 15,
                            'reconciled': False,
                        },
                        # Cash receivable line: 215 total
                        {
                            'account_id': self.cash_pm1.receivable_account_id.id,
                            'partner_id': False,
                            'debit': 215,
                            'credit': 0,
                            'reconciled': True,
                        },
                    ],
                },
                'cash_statement': [
                    ((100, 115), {
                        'line_ids': [
                            {
                                'account_id': self.cash_pm1.journal_id.default_account_id.id,
                                'partner_id': False,
                                'debit': 215,
                                'credit': 0,
                                'reconciled': False,
                            },
                            {
                                'account_id': self.cash_pm1.receivable_account_id.id,
                                'partner_id': False,
                                'debit': 0,
                                'credit': 215,
                                'reconciled': True,
                            },
                        ]
                    }),
                ],
                'bank_payments': [],
            },
        })

    def test_anon_refund_net_amount_on_receipt(self):
        """
        One sale (100) and one refund (-100) for the same product in the same session.
        The out_receipt nets to zero — both lines are included (or collapsed),
        and the receivable nets to zero.
        """
        self._run_test({
            'payment_methods': self.cash_pm1,
            'orders': [
                {
                    'pos_order_lines_ui_args': [(self.product100, 1)],
                    'payments': [(self.cash_pm1, 100)],
                    'customer': False,
                    'is_invoiced': False,
                    'uuid': 'refund-sale-001',
                },
                {
                    'pos_order_lines_ui_args': [(self.product100, -1)],  # refund
                    'payments': [(self.cash_pm1, -100)],
                    'customer': False,
                    'is_invoiced': False,
                    'uuid': 'refund-refund-001',
                },
            ],
            'journal_entries_before_closing': {},
            'journal_entries_after_closing': {
                'session_journal_entry': {
                    'move_type': 'out_receipt',
                    'partner_id': False,
                    # Net zero: revenue nets to 0, receivable nets to 0.
                    # The move may have zero-amount lines or no lines at all
                    # depending on implementation; the key constraint is that
                    # the move balances and is fully reconciled.
                    'line_ids': [
                        {
                            'account_id': self.sales_account.id,
                            'partner_id': False,
                            'debit': 0,
                            'credit': 0,
                            'reconciled': False,
                        },
                        {
                            'account_id': self.cash_pm1.receivable_account_id.id,
                            'partner_id': False,
                            'debit': 0,
                            'credit': 0,
                            'reconciled': False,
                        },
                    ],
                },
                'cash_statement': [],
                'bank_payments': [],
            },
        })

    # -------------------------------------------------------------------------
    # 2. INVOICED ORDERS → DIRECT account.payment, NO INTERMEDIATE MOVE
    # -------------------------------------------------------------------------

    def test_invoiced_cash_direct_payment(self):
        """
        Invoiced order paid with cash:
          - invoice created in journal_id (sale journal, invoice_journal_id gone)
          - account.payment created in cash journal, reconciled directly with invoice
          - NO intermediate payment move in journal_id
          - session out_receipt is empty / not created (no anonymous orders)
        """
        self._run_test({
            'payment_methods': self.cash_pm1,
            'orders': [
                {
                    'pos_order_lines_ui_args': [(self.product100, 1)],
                    'payments': [(self.cash_pm1, 100)],
                    'customer': self.customer,
                    'is_invoiced': True,
                    'uuid': 'inv-cash-001',
                },
            ],
            'journal_entries_before_closing': {
                'inv-cash-001': {
                    'invoice': {
                        'move_type': 'out_invoice',
                        # invoice now uses journal_id, not invoice_journal_id
                        'journal_id': self.config.journal_id.id,
                        'line_ids': [
                            {
                                'account_id': self.sales_account.id,
                                'partner_id': self.customer.id,
                                'debit': 0,
                                'credit': 100,
                                'reconciled': False,
                            },
                            {
                                'account_id': self.c1_receivable.id,
                                'partner_id': self.customer.id,
                                'debit': 100,
                                'credit': 0,
                                'reconciled': True,   # reconciled directly with payment
                            },
                        ],
                    },
                    # Direct account.payment — NOT a misc journal entry.
                    # The payment's move lives in cash_pm1.journal_id.
                    'payments': [
                        ((self.cash_pm1, 100), {
                            'is_direct_payment': True,   # new assertion key
                            'line_ids': [
                                {
                                    'account_id': self.c1_receivable.id,
                                    'partner_id': self.customer.id,
                                    'debit': 0,
                                    'credit': 100,
                                    'reconciled': True,  # reconciled with invoice
                                },
                                {
                                    'account_id': self.cash_pm1.journal_id.default_account_id.id,
                                    'partner_id': self.customer.id,
                                    'debit': 100,
                                    'credit': 0,
                                    'reconciled': False,
                                },
                            ],
                        }),
                    ],
                },
            },
            # Session out_receipt: no anonymous orders → not created (or empty)
            'journal_entries_after_closing': {
                'session_journal_entry': None,  # no receipt when session has only invoiced orders
                'cash_statement': [],
                'bank_payments': [],
            },
        })

    def test_invoiced_bank_direct_payment(self):
        """
        Invoiced order paid with bank:
          - account.payment in bank_pm1.journal_id, reconciled with invoice
          - NO intermediate move in journal_id
          - NO session journal entry (no anonymous orders)
        """
        self._run_test({
            'payment_methods': self.cash_pm1 | self.bank_pm1,
            'orders': [
                {
                    'pos_order_lines_ui_args': [(self.product100, 1)],
                    'payments': [(self.bank_pm1, 100)],
                    'customer': self.customer,
                    'is_invoiced': True,
                    'uuid': 'inv-bank-001',
                },
            ],
            'journal_entries_before_closing': {
                'inv-bank-001': {
                    'invoice': {
                        'move_type': 'out_invoice',
                        'journal_id': self.config.journal_id.id,
                        'line_ids': [
                            {
                                'account_id': self.sales_account.id,
                                'partner_id': self.customer.id,
                                'debit': 0,
                                'credit': 100,
                                'reconciled': False,
                            },
                            {
                                'account_id': self.c1_receivable.id,
                                'partner_id': self.customer.id,
                                'debit': 100,
                                'credit': 0,
                                'reconciled': True,
                            },
                        ],
                    },
                    'payments': [
                        ((self.bank_pm1, 100), {
                            'is_direct_payment': True,
                            'journal_id': self.bank_pm1.journal_id.id,
                            'line_ids': [
                                {
                                    'account_id': self.c1_receivable.id,
                                    'partner_id': self.customer.id,
                                    'debit': 0,
                                    'credit': 100,
                                    'reconciled': True,
                                },
                                {
                                    'account_id': self.bank_pm1.outstanding_account_id.id,
                                    'partner_id': self.customer.id,
                                    'debit': 100,
                                    'credit': 0,
                                    'reconciled': False,
                                },
                            ],
                        }),
                    ],
                },
            },
            'journal_entries_after_closing': {
                'session_journal_entry': None,
                'cash_statement': [],
                'bank_payments': [],
            },
        })

    # -------------------------------------------------------------------------
    # 3. MIXED SESSION — anonymous + invoiced orders
    # -------------------------------------------------------------------------

    def test_mixed_session(self):
        """
        One anonymous cash order + one invoiced bank order in the same session.

        Expected:
          - out_receipt covers ONLY the anonymous order
          - invoiced order has a direct account.payment, not in the receipt
          - cash statement reconciles against the receipt
        """
        self._run_test({
            'payment_methods': self.cash_pm1 | self.bank_pm1,
            'orders': [
                {
                    'pos_order_lines_ui_args': [(self.product100, 1)],
                    'payments': [(self.cash_pm1, 100)],
                    'customer': False,
                    'is_invoiced': False,
                    'uuid': 'mixed-anon-001',
                },
                {
                    'pos_order_lines_ui_args': [(self.product100, 1)],
                    'payments': [(self.bank_pm1, 100)],
                    'customer': self.customer,
                    'is_invoiced': True,
                    'uuid': 'mixed-inv-001',
                },
            ],
            'journal_entries_before_closing': {
                'mixed-inv-001': {
                    'invoice': {
                        'move_type': 'out_invoice',
                        'journal_id': self.config.journal_id.id,
                        'line_ids': [
                            {
                                'account_id': self.sales_account.id,
                                'partner_id': self.customer.id,
                                'debit': 0,
                                'credit': 100,
                                'reconciled': False,
                            },
                            {
                                'account_id': self.c1_receivable.id,
                                'partner_id': self.customer.id,
                                'debit': 100,
                                'credit': 0,
                                'reconciled': True,
                            },
                        ],
                    },
                    'payments': [
                        ((self.bank_pm1, 100), {
                            'is_direct_payment': True,
                            'line_ids': [
                                {
                                    'account_id': self.c1_receivable.id,
                                    'partner_id': self.customer.id,
                                    'debit': 0,
                                    'credit': 100,
                                    'reconciled': True,
                                },
                                {
                                    'account_id': self.bank_pm1.outstanding_account_id.id,
                                    'partner_id': self.customer.id,
                                    'debit': 100,
                                    'credit': 0,
                                    'reconciled': False,
                                },
                            ],
                        }),
                    ],
                },
            },
            'journal_entries_after_closing': {
                # Receipt only covers the 100 from the anonymous cash order
                'session_journal_entry': {
                    'move_type': 'out_receipt',
                    'partner_id': False,
                    'line_ids': [
                        {
                            'account_id': self.sales_account.id,
                            'partner_id': False,
                            'debit': 0,
                            'credit': 100,
                            'reconciled': False,
                        },
                        {
                            'account_id': self.cash_pm1.receivable_account_id.id,
                            'partner_id': False,
                            'debit': 100,
                            'credit': 0,
                            'reconciled': True,
                        },
                    ],
                },
                'cash_statement': [
                    ((100,), {
                        'line_ids': [
                            {
                                'account_id': self.cash_pm1.journal_id.default_account_id.id,
                                'partner_id': False,
                                'debit': 100,
                                'credit': 0,
                                'reconciled': False,
                            },
                            {
                                'account_id': self.cash_pm1.receivable_account_id.id,
                                'partner_id': False,
                                'debit': 0,
                                'credit': 100,
                                'reconciled': True,
                            },
                        ]
                    }),
                ],
                'bank_payments': [],  # bank payment for invoice handled via direct payment above
            },
        })

    # -------------------------------------------------------------------------
    # 4. CONFIGURATION
    # -------------------------------------------------------------------------

    def test_journal_id_must_be_sale_journal(self):
        """journal_id only accepts journals of type 'sale'."""
        with self.assertRaises(Exception):
            self.config.write({'journal_id': self.company_data['default_journal_misc'].id})

    def test_invoice_journal_id_removed(self):
        """pos.config no longer has an invoice_journal_id field."""
        self.assertFalse(
            hasattr(self.config, 'invoice_journal_id'),
            "invoice_journal_id should be removed from pos.config",
        )

    def test_stock_journal_id_exists(self):
        """pos.config has a stock_journal_id field pointing to a general journal."""
        self.assertTrue(
            hasattr(self.config, 'stock_journal_id'),
            "stock_journal_id should exist on pos.config",
        )
        self.assertEqual(self.config.stock_journal_id.type, 'general')
