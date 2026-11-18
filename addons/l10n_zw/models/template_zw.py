# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('zw')
    def _get_zw_template_data(self):
        return {
            'code_digits': '6',
        }

    @template('zw', 'res.company')
    def _get_zw_res_company(self):
        return {
            self.env.company.id: {
                'anglo_saxon_accounting': True,
                'account_fiscal_country_id': 'base.zw',
                'bank_account_code_prefix': '1510',
                'cash_account_code_prefix': '1520',
                'transfer_account_code_prefix': '1530',
                'account_default_pos_receivable_account_id': 'zw_account_131100',
                'income_currency_exchange_account_id': 'zw_account_424000',
                'expense_currency_exchange_account_id': 'zw_account_713000',
                'account_journal_early_pay_discount_loss_account_id': 'zw_account_714000',
                'account_journal_early_pay_discount_gain_account_id': 'zw_account_425000',
                'default_cash_difference_income_account_id': 'zw_account_426000',
                'default_cash_difference_expense_account_id': 'zw_account_715000',
                'account_sale_tax_id': 'zw_tax_sale_15_5',
                'account_purchase_tax_id': 'zw_tax_purchase_15_5',
                'income_account_id': 'zw_account_411000',
                'expense_account_id': 'zw_account_511000',
                'receivable_account_id': 'zw_account_131000',
                'payable_account_id': 'zw_account_221000',
                'account_stock_valuation_id': 'zw_account_121000',
            },
        }

    @template('zw', 'account.account')
    def _get_zw_account_account(self):
        return {
            'zw_account_121000': {
                'account_stock_expense_id': 'zw_account_511000',
                'account_stock_variation_id': 'zw_account_514000',
            },
        }
