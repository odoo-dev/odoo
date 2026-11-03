# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import Command
from odoo.exceptions import UserError, ValidationError
from odoo.tests import Form, TransactionCase, new_test_user


class ExpenseWithoutAccountingCommon(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env.company
        cls.user_employee = new_test_user(cls.env, login='expense_employee', groups='base.group_user')
        cls.user_team_approver = new_test_user(cls.env, login='expense_team_approver', groups='hr_expense.group_hr_expense_team_approver')
        cls.user_approver = new_test_user(cls.env, login='expense_approver', groups='hr_expense.group_hr_expense_user')
        cls.employee = cls.env['hr.employee'].create({
            'name': 'Expense Employee',
            'user_id': cls.user_employee.id,
            'expense_manager_id': cls.user_team_approver.id,
        })
        cls.product_no_cost = cls.env['product.product'].create({
            'name': 'Any amount',
            'default_code': 'ANY',
            'can_be_expensed': True,
            'standard_price': 0.0,
        })
        cls.product_cost = cls.env['product.product'].create({
            'name': 'Fixed cost',
            'can_be_expensed': True,
            'standard_price': 12.5,
        })

    def _create_expense(self, **values):
        return self.env['hr.expense'].create({
            'name': 'Lunch',
            'employee_id': self.employee.id,
            'product_id': self.product_no_cost.id,
            'total_amount_currency': 100.0,
            **values,
        })


class TestExpenseWithoutAccounting(ExpenseWithoutAccountingCommon):
    """ These run when the module gets installed, so without the accounting of `hr_expense_account`. """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if 'account_move_id' in cls.env['hr.expense']._fields:
            cls.skipTest(cls, "hr_expense_account replaces the payment of the expenses")

    def test_no_accounting_dependency(self):
        modules = self.env['ir.module.module'].search([('name', '=', 'hr_expense')])
        dependencies = modules.upstream_dependencies(exclude_states=('uninstallable', 'to remove'))
        self.assertNotIn('account', dependencies.mapped('name'))

    def test_no_split_feature(self):
        self.assertNotIn('hr.expense.split.wizard', self.env)
        self.assertNotIn('split_expense_origin_id', self.env['hr.expense']._fields)

    def test_state_selection(self):
        states = [state for state, _label in self.env['hr.expense']._fields['state'].selection]
        self.assertEqual(states, ['draft', 'submitted', 'approved', 'paid', 'refused'])

    def test_pay_employee_expense(self):
        expense = self._create_expense()
        self.assertFalse(expense.can_pay)

        expense.with_user(self.user_employee).action_submit()
        self.assertEqual(expense.state, 'submitted')
        self.assertFalse(expense.can_pay)

        expense.with_user(self.user_team_approver).action_approve()
        self.assertEqual(expense.state, 'approved')
        self.assertFalse(expense.is_paid)
        self.assertTrue(expense.with_user(self.user_approver).can_pay)
        self.env.cr.precommit.run()  # Flush the tracking

        expense.with_user(self.user_approver).action_pay()
        self.assertEqual(expense.state, 'paid')
        self.assertFalse(expense.can_pay)

        self.env.cr.precommit.run()  # Flush the tracking
        paid_message = self.env['mail.message'].search([
            ('model', '=', 'hr.expense'),
            ('res_id', '=', expense.id),
            ('subtype_id', '=', self.env.ref('hr_expense.mt_expense_paid').id),
        ])
        self.assertEqual(len(paid_message), 1)
        self.assertIn('Amount reimbursed', paid_message.body)

    def test_pay_access_rights(self):
        expense = self._create_expense()
        expense.with_user(self.user_employee).action_submit()
        expense.with_user(self.user_team_approver).action_approve()

        for user in (self.user_employee, self.user_team_approver):
            self.assertFalse(expense.with_user(user).can_pay)
            with self.assertRaises(UserError):
                expense.with_user(user).action_pay()
        self.assertEqual(expense.state, 'approved')

    def test_pay_requires_approval(self):
        expense = self._create_expense()
        with self.assertRaises(UserError):
            expense.with_user(self.user_approver).action_pay()
        self.assertEqual(expense.state, 'draft')

    def test_company_paid_expense_is_paid_once_approved(self):
        expense = self._create_expense(payment_mode='company_account')
        expense.with_user(self.user_employee).action_submit()
        expense.with_user(self.user_team_approver).action_approve()
        self.assertEqual(expense.state, 'paid')
        self.assertFalse(expense.with_user(self.user_approver).can_pay)

    def test_autovalidated_company_paid_expense(self):
        """ The employee cannot write on their expense anymore once it has been auto-validated. """
        self.employee.expense_manager_id = False
        expense = self._create_expense(payment_mode='company_account', manager_id=False)
        expense.with_user(self.user_employee).action_submit()
        self.assertEqual(expense.state, 'paid')

    def test_reset_paid_expense(self):
        expense = self._create_expense()
        expense.action_submit()
        expense.with_user(self.user_team_approver).action_approve()
        expense.with_user(self.user_approver).action_pay()

        expense.with_user(self.user_approver).action_reset()
        self.assertEqual(expense.state, 'draft')
        self.assertFalse(expense.is_paid)
        self.assertFalse(expense.approval_state)

    def test_paid_expense_is_protected(self):
        expense = self._create_expense()
        expense.action_submit()
        expense.with_user(self.user_team_approver).action_approve()
        expense.with_user(self.user_approver).action_pay()

        with self.assertRaises(UserError):
            expense._do_refuse("Too late")
        with self.assertRaises(UserError):
            expense.unlink()

    def test_copy_is_not_paid(self):
        expense = self._create_expense()
        expense.action_submit()
        expense.with_user(self.user_team_approver).action_approve()
        expense.with_user(self.user_approver).action_pay()
        self.assertEqual(expense.copy().state, 'draft')

    def test_amounts(self):
        expense = self.env['hr.expense'].create({
            'name': 'Mileage',
            'employee_id': self.employee.id,
            'product_id': self.product_cost.id,
            'quantity': 4,
        })
        self.assertEqual(expense.price_unit, 12.5)
        self.assertEqual(expense.total_amount_currency, 50.0)
        self.assertEqual(expense.total_amount, 50.0)

    def test_amounts_multi_currency(self):
        foreign_currency = self.env['res.currency'].create({'name': 'XEX', 'symbol': 'X', 'rate_ids': [Command.create({'name': '2000-01-01', 'rate': 2.0})]})
        expense = self._create_expense(currency_id=foreign_currency.id, date='2024-01-01', total_amount_currency=100.0)
        self.assertEqual(expense.total_amount_currency, 100.0)
        self.assertEqual(expense.total_amount, 50.0)

        expense.total_amount = 40.0
        self.assertEqual(expense.total_amount_currency, 100.0)
        self.assertEqual(expense.currency_rate, 0.4)

    def test_forms_without_accounting_fields(self):
        with Form(self.env['hr.expense'].with_context(default_employee_id=self.employee.id)) as expense_form:
            expense_form.name = 'Taxi'
            expense_form.product_id = self.product_no_cost
            expense_form.total_amount_currency = 20.0
        self.assertEqual(expense_form.record.total_amount, 20.0)

    def test_analytic_distribution_mandatory_on_approval(self):
        plan = self.env['account.analytic.plan'].create({'name': 'Plan', 'default_applicability': 'mandatory'})
        analytic_account = self.env['account.analytic.account'].create({'name': 'Account', 'plan_id': plan.id})
        expense = self._create_expense()
        expense.action_submit()
        with self.assertRaises(ValidationError):
            expense.with_user(self.user_team_approver).action_approve()
        self.assertEqual(expense.state, 'submitted')

        expense.analytic_distribution = {analytic_account.id: 100}
        expense.with_user(self.user_team_approver).action_approve()
        self.assertEqual(expense.state, 'approved')

    def test_dashboard(self):
        expense = self._create_expense()
        self.employee.user_id = self.env.user
        self.assertEqual(self.env['hr.expense'].get_expense_dashboard()['draft']['amount'], 100.0)
        expense.action_submit()
        self.env['hr.expense'].flush_model()
        self.assertEqual(self.env['hr.expense'].get_expense_dashboard()['submitted']['amount'], 100.0)
        expense.sudo().approval_state = 'approved'
        self.assertEqual(self.env['hr.expense'].get_expense_dashboard()['approved']['amount'], 100.0)
        expense.sudo().is_paid = True
        self.assertEqual(self.env['hr.expense'].get_expense_dashboard()['approved']['amount'], 0.0)

    def test_report(self):
        expense = self._create_expense()
        html = self.env['ir.actions.report']._render_qweb_html('hr_expense.report_expense', expense.ids)[0]
        self.assertIn(b'Expenses Report', html)
        self.assertNotIn(b'Untaxed Amount', html)

    def test_expense_from_email(self):
        self.employee.work_email = 'expense.employee@example.com'
        expense = self.env['hr.expense'].with_user(self.env.ref('base.user_root')).message_new({
            'email_from': 'expense.employee@example.com',
            'subject': 'ANY taxi $12.5',
            'body': '<p>Receipt</p>',
            'message_id': '<expense-no-accounting@example.com>',
        })
        self.assertEqual(expense.employee_id, self.employee)
        self.assertEqual(expense.product_id, self.product_no_cost)
        self.assertEqual(expense.total_amount_currency, 12.5)
