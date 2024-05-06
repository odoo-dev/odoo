# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('es_canary_assoc')
    def _get_es_canary_assoc_template_data(self):
        return {
            'name': 'PGCE entidades sin ánimo de lucro 2008 - Islas Canarias',
            'parent': 'es_canary_common',
        }

    @template('es_canary_assoc', 'res.company')
    def _get_es_canary_assoc_res_company(self):
        return {
            self.env.company.id: {
                'account_fiscal_country_id': 'base.es',
                'bank_account_code_prefix': '572',
                'cash_account_code_prefix': '570',
                'transfer_account_code_prefix': '572999',
            },
        }
