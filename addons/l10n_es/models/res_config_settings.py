from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_es_simplified_invoice_limit = fields.Float(
        related='company_id.l10n_es_simplified_invoice_limit',
        readonly=False,
    )

    canary_general_chart_type = fields.Selection(
        related = 'company_id.canary_general_chart_type',
        readonly = False
    )
