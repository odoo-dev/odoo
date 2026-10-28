from odoo import api, fields, models
PARTNER_RATE_CONTEXT_KEY = 'l10n_es_irpf_partner_rate_override'


class AccountTax(models.Model):
    _inherit = 'account.tax'

    l10n_es_irpf_partner_rate = fields.Boolean(
        string="Use Partner IRPF Rate",
        help="When the partner of the journal item has an IRPF withholding rate, "
             "use it instead of the percentage of this tax.",
    )

    @api.model
    def _l10n_es_get_partner_irpf_rate(self, base_line, company):
        taxes = base_line.get('tax_ids')
        if not taxes or company.account_fiscal_country_id.code != 'ES':
            return None
        if not (taxes | taxes.children_tax_ids).filtered('l10n_es_irpf_partner_rate'):
            return None
 
        record = base_line.get('record')
        if isinstance(record, models.BaseModel) and record._name == 'account.move.line':
            rate = record.l10n_es_irpf_rate
        else:
            partner = base_line.get('partner_id')
            rate = partner.sudo().with_company(company).l10n_es_irpf_rate if partner else 0.0
        return rate or None
 
    @api.model
    def _add_tax_details_in_base_line(self, base_line, company, rounding_method=None):
        rate = self._l10n_es_get_partner_irpf_rate(base_line, company)
        if rate is None:
            return super()._add_tax_details_in_base_line(base_line, company, rounding_method=rounding_method)
        original_taxes = base_line['tax_ids']
        base_line['tax_ids'] = original_taxes.with_context(**{PARTNER_RATE_CONTEXT_KEY: rate})
        try:
            return super()._add_tax_details_in_base_line(base_line, company, rounding_method=rounding_method)
        finally:
            base_line['tax_ids'] = original_taxes
 
    def _eval_tax_amount_price_excluded(self, batch, raw_base, evaluation_context):
        rate = self.env.context.get(PARTNER_RATE_CONTEXT_KEY)
        if rate is not None and self.l10n_es_irpf_partner_rate and self.amount_type == 'percent':
            self.ensure_one()
            return raw_base * -rate / 100.0
        return super()._eval_tax_amount_price_excluded(batch, raw_base, evaluation_context)
