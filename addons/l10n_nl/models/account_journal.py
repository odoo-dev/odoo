# -*- coding: utf-8 -*-

from odoo import api, fields, models, _


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    _l10n_nl__account_tag_25 = models.Ref('l10n_nl.account_tag_25', 'account.account.tag')

    @api.model
    def _prepare_liquidity_account_vals(self, company, code, vals):
        # OVERRIDE
        account_vals = super()._prepare_liquidity_account_vals(company, code, vals)

        if company.account_fiscal_country_id.code == 'NL':
            # Ensure the newly liquidity accounts have the right account tag in order to be part
            # of the Dutch financial reports.
            account_vals.setdefault('tag_ids', [])
            account_vals['tag_ids'].append((4, self._l10n_nl__account_tag_25.id))

        return account_vals
