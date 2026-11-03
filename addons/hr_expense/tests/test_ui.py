# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.tests import HttpCase, tagged

from odoo.addons.hr_expense.tests.test_expense_without_accounting import ExpenseWithoutAccountingCommon


@tagged('-at_install', 'post_install')
class TestExpenseWithoutAccountingUi(ExpenseWithoutAccountingCommon, HttpCase):

    def test_tour_pay_expense(self):
        if 'account_move_id' in self.env['hr.expense']._fields:
            self.skipTest("hr_expense_account replaces the payment of the expenses")
        self.env.ref('base.user_admin').group_ids |= self.env.ref('hr_expense.group_hr_expense_manager')
        expense = self._create_expense(name='Expense to pay')
        expense.action_submit()
        expense.action_approve()
        self.assertEqual(expense.state, 'approved')
        self.start_tour(f'/odoo/hr.expense/{expense.id}', 'hr_expense_pay_tour', login='admin')
        self.assertEqual(expense.state, 'paid')
