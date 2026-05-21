from odoo import _, api, fields, models
from odoo.addons.l10n_es_edi_verifactu.const import (
    VERIFACTU_EXTRA_LABELS,
    VERIFACTU_REGIME_CODES_IGIC,
    VERIFACTU_REGIME_CODES_IVA,
)


class AccountTax(models.Model):
    _inherit = 'account.tax'

    l10n_es_applicability = fields.Selection(
        selection=[
            ('01', "VAT"),
            ('02', "IPSI"),
            ('03', "IGIC"),
        ],
        string="Applicability (Spain)",
    )

    @api.model
    def _l10n_es_regime_code_labels(self):
        labels = super()._l10n_es_regime_code_labels()
        labels.update(VERIFACTU_EXTRA_LABELS)
        return labels

    @api.model
    def _l10n_es_regime_available_codes(self, use, applicability=None, company=None):
        company = company or self.env.company
        # VeriFactu only applies to sale taxes; purchase taxes always fall back to the
        # generic catalog, even on a VeriFactu company.
        if company.l10n_es_edi_verifactu_required and use == 'sale':
            if applicability == '03':  # IGIC
                return VERIFACTU_REGIME_CODES_IGIC
            return VERIFACTU_REGIME_CODES_IVA  # IVA ('01'), IPSI ('02') and unset/"Other" default here
        return super()._l10n_es_regime_available_codes(use, applicability=applicability, company=company)

    @api.depends('company_id.l10n_es_edi_verifactu_required', 'l10n_es_applicability')
    def _compute_l10n_es_regime_available(self):
        super()._compute_l10n_es_regime_available()

    @api.depends('company_id.l10n_es_edi_verifactu_required')
    def _compute_l10n_es_regime_codes(self):
        super()._compute_l10n_es_regime_codes()

    def _l10n_es_regime_get_available_codes(self):
        self.ensure_one()
        use = self._l10n_es_regime_get_use()
        # Read this tax's own applicability directly (NOT via
        # _l10n_es_edi_verifactu_get_applicability(), which is designed to find the "main" tax
        # within a group and deliberately ignores 'recargo'-type taxes — exactly the taxes for
        # which the IGIC-specific '18_igic' matters here).
        return self._l10n_es_regime_available_codes(use, applicability=self.l10n_es_applicability, company=self.company_id)

    @api.model
    def _l10n_es_edi_verifactu_get_applicability_name_map(self):
        """Return dict: l10n_es_applicability -> human readable string
        """
        # When no applicability is selected it is '05' / "Other"
        applicability_string = dict(self.env['account.tax']._fields['l10n_es_applicability'].get_description(self.env)['selection'])
        return {
            '01': applicability_string['01'],
            '02': applicability_string['02'],
            '03': applicability_string['03'],
            '05': _("Other"),
        }

    def _l10n_es_edi_verifactu_get_applicability(self):
        """
        Return the Veri*Factu Tax Applicability for the "first" main tax in self.
        Fallback to '05' ("Other") if there is no main tax or the applicability is not set on the "first" one.
        Note: Currently we only support one Veri*Factu Tax Applicability for the whole invoice.
        """
        main_tax_types = self._l10n_es_get_main_tax_types()
        main_taxes = self.filtered(lambda tax: tax.l10n_es_type in main_tax_types)
        if not main_taxes:
            return '05'
        return main_taxes[0].l10n_es_applicability or '05'

    @api.model
    def _l10n_es_edi_verifactu_get_tax_details_functions(self, company):
        def base_line_filter(base_line):
            return any(t != 'ignore' for t in base_line['tax_ids'].flatten_taxes_hierarchy().mapped('l10n_es_type'))

        def total_grouping_function(base_line, tax_data):
            return (tax_data
                    and not tax_data['is_reverse_charge']
                    and tax_data['tax'].amount != -100.0
                    and tax_data['tax'].l10n_es_type not in ('ignore', 'retencion'))

        def tax_details_grouping_function(base_line, tax_data):
            if not total_grouping_function(base_line, tax_data):
                return None

            tax = tax_data['tax']
            l10n_es_exempt_reason = tax.l10n_es_exempt_reason if tax.l10n_es_type == 'exento' else False

            # Sujeto taxes with different recargo taxes are kept separate for the output
            # Note: In `_check_record_values` we assert that there is only a single (main tax, recargo tax) pair
            recargo_taxes = self.env['account.tax']
            if tax.l10n_es_type in self.env['account.tax']._l10n_es_get_sujeto_tax_types():
                recargo_taxes = base_line['tax_ids'].filtered(lambda t: t.l10n_es_type == 'recargo')

            grouping_key = {
                'amount': tax.amount,
                'recargo_taxes': recargo_taxes,
                'l10n_es_bien_inversion': tax.l10n_es_bien_inversion,
                'l10n_es_exempt_reason': l10n_es_exempt_reason,
                'l10n_es_type': tax.l10n_es_type,
                'l10n_es_applicability': tax._l10n_es_edi_verifactu_get_applicability(),
            }
            return grouping_key

        return {
            'base_line_filter': base_line_filter,
            'total_grouping_function': total_grouping_function,
            'tax_details_grouping_function': tax_details_grouping_function,
        }
