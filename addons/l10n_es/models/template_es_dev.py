from odoo import models, _
from odoo.addons.account.models.chart_template import template

class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('es_dev')
    def _get_es_dev_template_data(self):
        return {
            'name': _('Developer 2026'),
            'parent': 'es_common',
        }




# Hablar de pq tiene que estar en este módulo