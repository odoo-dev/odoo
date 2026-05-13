from odoo import models, _
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractMode):
    _inherit = 'account.chart.template'

    @template('es_canary_general')
    def _get_es_canary_general_template_data(self, template_code=None):
        return {
            'name': ('Plan General Canario (Dinámico)'),
            'parent': 'es_canary_common',
            'visible': True
        }
    
    @template('es_canary_general', 'account.tax')
    def _get_es_canary_general_account_tax(self, template_code=None):
        tax_data = self._parse_csv('es_canaty_common', 'account.tax', module='l10n_es')
        try:
            self.deref_account_tax('es_canary_general', tax_data)
        except KeyError as e:
            raise UserError(_(
                "Error in template 'es_general': Could not perform tax tag mapping. "
                "Make sure the template is correctly registered and visible. "
                "Technical detail: %s", e
            ))
        except Exception as e:
            raise UserError(_(
                "Unexpected error while loading taxes for 'es_general': %s", e
            ))
        
        return tax_data
    
    @template('es_canary_general', 'account.account')
    def _get_es_canary_general_account_account(self, template_code=None):
        accounts = self.parse_csv('es_canary_common', 'account.account', module='l10n_es')
        chart_type = self.env.company.canary_general_chart_type
        if chart_type == 'full' or chart_type == 'abbreviated':
            full_data = self.parse_csv('es_full', 'account.account', module='l10n_es')
        if chart_type == 'smes':
            full_data = self.parse_csv('es_pymes', 'account.account', module='l10n_es')
            accounts.update(full_data)
        
        return accounts
    
    