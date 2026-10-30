# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('gh')
    def _get_gh_template_data(self):
        return {
            'code_digits': '6',
        }

    @template('gh', 'res.company')
    def _get_gh_res_company(self):
        # Source: see REFERENCES.md. The default taxes are the 20% group taxes
        # (VAT 15% + NHIL 2.5% + GETFund Levy 2.5% on the same taxable value, Act 1151).
        return {
            self.env.company.id: {
                'anglo_saxon_accounting': True,
                'account_fiscal_country_id': 'base.gh',
                'bank_account_code_prefix': '1310',
                'cash_account_code_prefix': '1320',
                'transfer_account_code_prefix': '1330',
                'account_default_pos_receivable_account_id': 'gh122200',
                'income_currency_exchange_account_id': 'gh421400',
                'expense_currency_exchange_account_id': 'gh711300',
                'default_cash_difference_income_account_id': 'gh421500',
                'default_cash_difference_expense_account_id': 'gh615600',
                'account_journal_early_pay_discount_gain_account_id': 'gh421600',
                'account_journal_early_pay_discount_loss_account_id': 'gh615700',
                'income_account_id': 'gh411100',
                'expense_account_id': 'gh511100',
                'receivable_account_id': 'gh122100',
                'payable_account_id': 'gh211100',
                'account_sale_tax_id': 'gh_st',
                'account_purchase_tax_id': 'gh_pt',
                'account_stock_valuation_id': 'gh121000',
            },
        }

    @template('gh', 'account.account')
    def _get_gh_account_account(self):
        return {
            'gh121000': {
                'account_stock_expense_id': 'gh511100',
                'account_stock_variation_id': 'gh511200',
            },
        }
