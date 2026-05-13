from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_es_simplified_invoice_limit = fields.Float(
        string="Simplified Invoice limit amount",
        help="Over this amount is not legally possible to create a simplified invoice",
        default=400,
    )

    canary_general_chart_type = fields.Selection(
        selection=[
            ('smes', 'PYMES'),
            ('full', 'Completo'),
            ('abbreviated', 'Abreviado')
        ],
        string="Accounting plan type",
        help="Select which accounting plan you wish to stablish"
    )

    def write(self, vals):
        res = super().write(vals)
        if 'canary_general_chart_type' in vals:
            for company in self:
                self.env['account.chart.template'].with_company(company)._l10n_es_canary_reload_and_clean_accounts(company)
        
        return res


