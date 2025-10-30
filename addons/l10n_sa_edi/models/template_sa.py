# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template("sa", "account.tax")
    def _get_sa_account_tax(self):
        additional = self._parse_csv("sa", "account.tax", module="l10n_sa_edi")
        self._deref_account_tags('sa', additional)
        return additional
