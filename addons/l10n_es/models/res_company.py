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
        ]
        string="Accounting plan type",
        default='smes',
        help="Select which accounting plan you wish to stablish"
    )


