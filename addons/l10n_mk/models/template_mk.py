# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, Command
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('mk')
    def _get_mk_template_data(self):
        return {
            # 'property_account_receivable_id': 'lu_2011_account_4011',
            # 'property_account_payable_id': 'lu_2011_account_44111',
            # 'property_stock_valuation_account_id': 'lu_2020_account_60761',
            'code_digits': '3',
        }