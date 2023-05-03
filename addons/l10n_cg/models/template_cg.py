# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('cg')
    def _get_cg_template_data(self):
        return {
            'name': 'Syscohada Chart of Accounts for Congo',
            'parent': 'syscohada',
            'code_digits': '6',
        }

    @template('cg', 'res.company')
    def _get_cg_res_company(self):
        company_values = super()._get_syscohada_res_company()
        company_values[self.env.company.id].update(
            {
                'account_fiscal_country_id': 'base.cg',
                'account_sale_tax_id': 'tva_sale_18_9',
                'account_purchase_tax_id': 'tva_purchase_18_9',
            }
        )
        return company_values
