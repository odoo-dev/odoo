from odoo import Command
from odoo.tests import tagged

from .common import AccountTestInvoicingCommon


@tagged('post_install', '-at_install')
class TestAccountTaxCABA(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.env.company.tax_exigibility = True
        cls.tax_waiting_account = cls.env['account.account'].create({
            'name': 'TAX_WAITING_ACCOUNT',
            'code': 'TWAIT',
            'account_type': 'expense',
        })
        cls.tax_collected_account = cls.env['account.account'].create({
            'name': 'TAX_COLLECTED_ACCOUNT',
            'code': 'TCOLLECT',
            'account_type': 'expense',
        })

        cls.non_caba_tax = cls.env['account.tax'].create({
            'name': '5% Non-CABA Tax',
            'amount_type': 'percent',
            'amount': 5,
        })
        cls.caba_tax = cls.env['account.tax'].create({
            'name': '21% CABA Tax',
            'amount_type': 'percent',
            'amount': 21,
            'type_tax_use': 'sale',
            'tax_exigibility': 'on_payment',
            'cash_basis_transition_account_id': cls.tax_waiting_account.id,
            'invoice_repartition_line_ids': [
                (0, 0, {
                    'repartition_type': 'base',
                }),
                (0, 0, {
                    'repartition_type': 'tax',
                    'account_id': cls.tax_collected_account.id,
                }),
            ],
            'refund_repartition_line_ids': [
                (0, 0, {
                    'repartition_type': 'base',
                }),
                (0, 0, {
                    'repartition_type': 'tax',
                    'account_id': cls.tax_collected_account.id,
                }),
            ],
        })

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def _create_mixed_invoice(self, move_type='out_invoice', invoice_date='2017-01-01', non_caba_tax=None, caba_tax=None, **kwargs):
        """ 100 with a 5% regular tax and 100 with a 21% CABA tax: 226 in total. """
        return self._create_invoice(
            move_type=move_type,
            invoice_date=invoice_date,
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100, tax_ids=(non_caba_tax or self.non_caba_tax).ids),
                self._prepare_invoice_line(price_unit=100, tax_ids=(caba_tax or self.caba_tax).ids),
            ],
            post=True,
            **kwargs,
        )

    def _create_caba_invoice(self, invoice_date='2017-01-01', **kwargs):
        """ 100 with a 21% CABA tax: 121 in total. """
        return self._create_invoice(
            move_type='out_invoice',
            invoice_date=invoice_date,
            partner_id=self.partner_a.id,
            invoice_line_ids=[self._prepare_invoice_line(price_unit=100, tax_ids=self.caba_tax.ids)],
            post=True,
            **kwargs,
        )

    def _create_credit_note(self, non_caba_quantity=0.0, caba_quantity=0.0, invoice_date='2017-01-01', **kwargs):
        """ A credit note of the given quantities of the lines of _create_mixed_invoice. """
        line_vals = []
        if non_caba_quantity:
            line_vals.append(self._prepare_invoice_line(quantity=non_caba_quantity, price_unit=100, tax_ids=self.non_caba_tax.ids))
        if caba_quantity:
            line_vals.append(self._prepare_invoice_line(quantity=caba_quantity, price_unit=100, tax_ids=self.caba_tax.ids))
        return self._create_invoice(
            move_type='out_refund',
            invoice_date=invoice_date,
            partner_id=self.partner_a.id,
            invoice_line_ids=line_vals,
            post=True,
            **kwargs,
        )

    def _register_payment(self, move, amount, payment_date, **kwargs):
        return self.env['account.payment.register'].with_context(
            active_model='account.move',
            active_ids=move.ids,
        ).create({
            'amount': amount,
            'payment_date': payment_date,
            **kwargs,
        })._create_payments()

    def _reconcile_credit_note(self, move, credit_note):
        """ Reconcile the receivables/payables and the CABA tax lines together, as when posting a reversal. """
        lines = move.line_ids + credit_note.line_ids
        plan = [lines.filtered(lambda line: line.account_type in ('asset_receivable', 'liability_payable'))]
        for tax_lines in lines.filtered(lambda line: line.tax_line_id.tax_exigibility == 'on_payment').grouped('tax_line_id').values():
            if len(tax_lines.move_id) == 2:
                plan.append(tax_lines)
        self.env['account.move.line']._reconcile_plan(plan)

    def _assign_outstanding_credit_note(self, invoice, credit_note):
        """ Add the credit note from the outstanding credits of the invoice: only the receivables are selected. """
        invoice.js_assign_outstanding_line(
            credit_note.line_ids.filtered(lambda line: line.account_type == 'asset_receivable').id,
        )

    def _get_cash_basis_moves(self, move):
        """ All the cash basis entries of the move, reversals included. """
        return self.env['account.move'].search([('tax_cash_basis_origin_move_id', '=', move.id)], order='id')

    def _get_live_cash_basis_moves(self, move):
        """ The posted cash basis entries of the move that have neither been reversed nor are reversals. """
        return self._get_cash_basis_moves(move).filtered(
            lambda caba_move: caba_move.state == 'posted' and not caba_move.reversed_entry_id and not caba_move.reversal_move_ids
        )

    def _assert_cash_basis_net_amounts(self, move, expected_per_tax):
        """ Check the base and tax made exigible for the move by all its posted cash basis entries, reversals
        included, i.e. what ends up in the tax report.
        """
        lines = self.env['account.move.line'].search([
            ('move_id.tax_cash_basis_origin_move_id', '=', move.id),
            ('parent_state', '=', 'posted'),
        ])
        actual_per_tax = {}
        for tax in expected_per_tax:
            base_lines = lines.filtered(lambda line: tax in line.tax_ids and not line.tax_line_id)
            tax_lines = lines.filtered(lambda line: line.tax_line_id == tax)
            actual_per_tax[tax] = {
                'base_amount_currency': round(sum(base_lines.mapped('amount_currency')), 2),
                'base_balance': round(sum(base_lines.mapped('balance')), 2),
                'tax_amount_currency': round(sum(tax_lines.mapped('amount_currency')), 2),
                'tax_balance': round(sum(tax_lines.mapped('balance')), 2),
            }
        self.assertEqual(actual_per_tax, expected_per_tax)

    def _assert_cash_basis_settled(self, move, transition_account=None):
        """ Every CABA tax line of the move is fully made exigible and nothing is left on the transition account,
        neither in company nor in foreign currency (exchange differences included).
        """
        caba_tax_lines = move.line_ids.filtered(lambda line: line.tax_line_id.tax_exigibility == 'on_payment')
        self.assertTrue(caba_tax_lines)
        self.assertTrue(all(caba_tax_lines.mapped('reconciled')))
        transition_lines = self.env['account.move.line'].search([
            ('account_id', '=', (transition_account or self.tax_waiting_account).id),
            ('parent_state', '=', 'posted'),
        ])
        self.assertAlmostEqual(sum(transition_lines.mapped('balance')), 0.0)
        self.assertAlmostEqual(sum(transition_lines.mapped('amount_currency')), 0.0)

    def _assert_cash_basis_moves_replaced(self, invoice, original_move, expected_new_lines, is_reversed=False):
        """ The original cash basis entry is removed, or reversed when it can't be, and a new one is created
        with the final amounts.
        """
        cash_basis_moves = self._get_cash_basis_moves(invoice)
        if is_reversed:
            self.assertEqual(len(cash_basis_moves), 3)
            self.assertEqual(cash_basis_moves[0], original_move)
            self.assertEqual(cash_basis_moves[1].reversed_entry_id, original_move)
        else:
            self.assertFalse(original_move.exists())
            self.assertEqual(len(cash_basis_moves), 1)
        new_move = cash_basis_moves[-1]
        self.assertRecordValues(new_move.line_ids.sorted('balance'), expected_new_lines)
        self._assert_cash_basis_settled(invoice)

    # -------------------------------------------------------------------------
    # Tests
    # -------------------------------------------------------------------------

    def test_non_caba_refund_before_payment(self):
        """ A credit note of the regular tax line before the payment: paying the rest makes the whole CABA base
        and tax exigible.
        """
        invoice = self._create_mixed_invoice()
        credit_note = self._create_invoice(
            move_type='out_refund',
            partner_id=self.partner_a.id,
            invoice_line_ids=[self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids)],
            post=True,
        )
        self._reconcile_credit_note(invoice, credit_note)

        self._register_payment(invoice, 121, invoice.date)

        cash_basis_moves = self._get_cash_basis_moves(invoice)
        self.assertEqual(len(cash_basis_moves), 1)
        self.assertRecordValues(cash_basis_moves.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'amount_currency': -100.0, 'balance': -100.0},
            {'account_id': self.tax_collected_account.id, 'amount_currency': -21.0, 'balance': -21.0},
            {'account_id': self.tax_waiting_account.id, 'amount_currency': 21.0, 'balance': 21.0},
            {'account_id': self.company_data['default_account_revenue'].id, 'amount_currency': 100.0, 'balance': 100.0},
        ])

    def test_partial_caba_refund_before_payment(self):
        """ A credit note of part of both lines before the payment reduces the CABA base and tax made exigible
        by the payment of the rest.
        """
        invoice = self._create_mixed_invoice()
        credit_note = self._create_invoice(
            move_type='out_refund',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(quantity=0.5, price_unit=100, tax_ids=self.non_caba_tax.ids),
                self._prepare_invoice_line(quantity=0.2, price_unit=100, tax_ids=self.caba_tax.ids),
            ],
            post=True,
        )
        self._reconcile_credit_note(invoice, credit_note)

        self._register_payment(invoice, 149.3, invoice.date)

        cash_basis_moves = self._get_cash_basis_moves(invoice)
        self.assertEqual(len(cash_basis_moves), 1)
        self.assertRecordValues(cash_basis_moves.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'amount_currency': -80.0, 'balance': -80.0},
            {'account_id': self.tax_collected_account.id, 'amount_currency': -16.8, 'balance': -16.8},
            {'account_id': self.tax_waiting_account.id, 'amount_currency': 16.8, 'balance': 16.8},
            {'account_id': self.company_data['default_account_revenue'].id, 'amount_currency': 80.0, 'balance': 80.0},
        ])

    def test_partial_caba_refund_before_payment_with_several_caba_lines(self):
        """ The CABA base of a credit note is removed from all the invoice lines having the same CABA taxes. """
        invoice = self._create_invoice(
            move_type='out_invoice',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids),
                self._prepare_invoice_line(price_unit=75, tax_ids=self.non_caba_tax.ids),
                self._prepare_invoice_line(price_unit=100, tax_ids=self.caba_tax.ids),
                self._prepare_invoice_line(price_unit=25, tax_ids=self.caba_tax.ids),
            ],
            post=True,
        )
        credit_note = self._create_invoice(
            move_type='out_refund',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(quantity=0.5, price_unit=100, tax_ids=self.non_caba_tax.ids),
                self._prepare_invoice_line(quantity=0.2, price_unit=100, tax_ids=self.caba_tax.ids),
            ],
            post=True,
        )
        self._reconcile_credit_note(invoice, credit_note)

        self._register_payment(invoice, 258.3, invoice.date)

        cash_basis_moves = self._get_cash_basis_moves(invoice)
        self.assertEqual(len(cash_basis_moves), 1)
        self.assertRecordValues(cash_basis_moves.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'amount_currency': -105.0, 'balance': -105.0},
            {'account_id': self.tax_collected_account.id, 'amount_currency': -22.05, 'balance': -22.05},
            {'account_id': self.tax_waiting_account.id, 'amount_currency': 22.05, 'balance': 22.05},
            {'account_id': self.company_data['default_account_revenue'].id, 'amount_currency': 105.0, 'balance': 105.0},
        ])

    def test_partial_caba_refund_before_payment_with_different_caba_taxes(self):
        """A credit note must reduce each CABA tax base independently."""
        second_caba_tax = self.caba_tax.copy({
            'name': '10% CABA Tax',
            'amount': 10,
        })
        invoice = self._create_invoice(
            move_type='out_invoice',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids),
                self._prepare_invoice_line(price_unit=75, tax_ids=self.non_caba_tax.ids),
                self._prepare_invoice_line(price_unit=100, tax_ids=self.caba_tax.ids),
                self._prepare_invoice_line(price_unit=25, tax_ids=self.caba_tax.ids),
                self._prepare_invoice_line(price_unit=150, tax_ids=second_caba_tax.ids),
                self._prepare_invoice_line(price_unit=25, tax_ids=second_caba_tax.ids),
            ],
            post=True,
        )
        credit_note = self._create_invoice(
            move_type='out_refund',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(quantity=0.5, price_unit=100, tax_ids=self.non_caba_tax.ids),
                self._prepare_invoice_line(quantity=0.2, price_unit=100, tax_ids=self.caba_tax.ids),
                self._prepare_invoice_line(quantity=0.3, price_unit=100, tax_ids=second_caba_tax.ids),
            ],
            post=True,
        )
        self._reconcile_credit_note(invoice, credit_note)

        self._register_payment(invoice, 417.8, invoice.date)

        cash_basis_moves = self._get_cash_basis_moves(invoice)
        self.assertEqual(len(cash_basis_moves), 1)
        self.assertRecordValues(cash_basis_moves.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'tax_ids': second_caba_tax.ids, 'tax_line_id': False, 'amount_currency': -145.0, 'balance': -145.0},
            {'account_id': self.company_data['default_account_revenue'].id, 'tax_ids': self.caba_tax.ids, 'tax_line_id': False, 'amount_currency': -105.0, 'balance': -105.0},
            {'account_id': self.tax_collected_account.id, 'tax_ids': [], 'tax_line_id': self.caba_tax.id, 'amount_currency': -22.05, 'balance': -22.05},
            {'account_id': self.tax_collected_account.id, 'tax_ids': [], 'tax_line_id': second_caba_tax.id, 'amount_currency': -14.5, 'balance': -14.5},
            {'account_id': self.tax_waiting_account.id, 'tax_ids': [], 'tax_line_id': False, 'amount_currency': 14.5, 'balance': 14.5},
            {'account_id': self.tax_waiting_account.id, 'tax_ids': [], 'tax_line_id': False, 'amount_currency': 22.05, 'balance': 22.05},
            {'account_id': self.company_data['default_account_revenue'].id, 'tax_ids': [], 'tax_line_id': False, 'amount_currency': 105.0, 'balance': 105.0},
            {'account_id': self.company_data['default_account_revenue'].id, 'tax_ids': [], 'tax_line_id': False, 'amount_currency': 145.0, 'balance': 145.0},
        ])

    def test_partial_caba_refund_before_payment_on_vendor_bill(self):
        vendor_caba_tax = self.caba_tax.copy({
            'name': '21% Vendor CABA Tax',
            'type_tax_use': 'purchase',
        })
        vendor_non_caba_tax = self.non_caba_tax.copy({
            'name': '5% Vendor Non-CABA Tax',
            'type_tax_use': 'purchase',
        })
        bill = self._create_invoice(
            move_type='in_invoice',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100, tax_ids=vendor_non_caba_tax.ids),
                self._prepare_invoice_line(price_unit=100, tax_ids=vendor_caba_tax.ids),
            ],
            post=True,
        )
        refund = self._create_invoice(
            move_type='in_refund',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100, tax_ids=vendor_non_caba_tax.ids),
                self._prepare_invoice_line(quantity=0.5, price_unit=100, tax_ids=vendor_caba_tax.ids),
            ],
            post=True,
        )
        self._reconcile_credit_note(bill, refund)

        self._register_payment(bill, 60.5, bill.date)

        cash_basis_moves = self._get_cash_basis_moves(bill)
        self.assertEqual(len(cash_basis_moves), 1)
        self.assertRecordValues(cash_basis_moves.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_expense'].id, 'amount_currency': -50.0, 'balance': -50.0},
            {'account_id': self.tax_waiting_account.id, 'amount_currency': -10.5, 'balance': -10.5},
            {'account_id': self.tax_collected_account.id, 'amount_currency': 10.5, 'balance': 10.5},
            {'account_id': self.company_data['default_account_expense'].id, 'amount_currency': 50.0, 'balance': 50.0},
        ])

    def test_partial_caba_refund_before_payment_in_foreign_currency(self):
        """A credit note at a different rate than the invoice reduces the CABA base in foreign currency."""
        # The invoice is converted at 3.0 (2016) while the credit note and the payment use 2.0 (2017).
        foreign_currency = self.setup_other_currency('EUR', rates=[('2015-12-31', 3.0), ('2016-12-31', 2.0)])
        invoice = self._create_invoice(
            move_type='out_invoice',
            invoice_date='2016-01-01',
            partner_id=self.partner_a.id,
            currency_id=foreign_currency.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=200, tax_ids=self.caba_tax.ids),
                self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids),
            ],
            post=True,
        )
        refund = self._create_invoice(
            move_type='out_refund',
            invoice_date='2017-01-01',
            partner_id=self.partner_a.id,
            currency_id=foreign_currency.id,
            invoice_line_ids=[self._prepare_invoice_line(price_unit=100, tax_ids=self.caba_tax.ids)],
            post=True,
        )
        self._reconcile_credit_note(invoice, refund)

        self._register_payment(invoice, 226.0, '2017-01-01', currency_id=foreign_currency.id)

        cash_basis_moves = self._get_cash_basis_moves(invoice)
        self.assertEqual(len(cash_basis_moves), 1)
        # Remaining CABA base: 200 - 100 = 100 EUR, and 42 - 21 = 21 EUR of tax,
        # converted at the payment rate (2.0).
        self.assertRecordValues(cash_basis_moves.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'tax_line_id': False, 'currency_id': foreign_currency.id, 'amount_currency': -100.0, 'balance': -50.0},
            {'account_id': self.tax_collected_account.id, 'tax_line_id': self.caba_tax.id, 'currency_id': foreign_currency.id, 'amount_currency': -21.0, 'balance': -10.5},
            {'account_id': self.tax_waiting_account.id, 'tax_line_id': False, 'currency_id': foreign_currency.id, 'amount_currency': 21.0, 'balance': 10.5},
            {'account_id': self.company_data['default_account_revenue'].id, 'tax_line_id': False, 'currency_id': foreign_currency.id, 'amount_currency': 100.0, 'balance': 50.0},
        ])

    def test_non_caba_refund_after_partial_payment(self):
        """ A credit note settling the rest of a partially paid invoice replaces its cash basis entries. """
        invoice = self._create_mixed_invoice()
        self._register_payment(invoice, 121, invoice.date)
        original_move = self._get_cash_basis_moves(invoice)
        # 121 / 226 of the invoice is paid.
        self.assertRecordValues(original_move.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'balance': -53.54},
            {'account_id': self.tax_collected_account.id, 'balance': -11.24},
            {'account_id': self.tax_waiting_account.id, 'balance': 11.24},
            {'account_id': self.company_data['default_account_revenue'].id, 'balance': 53.54},
        ])

        credit_note = self._create_invoice(
            move_type='out_refund',
            partner_id=self.partner_a.id,
            invoice_line_ids=[self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids)],
            post=True,
        )
        self._reconcile_credit_note(invoice, credit_note)

        # Everything not credited has been paid: the whole CABA base and tax are exigible.
        self._assert_cash_basis_moves_replaced(invoice, original_move, [
            {'account_id': self.company_data['default_account_revenue'].id, 'balance': -100.0},
            {'account_id': self.tax_collected_account.id, 'balance': -21.0},
            {'account_id': self.tax_waiting_account.id, 'balance': 21.0},
            {'account_id': self.company_data['default_account_revenue'].id, 'balance': 100.0},
        ])

    def test_partial_caba_refund_after_partial_payment(self):
        """ A credit note cancelling part of the CABA base after a partial payment replaces the cash basis
        entries with the base and tax that were actually paid.
        """
        invoice = self._create_mixed_invoice()
        self._register_payment(invoice, 60.5, invoice.date)
        original_move = self._get_cash_basis_moves(invoice)

        credit_note = self._create_invoice(
            move_type='out_refund',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids),
                self._prepare_invoice_line(quantity=0.5, price_unit=100, tax_ids=self.caba_tax.ids),
            ],
            post=True,
        )
        self._reconcile_credit_note(invoice, credit_note)

        # 50 of the CABA base and 10.5 of tax are credited, the rest has been paid.
        self._assert_cash_basis_moves_replaced(invoice, original_move, [
            {'account_id': self.company_data['default_account_revenue'].id, 'balance': -50.0},
            {'account_id': self.tax_collected_account.id, 'balance': -10.5},
            {'account_id': self.tax_waiting_account.id, 'balance': 10.5},
            {'account_id': self.company_data['default_account_revenue'].id, 'balance': 50.0},
        ])

    def test_non_caba_refund_after_partial_payment_in_tax_locked_period(self):
        """ A cash basis entry in a tax locked period can't be removed: it is reversed after the lock date. """
        invoice = self._create_mixed_invoice(invoice_date='2017-01-15')
        self._register_payment(invoice, 121, '2017-01-15')
        original_move = self._get_cash_basis_moves(invoice)
        self.env.company.sudo().tax_lock_date = '2017-01-31'

        credit_note = self._create_invoice(
            move_type='out_refund',
            invoice_date='2017-02-10',
            partner_id=self.partner_a.id,
            invoice_line_ids=[self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids)],
            post=True,
        )
        self._reconcile_credit_note(invoice, credit_note)

        self._assert_cash_basis_moves_replaced(invoice, original_move, [
            {'account_id': self.company_data['default_account_revenue'].id, 'balance': -100.0},
            {'account_id': self.tax_collected_account.id, 'balance': -21.0},
            {'account_id': self.tax_waiting_account.id, 'balance': 21.0},
            {'account_id': self.company_data['default_account_revenue'].id, 'balance': 100.0},
        ], is_reversed=True)
        reversal, new_move = self._get_cash_basis_moves(invoice)[1:]
        self.assertEqual(str(reversal.date), '2017-02-01')
        self.assertGreater(str(new_move.date), '2017-01-31')

    def test_non_caba_refund_between_partial_payments(self):
        """ A credit note received between two payments replaces the first cash basis entry, and the second
        payment is prorated on what remains to be paid after the credit note.
        """
        invoice = self._create_mixed_invoice()
        first_payment = self._register_payment(invoice, 60.5, '2017-01-01')
        # 60.5 / 226 of the invoice is paid.
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -26.77, 'base_balance': -26.77, 'tax_amount_currency': -5.62, 'tax_balance': -5.62,
        }})
        original_move = self._get_live_cash_basis_moves(invoice)

        self._reconcile_credit_note(invoice, self._create_credit_note(non_caba_quantity=1.0))

        # 60.5 / 121 of what remains is paid.
        self.assertFalse(original_move.exists())
        first_move = self._get_live_cash_basis_moves(invoice)
        self.assertEqual(first_move.tax_cash_basis_rec_id.credit_move_id.move_id, first_payment.move_id)
        self.assertRecordValues(first_move.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'tax_line_id': False, 'balance': -50.0},
            {'account_id': self.tax_collected_account.id, 'tax_line_id': self.caba_tax.id, 'balance': -10.5},
            {'account_id': self.tax_waiting_account.id, 'tax_line_id': False, 'balance': 10.5},
            {'account_id': self.company_data['default_account_revenue'].id, 'tax_line_id': False, 'balance': 50.0},
        ])

        second_payment = self._register_payment(invoice, 60.5, '2017-01-15')

        first_move, second_move = self._get_live_cash_basis_moves(invoice)
        self.assertEqual(second_move.tax_cash_basis_rec_id.credit_move_id.move_id, second_payment.move_id)
        self.assertRecordValues(second_move.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'tax_line_id': False, 'balance': -50.0},
            {'account_id': self.tax_collected_account.id, 'tax_line_id': self.caba_tax.id, 'balance': -10.5},
            {'account_id': self.tax_waiting_account.id, 'tax_line_id': False, 'balance': 10.5},
            {'account_id': self.company_data['default_account_revenue'].id, 'tax_line_id': False, 'balance': 50.0},
        ])
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -100.0, 'base_balance': -100.0, 'tax_amount_currency': -21.0, 'tax_balance': -21.0,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_non_caba_refund_after_several_partial_payments(self):
        """ A credit note settling an invoice paid in several times replaces the cash basis entry of each
        payment, each payment keeping a single entry.
        """
        invoice = self._create_mixed_invoice()
        payments = self._register_payment(invoice, 60.5, '2017-01-01') + self._register_payment(invoice, 60.5, '2017-01-15')
        original_moves = self._get_live_cash_basis_moves(invoice)
        self.assertEqual(len(original_moves), 2)

        self._reconcile_credit_note(invoice, self._create_credit_note(non_caba_quantity=1.0, invoice_date='2017-01-20'))

        self.assertFalse(original_moves.exists())
        new_moves = self._get_live_cash_basis_moves(invoice)
        self.assertEqual(new_moves.tax_cash_basis_rec_id.credit_move_id.move_id, payments.move_id)
        self.assertRecordValues(new_moves, [{'date': payment.date} for payment in payments])
        for new_move in new_moves:
            self.assertRecordValues(new_move.line_ids.sorted('balance'), [
                {'account_id': self.company_data['default_account_revenue'].id, 'balance': -50.0},
                {'account_id': self.tax_collected_account.id, 'balance': -10.5},
                {'account_id': self.tax_waiting_account.id, 'balance': 10.5},
                {'account_id': self.company_data['default_account_revenue'].id, 'balance': 50.0},
            ])
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -100.0, 'base_balance': -100.0, 'tax_amount_currency': -21.0, 'tax_balance': -21.0,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_partial_caba_refund_before_several_partial_payments(self):
        """ Successive payments after a credit note are all prorated on what remains after the credit note. """
        invoice = self._create_mixed_invoice()
        self._reconcile_credit_note(invoice, self._create_credit_note(caba_quantity=0.5))

        # 165.5 remains to be paid, 50 of base and 10.5 of tax are still to be made exigible.
        self._register_payment(invoice, 82.75, '2017-01-01')
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -25.0, 'base_balance': -25.0, 'tax_amount_currency': -5.25, 'tax_balance': -5.25,
        }})

        self._register_payment(invoice, 82.75, '2017-01-15')
        self.assertEqual(len(self._get_live_cash_basis_moves(invoice)), 2)
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -50.0, 'base_balance': -50.0, 'tax_amount_currency': -10.5, 'tax_balance': -10.5,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_non_caba_refunds_before_and_after_partial_payment(self):
        """ All the credit notes reconciled with the move are taken into account when replacing the cash basis
        entries, not only the last one.
        """
        invoice = self._create_mixed_invoice()
        self._reconcile_credit_note(invoice, self._create_credit_note(non_caba_quantity=0.5))
        # 86.75 / 173.5 is paid.
        self._register_payment(invoice, 86.75, '2017-01-01')
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -50.0, 'base_balance': -50.0, 'tax_amount_currency': -10.5, 'tax_balance': -10.5,
        }})

        self._reconcile_credit_note(invoice, self._create_credit_note(non_caba_quantity=0.5, invoice_date='2017-01-10'))
        # 86.75 / 121 is paid.
        self.assertEqual(len(self._get_live_cash_basis_moves(invoice)), 1)
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -71.69, 'base_balance': -71.69, 'tax_amount_currency': -15.06, 'tax_balance': -15.06,
        }})

        self._register_payment(invoice, 34.25, '2017-01-15')
        self.assertEqual(len(self._get_live_cash_basis_moves(invoice)), 2)
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -100.0, 'base_balance': -100.0, 'tax_amount_currency': -21.0, 'tax_balance': -21.0,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_non_caba_refund_after_partial_payment_in_foreign_currency(self):
        """ The invoice, the payments and the credit note are all at different rates. The replaced cash basis
        entry keeps the rate of its payment and the exchange differences on the transition account are redone.
        """
        foreign_currency = self.setup_other_currency('EUR', rates=[
            ('2015-12-31', 3.0),
            ('2016-12-31', 2.0),
            ('2017-06-30', 4.0),
        ])
        invoice = self._create_mixed_invoice(invoice_date='2016-01-01', currency_id=foreign_currency.id)
        self._register_payment(invoice, 60.5, '2017-01-01', currency_id=foreign_currency.id)
        original_move = self._get_live_cash_basis_moves(invoice)

        self._reconcile_credit_note(invoice, self._create_credit_note(
            non_caba_quantity=1.0,
            invoice_date='2017-07-01',
            currency_id=foreign_currency.id,
        ))

        # 60.5 / 121 is paid, converted at the rate of the payment (2.0).
        self.assertFalse(original_move.exists())
        self.assertRecordValues(self._get_live_cash_basis_moves(invoice).line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'currency_id': foreign_currency.id, 'amount_currency': -50.0, 'balance': -25.0},
            {'account_id': self.tax_collected_account.id, 'currency_id': foreign_currency.id, 'amount_currency': -10.5, 'balance': -5.25},
            {'account_id': self.tax_waiting_account.id, 'currency_id': foreign_currency.id, 'amount_currency': 10.5, 'balance': 5.25},
            {'account_id': self.company_data['default_account_revenue'].id, 'currency_id': foreign_currency.id, 'amount_currency': 50.0, 'balance': 25.0},
        ])

        # The rest is paid at 4.0.
        self._register_payment(invoice, 60.5, '2017-07-01', currency_id=foreign_currency.id)
        self.assertEqual(len(self._get_live_cash_basis_moves(invoice)), 2)
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -100.0, 'base_balance': -37.5, 'tax_amount_currency': -21.0, 'tax_balance': -7.88,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_partial_caba_refund_with_company_currency_payments_on_foreign_invoice(self):
        """ The invoice and the credit note are in foreign currency but the payments are in company currency:
        the percentage is still computed in foreign currency, at the rate of the payment date.
        """
        foreign_currency = self.setup_other_currency('EUR', rates=[('2015-12-31', 3.0), ('2016-12-31', 2.0)])
        invoice = self._create_mixed_invoice(invoice_date='2016-01-01', currency_id=foreign_currency.id)
        # 30.25 USD = 60.5 EUR.
        self._register_payment(invoice, 30.25, '2017-01-01', currency_id=self.company_data['currency'].id)
        original_move = self._get_live_cash_basis_moves(invoice)

        self._reconcile_credit_note(invoice, self._create_credit_note(
            caba_quantity=0.5,
            invoice_date='2017-01-01',
            currency_id=foreign_currency.id,
        ))

        # 60.5 / 165.5 of the remaining 50 EUR of base and 10.5 EUR of tax is paid.
        self.assertFalse(original_move.exists())
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -18.28, 'base_balance': -9.14, 'tax_amount_currency': -3.84, 'tax_balance': -1.92,
        }})

        # 52.5 USD = 105 EUR.
        self._register_payment(invoice, 52.5, '2017-01-01', currency_id=self.company_data['currency'].id)
        self.assertEqual(len(self._get_live_cash_basis_moves(invoice)), 2)
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -50.0, 'base_balance': -25.0, 'tax_amount_currency': -10.5, 'tax_balance': -5.25,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_partial_reversal_after_partial_payment_on_foreign_vendor_bill(self):
        """ Reverse a partially paid foreign vendor bill with the wizard, keep only part of it on the draft
        credit note and post it: it is automatically reconciled with the bill, which is then settled.
        """
        foreign_currency = self.setup_other_currency('EUR', rates=[
            ('2015-12-31', 3.0),
            ('2016-12-31', 2.0),
            ('2017-06-30', 4.0),
        ])
        vendor_caba_tax = self.caba_tax.copy({'name': '21% Vendor CABA Tax', 'type_tax_use': 'purchase'})
        vendor_non_caba_tax = self.non_caba_tax.copy({'name': '5% Vendor Non-CABA Tax', 'type_tax_use': 'purchase'})
        bill = self._create_mixed_invoice(
            move_type='in_invoice',
            invoice_date='2016-01-01',
            currency_id=foreign_currency.id,
            non_caba_tax=vendor_non_caba_tax,
            caba_tax=vendor_caba_tax,
        )
        self._register_payment(bill, 60.5, '2017-01-01', currency_id=foreign_currency.id)
        original_move = self._get_live_cash_basis_moves(bill)

        action = self.env['account.move.reversal'].with_context(active_model='account.move', active_ids=bill.ids).create({
            'date': '2017-07-01',
            'journal_id': bill.journal_id.id,
        }).refund_moves()
        refund = self.env['account.move'].browse(action['res_id'])
        self.assertEqual(refund.state, 'draft')
        refund_caba_line = refund.invoice_line_ids.filtered(lambda line: line.tax_ids == vendor_caba_tax)
        refund.invoice_line_ids = [Command.update(refund_caba_line.id, {'quantity': 0.5})]
        # 105 + 60.5 = 165.5: what remains to be paid on the bill.
        self.assertEqual(refund.amount_total, 165.5)
        refund.action_post()

        self.assertFalse(original_move.exists())
        # Everything not credited has been paid at 2.0.
        self.assertRecordValues(self._get_live_cash_basis_moves(bill).line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_expense'].id, 'tax_line_id': False, 'amount_currency': -50.0, 'balance': -25.0},
            {'account_id': self.tax_waiting_account.id, 'tax_line_id': False, 'amount_currency': -10.5, 'balance': -5.25},
            {'account_id': self.tax_collected_account.id, 'tax_line_id': vendor_caba_tax.id, 'amount_currency': 10.5, 'balance': 5.25},
            {'account_id': self.company_data['default_account_expense'].id, 'tax_line_id': False, 'amount_currency': 50.0, 'balance': 25.0},
        ])
        self._assert_cash_basis_settled(bill)

    def test_non_caba_refund_and_payment_reconciled_together(self):
        """ The credit note and the payment are reconciled with the invoice at once. """
        invoice = self._create_mixed_invoice()
        credit_note = self._create_credit_note(non_caba_quantity=1.0)
        payment = self.init_payment(121, post=True, date='2017-01-01')

        (invoice.line_ids + credit_note.line_ids + payment.move_id.line_ids).filtered(
            lambda line: line.account_type == 'asset_receivable'
        ).reconcile()

        self.assertRecordValues(self._get_cash_basis_moves(invoice).line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'balance': -100.0},
            {'account_id': self.tax_collected_account.id, 'balance': -21.0},
            {'account_id': self.tax_waiting_account.id, 'balance': 21.0},
            {'account_id': self.company_data['default_account_revenue'].id, 'balance': 100.0},
        ])
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -100.0, 'base_balance': -100.0, 'tax_amount_currency': -21.0, 'tax_balance': -21.0,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_full_reversal_and_new_invoice_after_partial_payment(self):
        """ Reverse and create a new invoice on a partially paid invoice: the payment is unreconciled from the
        cancelled invoice, removing its cash basis entry, and its cash basis entry is created on the new invoice
        once reconciled with it.
        """
        invoice = self._create_mixed_invoice()
        payment = self._register_payment(invoice, 60.5, '2017-01-01')
        original_move = self._get_live_cash_basis_moves(invoice)

        action = self.env['account.move.reversal'].with_context(active_model='account.move', active_ids=invoice.ids).create({
            'date': '2017-01-10',
            'journal_id': invoice.journal_id.id,
        }).modify_moves()
        new_invoice = self.env['account.move'].browse(action['res_id'])

        self.assertEqual(invoice.payment_state, 'reversed')
        self.assertFalse(original_move.exists())
        self.assertFalse(self._get_live_cash_basis_moves(invoice))
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': 0.0, 'base_balance': 0.0, 'tax_amount_currency': 0.0, 'tax_balance': 0.0,
        }})
        payment_line = payment.move_id.line_ids.filtered(lambda line: line.account_type == 'asset_receivable')
        self.assertAlmostEqual(payment_line.amount_residual, -60.5)

        new_invoice.action_post()
        (new_invoice.line_ids + payment_line).filtered(lambda line: line.account_type == 'asset_receivable').reconcile()
        self._assert_cash_basis_net_amounts(new_invoice, {self.caba_tax: {
            'base_amount_currency': -26.77, 'base_balance': -26.77, 'tax_amount_currency': -5.62, 'tax_balance': -5.62,
        }})

    def test_non_caba_refund_only_replaces_cash_basis_entries_of_its_move(self):
        """ A payment shared by two invoices: crediting one of them doesn't touch the cash basis entry of the
        other one.
        """
        invoice_a = self._create_mixed_invoice()
        invoice_b = self._create_mixed_invoice()
        payment = self.init_payment(286.5, post=True, date='2017-01-01')
        payment_line = payment.move_id.line_ids.filtered(lambda line: line.account_type == 'asset_receivable')
        (payment_line + invoice_b.line_ids.filtered(lambda line: line.account_type == 'asset_receivable')).reconcile()
        (payment_line + invoice_a.line_ids.filtered(lambda line: line.account_type == 'asset_receivable')).reconcile()
        move_a = self._get_live_cash_basis_moves(invoice_a)
        move_b = self._get_live_cash_basis_moves(invoice_b)

        self._reconcile_credit_note(invoice_a, self._create_credit_note(non_caba_quantity=1.0))

        self.assertFalse(move_a.exists())
        self.assertEqual(self._get_live_cash_basis_moves(invoice_b), move_b)
        self._assert_cash_basis_net_amounts(invoice_a, {self.caba_tax: {
            'base_amount_currency': -50.0, 'base_balance': -50.0, 'tax_amount_currency': -10.5, 'tax_balance': -10.5,
        }})
        self._assert_cash_basis_net_amounts(invoice_b, {self.caba_tax: {
            'base_amount_currency': -100.0, 'base_balance': -100.0, 'tax_amount_currency': -21.0, 'tax_balance': -21.0,
        }})
        self.assertTrue(invoice_b.line_ids.filtered(lambda line: line.tax_line_id == self.caba_tax).reconciled)

    def test_non_caba_refunds_after_partial_payment_across_tax_lock_date(self):
        """ Two credit notes after a payment, the tax lock date being set in between: the locked cash basis entry
        is reversed while the one created after the lock date is simply replaced.
        """
        invoice = self._create_mixed_invoice(invoice_date='2017-01-15')
        self._register_payment(invoice, 60.5, '2017-01-15')
        original_move = self._get_live_cash_basis_moves(invoice)
        self.env.company.sudo().tax_lock_date = '2017-01-31'

        self._reconcile_credit_note(invoice, self._create_credit_note(non_caba_quantity=0.5, invoice_date='2017-02-10'))
        # 60.5 / 173.5 is paid.
        reversal = original_move.reversal_move_ids
        self.assertEqual(len(reversal), 1)
        first_new_move = self._get_live_cash_basis_moves(invoice)
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -34.87, 'base_balance': -34.87, 'tax_amount_currency': -7.32, 'tax_balance': -7.32,
        }})

        self._reconcile_credit_note(invoice, self._create_credit_note(non_caba_quantity=0.5, invoice_date='2017-02-20'))
        # 60.5 / 121 is paid.
        self.assertFalse(first_new_move.exists())
        self.assertEqual(original_move.reversal_move_ids, reversal)
        self.assertEqual(len(self.env['account.move'].search([('tax_cash_basis_origin_move_id', '=', invoice.id)])), 3)
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -50.0, 'base_balance': -50.0, 'tax_amount_currency': -10.5, 'tax_balance': -10.5,
        }})

    def test_payment_of_caba_credit_note_keeps_its_cash_basis_entry(self):
        """ A payment is not a credit note: paying a credit note creates its cash basis entry once, without
        replacing it right after. With a hashed cash basis journal, a replacement would leave the entry, its
        reversal and the new entry behind.
        """
        self.env.company.tax_cash_basis_journal_id.restrict_mode_hash_table = True
        credit_note = self._create_credit_note(caba_quantity=1.0)

        self._register_payment(credit_note, 121, '2017-01-01')

        cash_basis_moves = self.env['account.move'].search([('tax_cash_basis_origin_move_id', '=', credit_note.id)])
        self.assertEqual(len(cash_basis_moves), 1)
        self._assert_cash_basis_net_amounts(credit_note, {self.caba_tax: {
            'base_amount_currency': 100.0, 'base_balance': 100.0, 'tax_amount_currency': 21.0, 'tax_balance': 21.0,
        }})
        self._assert_cash_basis_settled(credit_note)

    def test_non_caba_invoice_after_partial_payment_of_credit_note(self):
        """ An invoice settling the rest of a partially paid credit note replaces the cash basis entries of the
        credit note, as a credit note does for an invoice.
        """
        credit_note = self._create_mixed_invoice(move_type='out_refund')
        self._register_payment(credit_note, 121, '2017-01-01')
        original_move = self._get_live_cash_basis_moves(credit_note)
        # 121 / 226 of the credit note is paid.
        self._assert_cash_basis_net_amounts(credit_note, {self.caba_tax: {
            'base_amount_currency': 53.54, 'base_balance': 53.54, 'tax_amount_currency': 11.24, 'tax_balance': 11.24,
        }})

        invoice = self._create_invoice(
            move_type='out_invoice',
            invoice_date='2017-01-01',
            partner_id=self.partner_a.id,
            invoice_line_ids=[self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids)],
            post=True,
        )
        self._reconcile_credit_note(credit_note, invoice)

        # Everything not settled by the invoice has been paid: the whole CABA base and tax are exigible.
        self.assertFalse(original_move.exists())
        self.assertEqual(len(self._get_live_cash_basis_moves(credit_note)), 1)
        self._assert_cash_basis_net_amounts(credit_note, {self.caba_tax: {
            'base_amount_currency': 100.0, 'base_balance': 100.0, 'tax_amount_currency': 21.0, 'tax_balance': 21.0,
        }})
        self._assert_cash_basis_settled(credit_note)

    def test_caba_refund_from_outstanding_credits_before_payment(self):
        """ A credit note added from the outstanding credits reduces the tax to make exigible as it reduces the
        base, its CABA tax line being reconciled with the invoice one.
        """
        invoice = self._create_caba_invoice()
        credit_note = self._create_credit_note(caba_quantity=0.5)
        self._assign_outstanding_credit_note(invoice, credit_note)

        self.assertTrue(credit_note.line_ids.filtered(lambda line: line.tax_line_id == self.caba_tax).reconciled)
        self._register_payment(invoice, 60.5, '2017-01-01')

        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -50.0, 'base_balance': -50.0, 'tax_amount_currency': -10.5, 'tax_balance': -10.5,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_caba_refund_from_outstanding_credits_after_partial_payment(self):
        """ A credit note added from the outstanding credits after a payment replaces the cash basis entry with
        the base and tax that were actually paid.
        """
        invoice = self._create_caba_invoice()
        self._register_payment(invoice, 60.5, '2017-01-01')
        original_move = self._get_live_cash_basis_moves(invoice)

        self._assign_outstanding_credit_note(invoice, self._create_credit_note(caba_quantity=0.5))

        self.assertFalse(original_move.exists())
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -50.0, 'base_balance': -50.0, 'tax_amount_currency': -10.5, 'tax_balance': -10.5,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_caba_refund_from_outstanding_credits_in_foreign_currency(self):
        """ The CABA tax lines reconciled at different rates leave nothing on the transition account, exchange
        differences included.
        """
        foreign_currency = self.setup_other_currency('EUR', rates=[('2015-12-31', 3.0), ('2016-12-31', 2.0)])
        invoice = self._create_caba_invoice(invoice_date='2016-01-01', currency_id=foreign_currency.id)
        credit_note = self._create_credit_note(caba_quantity=0.5, invoice_date='2017-01-01', currency_id=foreign_currency.id)
        self._assign_outstanding_credit_note(invoice, credit_note)

        self._register_payment(invoice, 60.5, '2017-01-01', currency_id=foreign_currency.id)

        # Remaining 50 EUR of base and 10.5 EUR of tax, converted at the payment rate (2.0).
        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -50.0, 'base_balance': -25.0, 'tax_amount_currency': -10.5, 'tax_balance': -5.25,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_caba_refund_without_the_other_taxes_of_the_invoice_line(self):
        """ The CABA base of a credit note is removed from the invoice lines having the same CABA taxes, whatever
        their other taxes.
        """
        invoice = self._create_invoice(
            move_type='out_invoice',
            invoice_date='2017-01-01',
            partner_id=self.partner_a.id,
            invoice_line_ids=[self._prepare_invoice_line(price_unit=100, tax_ids=(self.caba_tax | self.non_caba_tax).ids)],
            post=True,
        )
        self._reconcile_credit_note(invoice, self._create_credit_note(caba_quantity=0.5))

        self._register_payment(invoice, 65.5, '2017-01-01')

        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -50.0, 'base_balance': -50.0, 'tax_amount_currency': -10.5, 'tax_balance': -10.5,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_caba_refund_without_the_analytic_distribution_of_the_invoice_line(self):
        """ The CABA base of a credit note is removed from the invoice lines having the same CABA taxes, whatever
        their analytic distribution.
        """
        analytic_plan = self.env['account.analytic.plan'].create({'name': 'CABA Plan'})
        analytic_account = self.env['account.analytic.account'].create({'name': 'CABA Account', 'plan_id': analytic_plan.id})
        invoice = self._create_invoice(
            move_type='out_invoice',
            invoice_date='2017-01-01',
            partner_id=self.partner_a.id,
            invoice_line_ids=[self._prepare_invoice_line(
                price_unit=100,
                tax_ids=self.caba_tax.ids,
                analytic_distribution={str(analytic_account.id): 100},
            )],
            post=True,
        )
        self._reconcile_credit_note(invoice, self._create_credit_note(caba_quantity=0.5))

        self._register_payment(invoice, 60.5, '2017-01-01')

        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -50.0, 'base_balance': -50.0, 'tax_amount_currency': -10.5, 'tax_balance': -10.5,
        }})
        self._assert_cash_basis_settled(invoice)

    def test_non_caba_refund_after_partial_payment_without_exchange_difference_of_the_reconciliation(self):
        """ As in the bank reconciliation widget, the caller handles the exchange difference of the reconciliation
        with the credit note: the replaced cash basis entries must still create their own.
        """
        foreign_currency = self.setup_other_currency('EUR', rates=[('2015-12-31', 3.0), ('2016-12-31', 2.0)])
        invoice = self._create_mixed_invoice(invoice_date='2016-01-01', currency_id=foreign_currency.id)
        self._register_payment(invoice, 60.5, '2017-01-01', currency_id=foreign_currency.id)
        credit_note = self._create_credit_note(non_caba_quantity=1.0, currency_id=foreign_currency.id)

        self.env['account.move.line'].with_context(no_exchange_difference_no_recursive=True)._reconcile_plan([
            (invoice.line_ids + credit_note.line_ids).filtered(lambda line: line.account_type == 'asset_receivable'),
        ])

        # The tax made exigible at 2.0 on the invoice tax line at 3.0 has its exchange difference.
        transition_line = self._get_live_cash_basis_moves(invoice).line_ids.filtered(
            lambda line: line.account_id == self.tax_waiting_account
        )
        self.assertTrue((transition_line.matched_debit_ids | transition_line.matched_credit_ids).exchange_move_id)

        self._register_payment(invoice, 60.5, '2017-01-01', currency_id=foreign_currency.id)

        self._assert_cash_basis_net_amounts(invoice, {self.caba_tax: {
            'base_amount_currency': -100.0, 'base_balance': -50.0, 'tax_amount_currency': -21.0, 'tax_balance': -10.5,
        }})
        self._assert_cash_basis_settled(invoice)
