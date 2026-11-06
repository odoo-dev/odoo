# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models

EMPLOYEE_RATE_CONTEXT_KEY = 'l10n_es_irpf_employee_rate_override'


class AccountTax(models.Model):
    _inherit = 'account.tax'

    l10n_es_irpf_partner_rate = fields.Boolean(
        string="Use Employee IRPF Rate",
        help="When the journal item has an employee, use their IRPF withholding rate "
             "instead of the percentage of this tax.",
    )

    @api.model
    def _l10n_es_get_employee_irpf_rate(self, base_line, company):
        """ Return the personal IRPF rate (positive percentage) to apply on this base line,
        or None if the taxes of the base line must be computed as usual.

        Only base lines built from a journal item can have a personal rate: it is the rate
        stored on the journal item, copied from its employee.
        """
        taxes = base_line.get('tax_ids')
        if not taxes or company.account_fiscal_country_id.code != 'ES':
            return None
        if not (taxes | taxes.children_tax_ids).filtered('l10n_es_irpf_partner_rate'):
            return None

        record = base_line.get('record')
        if not isinstance(record, models.BaseModel) or record._name != 'account.move.line':
            return None
        return record.l10n_es_irpf_rate or None

    @api.model
    def _add_tax_details_in_base_line(self, base_line, company, rounding_method=None):
        # EXTENDS 'account'
        rate = self._l10n_es_get_employee_irpf_rate(base_line, company)
        if rate is None:
            return super()._add_tax_details_in_base_line(base_line, company, rounding_method=rounding_method)

        # The taxes are evaluated from 'base_line['tax_ids']', so the personal rate is given
        # through their context and read in '_eval_tax_amount_price_excluded'.
        original_taxes = base_line['tax_ids']
        base_line['tax_ids'] = original_taxes.with_context(**{EMPLOYEE_RATE_CONTEXT_KEY: rate})
        try:
            return super()._add_tax_details_in_base_line(base_line, company, rounding_method=rounding_method)
        finally:
            base_line['tax_ids'] = original_taxes

    def _eval_tax_amount_price_excluded(self, batch, raw_base, evaluation_context):
        # EXTENDS 'account'
        # Only the price excluded evaluation is extended: journal entries are always computed with
        # special_mode='total_excluded' and withholding taxes are never price included.
        rate = self.env.context.get(EMPLOYEE_RATE_CONTEXT_KEY)
        if rate is not None and self.l10n_es_irpf_partner_rate and self.amount_type == 'percent':
            self.ensure_one()
            return raw_base * -rate / 100.0
        return super()._eval_tax_amount_price_excluded(batch, raw_base, evaluation_context)