from odoo import api, models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    @api.model
    def _get_tax_rounding_policy(self, company, rounding_policy=None):
        policy = super()._get_tax_rounding_policy(company, rounding_policy=rounding_policy)
        if company.account_fiscal_country_id.code == 'PT':
            policy['authority'] = 'included'
        return policy
