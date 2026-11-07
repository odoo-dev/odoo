# -*- coding: utf-8 -*-

from odoo import api, models


class AccountJournal(models.Model):
    _inherit = "account.journal"

    _l10n_de__tag_de_asset_bs_B_IV = models.Ref('l10n_de.tag_de_asset_bs_B_IV', 'account.account.tag')

    @api.model
    def _prepare_liquidity_account_vals(self, company, code, vals):
        res = super()._prepare_liquidity_account_vals(company, code, vals)

        if company.account_fiscal_country_id.code == 'DE':
            tag_ids = res.get('tag_ids', [])
            tag_ids.append((4, self._l10n_de__tag_de_asset_bs_B_IV.id))
            res['tag_ids'] = tag_ids

        return res
