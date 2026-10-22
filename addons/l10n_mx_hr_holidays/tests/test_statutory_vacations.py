# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import date

from freezegun import freeze_time

from odoo.tests import Form, TransactionCase, tagged


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestStatutoryVacations(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env['res.company'].create({
            'name': 'MX Company',
            'country_id': cls.env.ref('base.mx').id,
        })
        cls.env = cls.env(context=dict(cls.env.context, allowed_company_ids=cls.company.ids))
        cls.employee = cls.env['hr.employee'].create({
            'name': 'MX Employee',
            'company_id': cls.company.id,
            'contract_date_start': date(2016, 1, 1),
            'date_version': date(2016, 1, 1),
        })
        cls.statutory_plan = cls.env.ref('l10n_mx_hr_holidays.l10n_mx_accrual_plan_statutory')

    def test_statutory_plan_anniversaries(self):
        with freeze_time('2016-01-01'):
            allocation = self.env['hr.leave.allocation'].create({
                'name': 'Vacations',
                'employee_id': self.employee.id,
                'accrual_plan_id': self.statutory_plan.id,
                'work_entry_type_id': self.statutory_plan.work_entry_type_id.id,
                'number_of_days': 0,
                'date_from': date(2016, 1, 1),
            })
            allocation.action_approve()

        # No vacation days during the first year of service
        allocation._update_accrual(date(2016, 12, 31))
        self.assertEqual(allocation.number_of_days, 0)

        granted_days = {}
        for anniversary in (1, 6, 11):
            allocation._update_accrual(date(2016 + anniversary - 1, 12, 31))
            days_before_anniversary = allocation.number_of_days
            allocation._update_accrual(date(2016 + anniversary, 1, 1))
            granted_days[anniversary] = allocation.number_of_days - days_before_anniversary
        self.assertEqual(granted_days, {1: 12, 6: 22, 11: 24})

        # The unused days of the previous year are carried over for 6 months, then expire
        self.assertEqual(allocation.number_of_days, 24 + 22)
        allocation._update_accrual(date(2027, 6, 30))
        self.assertEqual(allocation.number_of_days, 24 + 22)
        allocation._update_accrual(date(2027, 7, 1))
        self.assertEqual(allocation.number_of_days, 24)

    def test_allocation_date_defaults_to_first_version_date(self):
        allocation_form = Form(self.env['hr.leave.allocation'])
        allocation_form.employee_id = self.employee
        allocation_form.accrual_plan_id = self.statutory_plan
        self.assertEqual(allocation_form.date_from, date(2016, 1, 1))

        # Recognized seniority
        allocation_form.date_from = date(2014, 6, 1)
        allocation = allocation_form.save()
        self.assertEqual(allocation.date_from, date(2014, 6, 1))
