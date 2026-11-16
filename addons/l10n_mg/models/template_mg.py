from odoo import models

from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = "account.chart.template"

    @template("mg")
    def _get_mg_template_data(self):
        return {
            "code_digits": "6",
        }

    @template("mg", "res.company")
    def _get_mg_res_company(self):
        return {
            self.env.company.id: {
                "account_fiscal_country_id": "base.mg",
                "bank_account_code_prefix": "512",
                "cash_account_code_prefix": "530",
                "transfer_account_code_prefix": "581",
                "income_account_id": "mg_account_707",
                "expense_account_id": "mg_account_607",
                "receivable_account_id": "mg_account_411",
                "payable_account_id": "mg_account_401",
                "account_default_pos_receivable_account_id": "mg_account_4111",
                "income_currency_exchange_account_id": "mg_account_766",
                "expense_currency_exchange_account_id": "mg_account_666",
                "account_journal_early_pay_discount_gain_account_id": "mg_account_609",
                "account_journal_early_pay_discount_loss_account_id": "mg_account_709",
                "default_cash_difference_income_account_id": "mg_account_758",
                "default_cash_difference_expense_account_id": "mg_account_658",
                "deferred_expense_account_id": "mg_account_486",
                "deferred_revenue_account_id": "mg_account_487",
                "account_stock_valuation_id": "mg_account_37",
                "account_sale_tax_id": "mg_tax_sale_20",
                "account_purchase_tax_id": "mg_tax_purchase_20",
            },
        }
