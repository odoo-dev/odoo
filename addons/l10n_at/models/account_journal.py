# -*- coding: utf-8 -*-

from odoo import api, models, Command


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    _l10n_at__account_tag_external_code_2300 = models.Ref('l10n_at.account_tag_external_code_2300', 'account.account.tag')
    _l10n_at__account_tag_l10n_at_ABIV = models.Ref('l10n_at.account_tag_l10n_at_ABIV', 'account.account.tag')

    @api.model
    def _prepare_liquidity_account_vals(self, company, code, vals):
        ''' Set Balance Sheet and SAF-T tags on new bank and cash accounts.'''
        # OVERRIDE
        account_vals = super()._prepare_liquidity_account_vals(company, code, vals)

        if company.account_fiscal_country_id.code == 'AT':
            account_vals.setdefault('tag_ids', [])
            account_vals['tag_ids'] += [
                Command.link(self._l10n_at__account_tag_l10n_at_ABIV.id),
                Command.link(self._l10n_at__account_tag_external_code_2300.id),
            ]

        return account_vals
