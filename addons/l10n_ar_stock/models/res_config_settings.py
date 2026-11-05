from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_ar_arba_cit = fields.Char(related='company_id.l10n_ar_arba_cit', readonly=False)
    l10n_ar_arba_cot_environment = fields.Selection(related='company_id.l10n_ar_arba_cot_environment', readonly=False)
