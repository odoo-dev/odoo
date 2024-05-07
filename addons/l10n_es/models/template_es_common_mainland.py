# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('es_common_mainland')
    def _get_es_common_mainland_template_data(self):
        return {
            'name': 'Common Mainland',
            'visible': 0,
            'parent': 'es_common',
        }

    @template('es_common_mainland', 'res.company')
    def _get_es_common_mainland_res_company(self):
        return {
            self.env.company.id: {
                'account_sale_tax_id': 'account_tax_template_s_iva21b',
                'account_purchase_tax_id': 'account_tax_template_p_iva21_bc',
            },
        }