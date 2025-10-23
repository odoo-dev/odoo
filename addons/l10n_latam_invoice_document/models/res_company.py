# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class ResCompany(models.Model):
    _inherit = "res.company"

    def _localization_use_documents(self):
        self.ensure_one()
        return self.env['account.chart.template']._localization_use_documents(self.chart_template)
