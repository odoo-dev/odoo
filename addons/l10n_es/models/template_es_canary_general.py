from odoo import models, _
from odoo.addons.account.models.chart_template import template
from odoo.exceptions import UserError


class AccountChartTemplate(models.AbstractModel):
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
        tax_data = self._parse_csv('es_canary_common', 'account.tax', module='l10n_es')
        try:
            self._deref_account_tags('es_canary_general', tax_data)
        except KeyError as e:
            raise UserError(_(
                "Error in template 'es_canary_general': Could not perform tax tag mapping. "
                "Make sure the template is correctly registered and visible. "
                "Technical detail: %s", e
            ))
        except Exception as e:
            raise UserError(_(
                "Unexpected error while loading taxes for 'es_canary_general': %s", e
            ))
        
        return tax_data
    
    @template('es_canary_general', 'account.account')
    def _get_es_canary_general_account_account(self, template_code=None):
        accounts = self._parse_csv('es_canary_common', 'account.account', module='l10n_es')
        chart_type = self.env.company.canary_general_chart_type
        if chart_type in ('full', 'abbreviated'):
            full_data = self._parse_csv('es_full', 'account.account', module='l10n_es')
            for data in full_data.values():
                if 'tax_ids' in data:
                    del data['tax_ids']
            accounts.update(full_data)
        if chart_type == 'smes':
            smes_data = self._parse_csv('es_pymes', 'account.account', module='l10n_es')
            for data in smes_data.values():
                if 'tax_ids' in data:
                    del data['tax_ids']
            accounts.update(smes_data)
        
        return accounts
    
    def _l10n_es_canary_manage_dynamic_accounts(self, company):
        chart_type = company.canary_general_chart_type
        code_digits = 0

        full_data = self._parse_csv('es_full', 'account.account', module='l10n_es')
        full_codes = {vals['code'].ljust(code_digits, '0') for vals in full_data.values() if 'code' in vals}

        smes_data = self._parse_csv('es_pymes', 'account.account', module='l10n_es')
        smes_codes = {vals['code'].ljust(code_digits, '0') for vals in smes_data.values() if 'code' in vals}

        only_full_accounts = list(full_codes - smes_codes)
        only_smes_accounts = list(smes_codes - full_codes)

        to_archive_accounts = self.env['account.account']
        to_activate_accounts = self.env['account.account']

        if chart_type in ('full', 'abbreviated'):
            to_activate_accounts = self.env['account.account'].with_context(active_test=False).search(
                [('code', 'in', only_full_accounts),
                ('company_ids', 'in', company.id)]
            )
            to_archive_accounts = self.env['account.account'].with_context(active_test=False).search(
                [('code', 'in', only_smes_accounts),
                ('company_ids', 'in', company.id)]
            )
        
        if chart_type == 'smes':
            to_activate_accounts = self.env['account.account'].with_context(active_test=False).search(
                [('code', 'in', only_smes_accounts),
                ('company_ids', 'in', company.id)]
            )
            to_archive_accounts = self.env['account.account'].with_context(active_test=False).search(
                [('code', 'in', only_full_accounts),
                ('company_ids', 'in', company.id)]
            )
        
        if to_activate_accounts:
            to_activate_accounts.write({'active': True})     

        if to_archive_accounts:
            to_archive_accounts.write({'active': False})
    
    def _l10n_es_canary_reload_and_clean_accounts(self, company):
        self.try_loading('es_canary_general', company=company)
        self._l10n_es_canary_manage_dynamic_accounts(company)