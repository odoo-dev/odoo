# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, models
from odoo.tools import SQL, Query


class AccountAccount(models.Model):
    _inherit = 'account.account'

    @api.depends('code')
    def _compute_is_allocation_account(self):
        # Overwrite account
        super()._compute_is_allocation_account()
        for account in self.filtered(lambda a: 'BE' in a.company_ids.mapped('country_code')):
            account.is_allocation_account = account.code.startswith('69') or account.code.startswith('79')

    def _field_to_sql(self, alias, field_expr: str, query: (Query | None) = None) -> SQL:
        if field_expr == 'is_allocation_account':
            if self.env.company.root_id.country_code == 'BE':
                return SQL(
                    "%(code)s ILIKE ANY(ARRAY[%(allocation_pattern)s, %(withdrawal_pattern)s])",
                    code=self._field_to_sql(alias, 'code', query),
                    allocation_pattern=r'69%',
                    withdrawal_pattern=r'79%',
                )
        return super()._field_to_sql(alias, field_expr, query)
