# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('pg')
    def _get_pg_template_data(self):
        return {
            'code_digits': '6',
        }

    @template('pg', 'res.company')
    def _get_pg_res_company(self):
        return {
            self.env.company.id: {
                'anglo_saxon_accounting': True,
                'account_fiscal_country_id': 'base.pg',
                'bank_account_code_prefix': '1012',
                'cash_account_code_prefix': '1011',
                'transfer_account_id': 'l10n_pg_101600',
                'account_journal_suspense_account_id': 'l10n_pg_101300',
                'receivable_account_id': 'l10n_pg_102100',
                'payable_account_id': 'l10n_pg_201100',
                'account_default_pos_receivable_account_id': 'l10n_pg_102200',
                'default_cash_difference_income_account_id': 'l10n_pg_701700',
                'default_cash_difference_expense_account_id': 'l10n_pg_801700',
                'income_currency_exchange_account_id': 'l10n_pg_701400',
                'expense_currency_exchange_account_id': 'l10n_pg_801500',
                'account_journal_early_pay_discount_loss_account_id': 'l10n_pg_801800',
                'account_journal_early_pay_discount_gain_account_id': 'l10n_pg_701300',
                'account_sale_tax_id': 'l10n_pg_tax_sale_gst_10',
                'account_purchase_tax_id': 'l10n_pg_tax_purchase_gst_10',
                'expense_account_id': 'l10n_pg_501100',
                'income_account_id': 'l10n_pg_401100',
                'account_stock_valuation_id': 'l10n_pg_104100',
                'deferred_expense_account_id': 'l10n_pg_105100',
                'deferred_revenue_account_id': 'l10n_pg_204200',
                'account_bills_to_receive_id': 'l10n_pg_204100',
                'account_billed_not_received_id': 'l10n_pg_105100',
                'account_invoices_to_issue_id': 'l10n_pg_102400',
                'account_invoiced_not_delivered_id': 'l10n_pg_204200',
            },
        }

    def _get_account_parent_xmlid(self, code_prefix, template_code):
        if template_code == 'pg':
            return {
                '1011': 'l10n_pg_101000',
                '1012': 'l10n_pg_101000',
            }.get(code_prefix)
        return super()._get_account_parent_xmlid(code_prefix, template_code)

    @template('pg', 'account.account')
    def _get_pg_account_account(self):
        return {
            'l10n_pg_104100': {'account_stock_variation_id': 'l10n_pg_502100'},
            'l10n_pg_151200': {'asset_depreciation_account_id': 'l10n_pg_151210', 'asset_expense_account_id': 'l10n_pg_609100'},
            'l10n_pg_151300': {'asset_depreciation_account_id': 'l10n_pg_151310', 'asset_expense_account_id': 'l10n_pg_609200'},
            'l10n_pg_152100': {'asset_depreciation_account_id': 'l10n_pg_152110', 'asset_expense_account_id': 'l10n_pg_609300'},
            'l10n_pg_152200': {'asset_depreciation_account_id': 'l10n_pg_152210', 'asset_expense_account_id': 'l10n_pg_609400'},
            'l10n_pg_152300': {'asset_depreciation_account_id': 'l10n_pg_152310', 'asset_expense_account_id': 'l10n_pg_609500'},
            'l10n_pg_152400': {'asset_depreciation_account_id': 'l10n_pg_152410', 'asset_expense_account_id': 'l10n_pg_609600'},
            'l10n_pg_152500': {'asset_depreciation_account_id': 'l10n_pg_152510', 'asset_expense_account_id': 'l10n_pg_609700'},
            'l10n_pg_152600': {'asset_depreciation_account_id': 'l10n_pg_152610', 'asset_expense_account_id': 'l10n_pg_609800'},
            'l10n_pg_153100': {'asset_depreciation_account_id': 'l10n_pg_153110', 'asset_expense_account_id': 'l10n_pg_609900'},
            'l10n_pg_154200': {'asset_depreciation_account_id': 'l10n_pg_154210', 'asset_expense_account_id': 'l10n_pg_610200'},
        }

    @template('pg', 'account.journal')
    def _get_pg_account_journal(self):
        return {
            'bank': {'default_account_id': 'l10n_pg_101200'},
            'cash': {
                'name': self.env._("Cash"),
                'type': 'cash',
                'default_account_id': 'l10n_pg_101100',
            },
        }
