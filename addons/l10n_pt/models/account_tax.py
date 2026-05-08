from odoo import api, models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    @api.model
    def _round_tax_details_tax_amounts(self, base_lines, company, mode='mixed'):
        # EXTENDS 'account'
        country_code = company.account_fiscal_country_id.code
        if country_code == 'PT':
            if base_lines and all(
                tax_data['price_include']
                for base_line in base_lines
                for tax_data in base_line['tax_details']['taxes_data']
            ):
                mode = 'included'
        super()._round_tax_details_tax_amounts(base_lines, company, mode=mode)

    @api.model
    def _round_tax_details_base_lines(self, base_lines, company, mode='mixed'):
        # EXTENDS 'account'
        country_code = company.account_fiscal_country_id.code
        if country_code == 'PT':
            if base_lines and all(
                tax_data['price_include']
                for base_line in base_lines
                for tax_data in base_line['tax_details']['taxes_data']
            ):
                mode = 'included'
        super()._round_tax_details_base_lines(base_lines, company, mode=mode)
