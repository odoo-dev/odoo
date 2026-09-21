from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_az_simplified_tax_rate = fields.Float(related='company_id.l10n_az_simplified_tax_rate', readonly=False)
