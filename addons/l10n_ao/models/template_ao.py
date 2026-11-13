# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('ao')
    def _get_ao_template_data(self):
        return {
            # PGC codes are dotted and of variable depth (e.g. 51, 34.5.2.1): keep them as is.
            'code_digits': '2',
        }

    @template('ao', 'res.company')
    def _get_ao_res_company(self):
        return {
            self.env.company.id: {
                'account_fiscal_country_id': 'base.ao',
                'bank_account_code_prefix': '43.1.1',
                'cash_account_code_prefix': '45.1.1',
                'transfer_account_code_prefix': '48.2',
                'account_journal_suspense_account_id': 'account_48_1',
                'transfer_account_id': 'account_48_2',
                'income_currency_exchange_account_id': 'account_66_2_1',
                'expense_currency_exchange_account_id': 'account_76_2_1',
                'account_journal_early_pay_discount_loss_account_id': 'account_76_3',
                'account_journal_early_pay_discount_gain_account_id': 'account_66_3',
                'default_cash_difference_income_account_id': 'account_63_8',
                'default_cash_difference_expense_account_id': 'account_75_8',
                'account_sale_tax_id': 'iva_sale_14_goods',
                'account_purchase_tax_id': 'iva_purchase_14_goods',
                'expense_account_id': 'account_21_2',
                'income_account_id': 'account_61_3_1',
                'receivable_account_id': 'account_31_1_2_1',
                'payable_account_id': 'account_32_1_2_1',
            },
        }

    @template(model='account.journal')
    def _get_account_journal(self, template_code):
        vals = super()._get_account_journal(template_code)
        if template_code == 'ao':
            if 'bank' in vals:
                vals['bank']['default_account_id'] = 'account_43_1_1'
            if 'cash' in vals:
                vals['cash']['default_account_id'] = 'account_45_1_1'
        return vals

    def _get_account_parent_xmlid(self, code_prefix, template_code):
        if template_code == 'ao':
            return {
                '43.1.1': 'account_group_43_1',
                '45.1.1': 'account_group_45_1',
                '48.1': 'account_group_48',
                '48.2': 'account_group_48',
            }.get(code_prefix)
        return super()._get_account_parent_xmlid(code_prefix, template_code)

    def _create_outstanding_accounts(self, company, bank_prefix, code_digits):
        if company.chart_template == 'ao':
            # Outstanding receipts/payments belong to PGC account 48 "Conta transitória",
            # next to the bank suspense account (48.1) and funds in transit (48.2).
            bank_prefix = '48.1'
        return super()._create_outstanding_accounts(company, bank_prefix, code_digits)
