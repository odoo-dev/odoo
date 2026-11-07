# -*- coding: utf-8 -*-

from odoo import models


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    _l10n_nl__account_tag_25_optional = models.Ref('l10n_nl.account_tag_25', 'account.account.tag', required=False)

    def _post_load_data(self, template_code, company, template_data):
        super()._post_load_data(template_code, company, template_data)
        if template_code == 'nl':
            if cash_tag := self._l10n_nl__account_tag_25_optional:
                company.account_journal_suspense_account_id.tag_ids += cash_tag
                company.transfer_account_id.tag_ids += cash_tag
