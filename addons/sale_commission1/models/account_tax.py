from odoo import fields, models, api


class AccountTax(models.Model):
    _inherit = 'account.tax'

    @api.model
    def _add_tax_details_in_base_line(self, base_line, company, rounding_method=None):
        super()._add_tax_details_in_base_line(base_line, company, rounding_method)
        my_commissions = base_line.get('my_commissions', 0.0)
        if 'tax_details' in base_line:
            base_line['tax_details']['raw_total_excluded_currency'] += my_commissions
