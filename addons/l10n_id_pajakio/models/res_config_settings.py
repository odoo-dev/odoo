from odoo import fields, models


class ResConfig(models.TransientModel):
    _inherit = "res.config.settings"

    l10n_id_pajakio_api_key = fields.Char(related="company_id.l10n_id_pajakio_api_key", readonly=False)
