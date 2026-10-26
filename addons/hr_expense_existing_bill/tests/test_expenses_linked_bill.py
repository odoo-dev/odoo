from odoo import Command
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
