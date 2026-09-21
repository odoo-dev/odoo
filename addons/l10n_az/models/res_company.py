from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_az_simplified_tax_rate = fields.Float(
        string="Simplified Tax Rate (%)",
        default=2.0,
        help="Rate applied to the quarterly turnover on the Simplified Tax Report. Branches use the rate of their "
             "root company.",
    )
