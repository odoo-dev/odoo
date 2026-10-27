from odoo import fields, Command
from odoo.addons.hr_expense.tests.test_expenses import TestExpenses
from odoo.tests import tagged


@tagged('-at_install', 'post_install')
class TestExpensesLinkedBill(TestExpenses):
    def test_expense_paid_by_company_with_linked_bill(self):
        """ Test that linking a bill uses the payable account and reconciles automatically """
        other_payable_account = self.company_data['default_account_payable'].copy()
        partner = self.env['res.partner'].create({
            'name': 'test partner',
            'property_account_payable_id': other_payable_account.id,
        })
        bill = self.env['account.move'].create({
            'move_type': 'in_invoice',
            'partner_id': partner.id,
            'invoice_date': '2026-01-01',
            'invoice_line_ids': [
                Command.create({
                    'name': 'test bill line',
                    'price_unit': 100.0,
                })
            ],
        })
        bill.action_post()

        # 2. Create Expense linked to this bill
        expense = self.create_expenses({
            'name': 'Expense matched to bill',
            'payment_mode': 'company_account',
            'total_amount_currency': 100.0,
            'has_existing_bill': True,
            'existing_bill_id': bill.id,
        })

        self.assertEqual(expense.account_id, other_payable_account, "The expense account should be the bill's payable account")

        expense.action_submit()
        expense.action_approve()
        expense.action_post()

        payment_entry = expense.account_move_id
        outstanding_payment_account = self.env['account.account'].with_company(self.env.company).search([('name', '=', 'Outstanding Payments')], limit=1)
        self.assertEqual(
            set(payment_entry.line_ids.account_id.ids),
            {other_payable_account.id, outstanding_payment_account.id},
            "The accounts on the payment entry should be the bill's payable account and the outstanding payment account"
        )

        payable_move_line = payment_entry.line_ids.filtered(lambda l: l.account_id == other_payable_account)
        self.assertTrue(bill.payment_state in ('in_payment', 'paid'), "The bill should be marked as paid/in_payment")
        self.assertTrue(payable_move_line.reconciled, "The payment entry should be reconciled with the bill")

    def test_expense_paid_by_employee_with_linked_bill(self):
        """
        Test the flow of an expense paid by the employee with an existing bill

        existing bill (BILL), already created:
        account | debit | credit | partner
        ----------------------------------
        product | 75    | 0      |
        tax     | 25    | 0      |
        payable | 0     | 100    | vendor <- RECONCILED (02)

        debt transfer entry (MISC):
        account | debit | credit | partner
        ----------------------------------
        payable | 0     | 100    | employee <- RECONCILED (01)
        payable | 100   | 0      | vendor <- RECONCILED (02)

        payment move (PNBK):
        account     | debit | credit | partner
        --------------------------------------
        payable     | 100   | 0      | employee <- RECONCILED (01)
        outstanding | 0     | 100    | employee <- RECONCILED (03)

        Finally, when the user will confirm the payment, create the bank statement line and reconcile it:
        Bank statement line (BNK):
        account     | debit | credit | partner
        --------------------------------------
        outstanding | 100   | 0      | employee <- RECONCILED (03)
        bank        | 0     | 100    |

        RECONCILED (02):
        Reconciliation between the existing bill and the debt transfer entry. Mark the bill as paid
        and transfer the debt from the vendor to the employee

        RECONCILED (01):
        Reconciliation between the payment move and the debt transfer entry. Transfer the debt to the employee

        RECONCILED (03):
        Done afterward by the user, mark the expense as paid
        """
        # Create data
        other_payable_account = self.company_data['default_account_payable'].copy()
        partner = self.env['res.partner'].create({
            'name': 'test partner',
            'property_account_payable_id': other_payable_account.id,
        })
        bill = self.env['account.move'].create({
            'move_type': 'in_invoice',
            'partner_id': partner.id,
            'invoice_date': '2026-01-01',
            'invoice_line_ids': [
                Command.create({
                    'name': 'test bill line',
                    'price_unit': 100.0,
                })
            ],
        })
        bill.action_post()

        expense = self.create_expenses({
            'name': 'Expense matched to bill',
            'payment_mode': 'own_account',
            'total_amount_currency': 100.0,
            'has_existing_bill': True,
            'existing_bill_id': bill.id,
            'vendor_id': bill.partner_id.id,
        })

        # post expense
        expense.action_submit()
        expense.action_approve()
        action = expense.action_post()
        wizard = self.env[action['res_model']].browse(action['res_id']).with_context(action['context'])
        wizard.action_post_entry()

        # check accounts on payment entry
        payment_entry = expense.account_move_id
        outstanding_payment_account = self.env['account.account'].with_company(self.env.company).search([('name', '=', 'Outstanding Payments')], limit=1)
        self.assertEqual(
            set(payment_entry.line_ids.account_id.ids),
            {other_payable_account.id, outstanding_payment_account.id},
        )

        # check states
        self.assertEqual(expense.state, self.env['account.move']._get_invoice_in_payment_state())
        self.assertEqual(payment_entry.state, 'posted')
        self.assertEqual(payment_entry.origin_payment_id.state, 'in_process')

        # check the bill is paid and reconciled with the payment move
        payable_move_line = payment_entry.line_ids.filtered(lambda l: l .account_id == other_payable_account)
        self.assertEqual(bill.payment_state, 'paid', "The bill should be marked as paid")
        self.assertTrue(payable_move_line.reconciled, "The payment entry should be reconciled with the bill")

        # check amounts and partners on debt transfer move
        debt_transfer_move = payable_move_line.reconciled_lines_excluding_exchange_diff_ids.move_id
        employee_partner = self.expense_employee.user_id.partner_id
        self.assertRecordValues(debt_transfer_move.line_ids, [
            {'debit': 100.0, 'credit': 0.0, 'partner_id': partner.id, 'account_id': other_payable_account.id},
            {'debit': 0.0, 'credit': 100.0, 'partner_id': employee_partner.id, 'account_id': other_payable_account.id},
        ])

        # create a bank statement line and reconcile it with the payment move -> expense should be marked as paid
        bank_line = self.env['account.bank.statement.line'].create({
            'date': fields.Date.today(),
            'journal_id': self.company_data['default_journal_bank'].id,
            'payment_ref': 'test bank line',
            'partner_id': employee_partner.id,
            'amount': -100.0,
        })

        # Reconcile lines to check expense is marked as 'paid'
        bank_line_to_reconcile = bank_line.move_id.line_ids.filtered(lambda l: l.account_id.account_type == 'asset_current')
        payment_line_to_reconcile = payment_entry.line_ids.filtered(lambda l: l.account_id.account_type == 'asset_current')
        bank_line_to_reconcile.account_id = payment_line_to_reconcile.account_id
        (bank_line_to_reconcile + payment_line_to_reconcile).reconcile()
        self.assertEqual(expense.state, 'paid')
