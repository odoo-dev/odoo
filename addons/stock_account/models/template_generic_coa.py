from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = "account.chart.template"

    @template('generic_coa', 'res.company')
    def _get_generic_coa_res_company(self):
        res = super()._get_generic_coa_res_company()
        res[self.env.company.id].update({
            'account_stock_journal_id': 'inventory_valuation',
            'account_stock_valuation_id': 'stock_valuation',
            'account_stock_variation_id': 'expense',
            'account_cogs_id': 'cost_of_goods_sold',
            'account_production_wip_account_id': 'wip',
            'account_production_wip_overhead_account_id': 'cost_of_production',
        })
        return res
