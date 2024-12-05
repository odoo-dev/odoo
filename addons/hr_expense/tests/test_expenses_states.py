# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields
from odoo.addons.hr_expense.tests.common import TestExpenseCommon
from odoo.tests import tagged


@tagged('-at_install', 'post_install')
class TestExpensesStates(TestExpenseCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.expense_states_employee = cls.create_expenses({
            'name': 'Expense Employee 1',
        })

        cls.expense_states_company = cls.create_expenses({
            'name': 'Expense Company 1',
            'payment_mode': 'company_account',
            # To avoid duplicated expense wizard
            'total_amount_currency': 1000,
            'date': '2017-01-01',
        })
        cls.expenses_states = cls.expense_states_employee + cls.expense_states_company

        cls.paid_or_in_payment_state = cls.env['account.move']._get_invoice_in_payment_state()

    def test_expense_state_synchro_1_regular_flow(self):
        # STEP 1: Draft
        self.assertRecordValues(self.expenses_states, [
            {'payment_mode': 'own_account',     'state': 'draft'},
            {'payment_mode': 'company_account', 'state': 'draft'},
        ])
        self.assertFalse(self.expenses_states.account_move_id)

        # STEP 2: Submit
        self.expenses_states.action_submit()
        self.assertRecordValues(self.expenses_states, [
            {'payment_mode': 'own_account',     'state': 'submitted'},
            {'payment_mode': 'company_account', 'state': 'submitted'},
        ])
        self.assertFalse(self.expenses_states.account_move_id)

        # STEP 3: Approve
        self.expenses_states.action_approve()
        self.assertRecordValues(self.expenses_states, [
            {'payment_mode': 'own_account',     'state': 'approved'},
            {'payment_mode': 'company_account', 'state': 'approved'},
        ])
        self.assertFalse(self.expenses_states.account_move_id)

        # STEP 4: Post (create moves)
        self.post_expenses_with_wizard(self.expenses_states)
        self.assertRecordValues(self.expenses_states, [
            {'payment_mode': 'own_account',     'state': 'posted'},
            {'payment_mode': 'company_account', 'state': 'paid'},
        ])
        self.assertRecordValues(self.expenses_states.account_move_id, [
            {'state': 'posted', 'payment_state': 'not_paid'},
            {'state': 'posted', 'payment_state': 'not_paid'},
        ])

        self.assertEqual('in_process', self.expense_states_company.account_move_id.origin_payment_id.state)
        self.assertFalse(self.expense_states_employee.account_move_id.origin_payment_id)

    def test_expense_state_synchro_2_employee_specific_flow_1(self):
        """ Posted -> Reset move to draft (No change)"""
        self.expense_states_employee.action_submit()
        self.expense_states_employee.action_approve()
        self.post_expenses_with_wizard(self.expense_states_employee)

        self.expense_states_employee.account_move_id.button_draft()
        self.assertEqual(self.expense_states_employee.state, 'posted')
        self.assertRecordValues(self.expense_states_employee.account_move_id, [
            {'state': 'draft', 'payment_state': 'not_paid'},
        ])

    def test_expense_state_synchro_2_employee_specific_flow_2(self):
        """ Posted -> Cancel move (Expense is paid) """
        self.expense_states_employee.action_submit()
        self.expense_states_employee.action_approve()
        self.post_expenses_with_wizard(self.expense_states_employee)

        self.expense_states_employee.account_move_id.button_draft()
        self.expense_states_employee.account_move_id.button_cancel()
        self.assertEqual(self.expense_states_employee.state, 'paid')
        self.assertTrue(self.expenses_states.account_move_id)

    def test_expense_state_synchro_2_employee_specific_flow_3(self):
        """ Posted -> Unlink move (Back to approved) """
        self.expense_states_employee.action_submit()
        self.expense_states_employee.action_approve()
        self.post_expenses_with_wizard(self.expense_states_employee)

        self.expense_states_employee.account_move_id.button_draft()
        self.expense_states_employee.account_move_id.unlink()
        self.assertRecordValues(self.expense_states_employee, [
            {'state': 'approved', 'account_move_id': False},
        ])

    def test_expense_state_synchro_2_employee_specific_flow_4(self):
        """ Posted -> Reverse move (Expense is paid) """
        self.expense_states_employee.action_submit()
        self.expense_states_employee.action_approve()
        self.post_expenses_with_wizard(self.expense_states_employee)

        self.expense_states_employee.account_move_id._reverse_moves(
            default_values_list=[{'invoice_date': fields.Date.context_today(self.expense_states_employee)}],
            cancel=True,
        )
        self.assertEqual(self.expense_states_employee.state, 'paid')
        self.assertTrue(self.expenses_states.account_move_id)

    def test_expense_state_synchro_2_employee_specific_flow_5(self):
        """ Posted -> Paid in one payment (Set to paid) """
        self.expense_states_employee.action_submit()
        self.expense_states_employee.action_approve()
        self.post_expenses_with_wizard(self.expense_states_employee)

        self.get_new_payment(self.expense_states_employee, self.expense_states_employee.total_amount)

        self.assertEqual(self.expense_states_employee.state, self.paid_or_in_payment_state)
        self.assertRecordValues(self.expense_states_employee.account_move_id, [
            {'state': 'posted', 'payment_state': self.paid_or_in_payment_state},
        ])

    def test_expense_state_synchro_2_employee_specific_flow_6(self):
        """ Posted -> Paid in several payment (Set to paid, even when partially)"""
        self.expense_states_employee.action_submit()
        self.expense_states_employee.action_approve()
        self.post_expenses_with_wizard(self.expense_states_employee)

        self.get_new_payment(self.expense_states_employee, 1)

        self.assertEqual(self.expense_states_employee.state, self.paid_or_in_payment_state)
        self.assertRecordValues(self.expense_states_employee.account_move_id, [
            {'state': 'posted', 'payment_state': 'partial'},
        ])

        self.get_new_payment(self.expense_states_employee, self.expense_states_employee.total_amount - 1)

        self.assertEqual(self.expense_states_employee.state, self.paid_or_in_payment_state)
        self.assertRecordValues(self.expense_states_employee.account_move_id, [
            {'state': 'posted', 'payment_state': self.paid_or_in_payment_state},
        ])

    def test_expense_state_synchro_2_employee_specific_flow_7(self):
        """ (Partially/) Paid -> Reset move to draft (Back to posted) """
        self.expense_states_employee.action_submit()
        self.expense_states_employee.action_approve()
        self.post_expenses_with_wizard(self.expense_states_employee)

        self.get_new_payment(self.expense_states_employee, self.expense_states_employee.total_amount)

        self.expense_states_employee.account_move_id.button_draft()
        self.assertEqual(self.expense_states_employee.state, 'posted')
        self.assertRecordValues(self.expense_states_employee.account_move_id, [
            {'state': 'draft', 'payment_state': 'not_paid'},
        ])

    def test_expense_state_synchro_3_company_specific_flow_1(self):
        """ Paid -> Reset move or payment to draft (Stay at paid) """
        self.expense_states_company.action_submit()
        self.expense_states_company.action_approve()
        self.expense_states_company.action_post()

        self.expense_states_company.account_move_id.button_draft()
        self.assertEqual(self.expense_states_company.state, 'paid')
        self.assertRecordValues(self.expense_states_company.account_move_id, [
            {'state': 'draft', 'payment_state': 'not_paid'},
        ])

        self.expense_states_company.account_move_id.action_post()
        self.assertEqual(self.expense_states_company.state, 'paid')

        self.expense_states_company.account_move_id.origin_payment_id.action_draft()
        self.assertEqual(self.expense_states_company.state, 'paid')
        self.assertRecordValues(self.expense_states_company.account_move_id, [
            {'state': 'draft', 'payment_state': 'not_paid'},
        ])

    def test_expense_state_synchro_3_company_specific_flow_3(self):
        """ Posted with draft move -> Cancel payment (back to paid) """
        self.expense_states_company.action_submit()
        self.expense_states_company.action_approve()
        self.expense_states_company.action_post()

        self.expense_states_company.account_move_id.origin_payment_id.action_cancel()
        self.assertEqual(self.expense_states_company.state, 'paid')
        self.assertTrue(self.expense_states_company.account_move_id.origin_payment_id)

    def test_expense_state_synchro_3_company_specific_flow_4(self):
        """ Posted & Paid -> Reverse move (state stays the same) """
        self.expense_states_company.action_submit()
        self.expense_states_company.action_approve()
        self.expense_states_company.action_post()

        self.expense_states_company.account_move_id._reverse_moves(
            default_values_list=[{'invoice_date': fields.Date.context_today(self.expense_states_company)}],
            cancel=True,
        )
        self.assertRecordValues(self.expense_states_company, [
            {'state': 'paid'},
        ])
        self.assertRecordValues(self.expense_states_company.account_move_id, [
            {'state': 'posted'},
        ])

    def test_expense_state_autovalidation(self):
        """ Test the auto-validation flow skips 'submitted' state when there is no manager"""
        self.expense_employee.expense_manager_id = False
        self.expenses_states.manager_id = False
        self.expenses_states.action_submit()
        self.assertSequenceEqual(['approved', 'approved'], self.expenses_states.mapped('state'))
