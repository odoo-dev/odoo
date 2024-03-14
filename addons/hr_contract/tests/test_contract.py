# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, date
from dateutil.relativedelta import relativedelta

from odoo.exceptions import ValidationError, AccessError
from odoo.addons.hr_contract.tests.common import TestContractCommon
from odoo.addons.mail.tests.common import mail_new_test_user
from odoo.tests.common import users
from odoo.tests import tagged

@tagged('test_contracts')
class TestHrContracts(TestContractCommon):

    @classmethod
    def setUpClass(cls):
        super(TestHrContracts, cls).setUpClass()
        cls.contracts = cls.env['hr.contract'].with_context(tracking_disable=True)

        cls.hr_user = mail_new_test_user(
            cls.env, login='hr_user',
            name='HR Manager', email='hr@test.example.com',
            company_id=cls.env.company.id,
            groups='base.default_user',
        )

    def create_contract(self, state, kanban_state, start, end=None):
        return self.env['hr.contract'].create({
            'name': 'Contract',
            'employee_id': self.employee.id,
            'state': state,
            'kanban_state': kanban_state,
            'wage': 1,
            'date_start': start,
            'date_end': end,
        })

    def test_incoming_overlapping_contract(self):
        start = datetime.strptime('2015-11-01', '%Y-%m-%d').date()
        end = datetime.strptime('2015-11-30', '%Y-%m-%d').date()
        self.create_contract('open', 'normal', start, end)

        # Incoming contract
        with self.assertRaises(ValidationError, msg="It should not create two contract in state open or incoming"):
            start = datetime.strptime('2015-11-15', '%Y-%m-%d').date()
            end = datetime.strptime('2015-12-30', '%Y-%m-%d').date()
            self.create_contract('draft', 'done', start, end)

    def test_pending_overlapping_contract(self):
        start = datetime.strptime('2015-11-01', '%Y-%m-%d').date()
        end = datetime.strptime('2015-11-30', '%Y-%m-%d').date()
        self.create_contract('open', 'normal', start, end)

        # Pending contract
        with self.assertRaises(ValidationError, msg="It should not create two contract in state open or pending"):
            start = datetime.strptime('2015-11-15', '%Y-%m-%d').date()
            end = datetime.strptime('2015-12-30', '%Y-%m-%d').date()
            self.create_contract('open', 'blocked', start, end)

        # Draft contract -> should not raise
        start = datetime.strptime('2015-11-15', '%Y-%m-%d').date()
        end = datetime.strptime('2015-12-30', '%Y-%m-%d').date()
        self.create_contract('draft', 'normal', start, end)

    def test_draft_overlapping_contract(self):
        start = datetime.strptime('2015-11-01', '%Y-%m-%d').date()
        end = datetime.strptime('2015-11-30', '%Y-%m-%d').date()
        self.create_contract('open', 'normal', start, end)

        # Draft contract -> should not raise even if overlapping
        start = datetime.strptime('2015-11-15', '%Y-%m-%d').date()
        end = datetime.strptime('2015-12-30', '%Y-%m-%d').date()
        self.create_contract('draft', 'normal', start, end)

    def test_overlapping_contract_no_end(self):

        # No end date
        self.create_contract('open', 'normal', datetime.strptime('2015-11-01', '%Y-%m-%d').date())

        with self.assertRaises(ValidationError):
            start = datetime.strptime('2015-11-15', '%Y-%m-%d').date()
            end = datetime.strptime('2015-12-30', '%Y-%m-%d').date()
            self.create_contract('draft', 'done', start, end)

    def test_overlapping_contract_no_end2(self):

        start = datetime.strptime('2015-11-01', '%Y-%m-%d').date()
        end = datetime.strptime('2015-12-30', '%Y-%m-%d').date()
        self.create_contract('open', 'normal', start, end)

        with self.assertRaises(ValidationError):
            # No end
            self.create_contract('draft', 'done', datetime.strptime('2015-01-01', '%Y-%m-%d').date())

    def test_set_employee_contract_create(self):
        contract = self.create_contract('open', 'normal', date(2018, 1, 1), date(2018, 1, 2))
        self.assertEqual(self.employee.contract_id, contract)

    def test_set_employee_contract_write(self):
        contract = self.create_contract('draft', 'normal', date(2018, 1, 1), date(2018, 1, 2))
        contract.state = 'open'
        self.assertEqual(self.employee.contract_id, contract)

    def test_first_contract_date(self):
        self.create_contract('open', 'normal', date(2018, 1, 1), date(2018, 1, 31))
        self.assertEqual(self.employee.first_contract_date, date(2018, 1, 1))

        # New contract, no gap
        self.create_contract('open', 'normal', date(2017, 1, 1), date(2017, 12, 31))
        self.assertEqual(self.employee.first_contract_date, date(2017, 1, 1))

        # New contract, with gap
        self.create_contract('open', 'normal', date(2016, 1, 1), date(2016, 1, 31))
        self.assertEqual(self.employee.first_contract_date, date(2017, 1, 1))

    def test_current_contract_stage_change(self):
        today = date.today()
        contract = self.create_contract('open', 'normal', today + relativedelta(day=1), today + relativedelta(day=31))
        self.assertEqual(self.employee.contract_id, contract)

        draft_contract = self.create_contract('draft', 'normal', today + relativedelta(months=1, day=1), today + relativedelta(months=1, day=31))
        draft_contract.state = 'open'
        self.assertEqual(self.employee.contract_id, draft_contract)

        draft_contract.state = 'draft'
        self.assertEqual(self.employee.contract_id, contract)

    def test_copy_employee_contract_create(self):
        contract = self.create_contract('open', 'normal', date(2018, 1, 1), date(2018, 1, 2))
        duplicate_employee = self.employee.copy()
        self.assertNotEqual(duplicate_employee.contract_id, contract)

    @users('hr_user')
    def test_contract_accessibility(self):
        """
        hr_contract.group_hr_contract_employee_manager can call `action_open_contract_history()` of employees that they
            directly manage, hr_contract.group_hr_contract_manager can call for all regular employees
        """
        self.env.user.groups_id = [
            (4, self.ref('hr_contract.group_hr_contract_manager')),
            (4, self.ref('hr.group_hr_user'))
        ]
        self.create_contract('open', 'normal', date(2024, 1, 1))

        self.employee.contract_id.with_user(self.env.user).check_access_rule('read')
        self.env.user.groups_id = [(3, self.ref('hr_contract.group_hr_contract_manager'))]

        with self.assertRaises(AccessError):
            self.employee.contract_id.with_user(self.env.user).check_access_rule('read')

        self.env.user.employee_id = self.env['hr.employee'].create({
            'name': 'Test Employee',
            'user_id': self.env.user.id,
        })
        self.employee.parent_id = self.env.user.employee_id
        self.employee.contract_id.with_user(self.env.user).check_access_rule('read')

        self.env.user.groups_id = [(3, self.ref('hr_contract.group_hr_contract_employee_manager'))]
        with self.assertRaises(AccessError):
            self.employee.contract_id.with_user(self.env.user).check_access_rights('read')
