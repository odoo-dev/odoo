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

    def test_non_caba_refund_before_payment(self):
        """A credit note applied before payment reduces the amount used to prorate CABA taxes."""

        invoice = self._create_invoice(
            move_type='out_invoice',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids),
                self._prepare_invoice_line(price_unit=100, tax_ids=self.caba_tax.ids),
            ],
            post=True,
        )
        credit_note = self._create_invoice(
            move_type='out_refund',
            partner_id=self.partner_a.id,
            invoice_line_ids=[self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids)],
            post=True,
        )
        (invoice.line_ids + credit_note.line_ids).filtered(
            lambda line: line.account_type == 'asset_receivable'
        ).reconcile()

        self.env['account.payment.register'].with_context(
            active_model='account.move',
            active_ids=invoice.ids,
        ).create({
            'amount': 121,
            'payment_date': invoice.date,
        })._create_payments()

        payment_partials = invoice.line_ids.matched_credit_ids | invoice.line_ids.matched_debit_ids
        cash_basis_moves = self.env['account.move'].search([
            ('tax_cash_basis_rec_id', 'in', payment_partials.ids),
            ('tax_cash_basis_origin_move_id', '=', invoice.id),
        ])
        self.assertEqual(len(cash_basis_moves), 1)
        self.assertRecordValues(cash_basis_moves.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'amount_currency': -100.0, 'balance': -100.0},
            {'account_id': self.tax_collected_account.id, 'amount_currency': -21.0, 'balance': -21.0},
            {'account_id': self.tax_waiting_account.id, 'amount_currency': 21.0, 'balance': 21.0},
            {'account_id': self.company_data['default_account_revenue'].id, 'amount_currency': 100.0, 'balance': 100.0},
        ])

    def test_partial_caba_refund_before_payment(self):
        """A credit note applied before payment reduces the amount used to prorate CABA taxes."""
        invoice = self._create_invoice(
            move_type='out_invoice',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100, tax_ids=self.non_caba_tax.ids),
                self._prepare_invoice_line(price_unit=100, tax_ids=self.caba_tax.ids),
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
        (invoice.line_ids + credit_note.line_ids).filtered(
            lambda line: line.account_type == 'asset_receivable'
        ).reconcile()
        (invoice.line_ids + credit_note.line_ids).filtered(
            lambda line: line.tax_line_id == self.caba_tax
        ).reconcile()

        self.env['account.payment.register'].with_context(
            active_model='account.move',
            active_ids=invoice.ids,
        ).create({
            'amount': 149.3,
            'payment_date': invoice.date,
        })._create_payments()

        payment_partials = invoice.line_ids.matched_credit_ids | invoice.line_ids.matched_debit_ids
        cash_basis_moves = self.env['account.move'].search([
            ('tax_cash_basis_rec_id', 'in', payment_partials.ids),
            ('tax_cash_basis_origin_move_id', '=', invoice.id),
        ])
        self.assertEqual(len(cash_basis_moves), 1)
        self.assertRecordValues(cash_basis_moves.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_revenue'].id, 'amount_currency': -80.0, 'balance': -80.0},
            {'account_id': self.tax_collected_account.id, 'amount_currency': -16.8, 'balance': -16.8},
            {'account_id': self.tax_waiting_account.id, 'amount_currency': 16.8, 'balance': 16.8},
            {'account_id': self.company_data['default_account_revenue'].id, 'amount_currency': 80.0, 'balance': 80.0},
        ])

    def test_partial_caba_refund_before_payment_with_several_caba_lines(self):
        """A credit note applied before payment reduces the amount used to prorate CABA taxes."""
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
        (invoice.line_ids + credit_note.line_ids).filtered(
            lambda line: line.account_type == 'asset_receivable'
        ).reconcile()
        (invoice.line_ids + credit_note.line_ids).filtered(
            lambda line: line.tax_line_id == self.caba_tax
        ).reconcile()

        self.env['account.payment.register'].with_context(
            active_model='account.move',
            active_ids=invoice.ids,
        ).create({
            'amount': 258.3,
            'payment_date': invoice.date,
        })._create_payments()

        payment_partials = invoice.line_ids.matched_credit_ids | invoice.line_ids.matched_debit_ids
        cash_basis_moves = self.env['account.move'].search([
            ('tax_cash_basis_rec_id', 'in', payment_partials.ids),
            ('tax_cash_basis_origin_move_id', '=', invoice.id),
        ])
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
        (invoice.line_ids + credit_note.line_ids).filtered(
            lambda line: line.account_type == 'asset_receivable'
        ).reconcile()
        for tax in self.caba_tax | second_caba_tax:
            (invoice.line_ids + credit_note.line_ids).filtered(
                lambda line: line.tax_line_id == tax
            ).reconcile()

        self.env['account.payment.register'].with_context(
            active_model='account.move',
            active_ids=invoice.ids,
        ).create({
            'amount': 417.8,
            'payment_date': invoice.date,
        })._create_payments()

        payment_partials = invoice.line_ids.matched_credit_ids | invoice.line_ids.matched_debit_ids
        cash_basis_moves = self.env['account.move'].search([
            ('tax_cash_basis_rec_id', 'in', payment_partials.ids),
            ('tax_cash_basis_origin_move_id', '=', invoice.id),
        ])
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
        (bill.line_ids + refund.line_ids).filtered(
            lambda line: line.account_type == 'liability_payable'
        ).reconcile()
        (bill.line_ids + refund.line_ids).filtered(
            lambda line: line.tax_line_id == vendor_caba_tax
        ).reconcile()

        self.env['account.payment.register'].with_context(
            active_model='account.move',
            active_ids=bill.ids,
        ).create({
            'amount': 60.5,
            'payment_date': bill.date,
        })._create_payments()

        payment_partials = bill.line_ids.matched_credit_ids | bill.line_ids.matched_debit_ids
        cash_basis_moves = self.env['account.move'].search([
            ('tax_cash_basis_rec_id', 'in', payment_partials.ids),
            ('tax_cash_basis_origin_move_id', '=', bill.id),
        ])
        self.assertEqual(len(cash_basis_moves), 1)
        self.assertRecordValues(cash_basis_moves.line_ids.sorted('balance'), [
            {'account_id': self.company_data['default_account_expense'].id, 'amount_currency': -50.0, 'balance': -50.0},
            {'account_id': self.tax_waiting_account.id, 'amount_currency': -10.5, 'balance': -10.5},
            {'account_id': self.tax_collected_account.id, 'amount_currency': 10.5, 'balance': 10.5},
            {'account_id': self.company_data['default_account_expense'].id, 'amount_currency': 50.0, 'balance': 50.0},
        ])

    def test_partially_applied_refund_only_reduces_matched_caba_base(self):
        invoice = self._create_invoice(
            move_type='out_invoice',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100, tax_ids=self.caba_tax.ids),
            ],
            post=True,
        )
        refund = self._create_invoice(
            move_type='out_refund',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(quantity=0.5, price_unit=100, tax_ids=self.caba_tax.ids),
            ],
            post=True,
        )
        invoice_receivable = invoice.line_ids.filtered(
            lambda line: line.account_type == 'asset_receivable'
        )
        refund_receivable = refund.line_ids.filtered(
            lambda line: line.account_type == 'asset_receivable'
        )
        invoice_tax_line = invoice.line_ids.filtered(lambda line: line.tax_line_id == self.caba_tax)
        refund_tax_line = refund.line_ids.filtered(lambda line: line.tax_line_id == self.caba_tax)
        self.env['account.partial.reconcile'].create([
            {
                'debit_move_id': invoice_receivable.id,
                'credit_move_id': refund_receivable.id,
                'amount': 30.25,
                'debit_amount_currency': 30.25,
                'credit_amount_currency': 30.25,
            },
            {
                'debit_move_id': refund_tax_line.id,
                'credit_move_id': invoice_tax_line.id,
                'amount': 5.25,
                'debit_amount_currency': 5.25,
                'credit_amount_currency': 5.25,
            },
        ])

        self.env['account.payment.register'].with_context(
            active_model='account.move',
            active_ids=invoice.ids,
        ).create({
            'amount': 90.75,
            'payment_date': invoice.date,
        })._create_payments()

        payment_partials = invoice.line_ids.matched_credit_ids | invoice.line_ids.matched_debit_ids
        cash_basis_moves = self.env['account.move'].search([
            ('tax_cash_basis_rec_id', 'in', payment_partials.ids),
            ('tax_cash_basis_origin_move_id', '=', invoice.id),
        ])
        self.assertEqual(len(cash_basis_moves), 1)
        base_lines = cash_basis_moves.line_ids.filtered(lambda line: self.caba_tax in line.tax_ids)
        self.assertEqual(sum(abs(amount) for amount in base_lines.mapped('amount_currency')), 75.0)
        tax_lines = cash_basis_moves.line_ids.filtered(lambda line: line.tax_line_id == self.caba_tax)
        self.assertEqual(sum(abs(amount) for amount in tax_lines.mapped('amount_currency')), 15.75)

    def _test_credit_note_after_partial_payment_caba(self):
        """A credit note applied after payment adjusts the already recognized CABA tax."""
        invoice = self._create_invoice(
            move_type='out_invoice',
            partner_id=self.partner_a.id,
            invoice_line_ids=[
                self._prepare_invoice_line(price_unit=100, tax_ids=non_caba_tax.ids),
                self._prepare_invoice_line(price_unit=100, tax_ids=caba_tax.ids),
            ],
            post=True,
        )
        self.env['account.payment.register'].with_context(
            active_model='account.move',
            active_ids=invoice.ids,
        ).create({
            'amount': 121,
            'payment_date': invoice.date,
            'journal_id': self.company_data['default_journal_bank'].id,
            'payment_method_line_id': self.inbound_payment_method_line.id,
        })._create_payments()
        payment_partials = invoice.line_ids.matched_credit_ids | invoice.line_ids.matched_debit_ids
        cash_basis_moves = self.env['account.move'].search([
            ('tax_cash_basis_rec_id', 'in', payment_partials.ids),
            ('tax_cash_basis_origin_move_id', '=', invoice.id),
        ])
        self.assertEqual(len(cash_basis_moves), 1)

        credit_note = self._create_invoice(
            move_type='out_refund',
            partner_id=self.partner_a.id,
            invoice_line_ids=[self._prepare_invoice_line(price_unit=100, tax_ids=non_caba_tax.ids)],
            post=True,
        )
        (invoice.line_ids + credit_note.line_ids).filtered(
            lambda line: line.account_type == 'asset_receivable'
        ).reconcile()

        cash_basis_moves = self.env['account.move'].search([
            ('tax_cash_basis_rec_id', 'in', payment_partials.ids),
            ('tax_cash_basis_origin_move_id', '=', invoice.id),
        ])
        self.assertEqual(len(cash_basis_moves), 3)
        caba_tax_line = cash_basis_moves.line_ids.filtered(lambda line: line.tax_line_id == caba_tax)
        self.assertEqual(sum(caba_tax_line.mapped('balance')), -21.0)
