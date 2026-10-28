# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models
from odoo.addons.account.models.chart_template import template

# Withholding taxes on salaries ("rendimientos del trabajo") that can take the partner's rate.
L10N_ES_IRPF_PARTNER_RATE_TAXES = (
    'account_tax_template_p_irpf21t',      # 15% Ret IRPF Trab
    'account_tax_template_p_irpf21te',     # 15% Ret IRPF Trab especie
    'account_tax_template_p_irpf21td',     # 15% Ret IRPF dinerario
    'account_tax_template_p_irpf21tdit',   # 15% Ret IRPF dinerario IT
)


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('es_common', 'account.tax')
    def _get_es_common_l10n_es_irpf_partner_account_tax(self):
        return {
            xmlid: {'l10n_es_irpf_partner_rate': True}
            for xmlid in L10N_ES_IRPF_PARTNER_RATE_TAXES
        }
