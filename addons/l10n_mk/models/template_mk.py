# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, Command
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('mk')
    def _get_mk_template_data(self):
        return {
            'property_account_receivable_id': 'l10n_mk_account_120',
            'property_account_payable_id': 'l10n_mk_account_220',
            'code_digits': '6',
        }

    @template('mk', 'res.company')
    def _get_ma_res_company(self):
        return {
            self.env.company.id: {
                'account_fiscal_country_id': 'base.mk',
                # 'bank_account_code_prefix': '5141',
                # 'cash_account_code_prefix': '51611',
                # 'transfer_account_code_prefix': '5115',
                # 'account_default_pos_receivable_account_id': 'pcg_34218',
                # 'income_currency_exchange_account_id': 'pcg_7331',
                # 'expense_currency_exchange_account_id': 'pcg_6331',
                # 'account_journal_suspense_account_id': 'pcg_3497',
                # 'default_cash_difference_income_account_id': 'pcg_73861',
                # 'default_cash_difference_expense_account_id': 'pcg_63861',
                # 'account_journal_early_pay_discount_gain_account_id': 'pcg_73862',
                # 'account_journal_early_pay_discount_loss_account_id': 'pcg_63862',
                # 'account_sale_tax_id': 'vat_out_20_80',
                # 'account_purchase_tax_id': 'vat_in_20_146',
                'income_account_id': 'l10n_mk_account_730',
                'expense_account_id': 'l10n_mk_account_701',
                # 'tax_exigibility': 'True',
            },
        }