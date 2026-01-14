from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_sa_edi_pos_enabled = fields.Boolean(related='pos_config_id.l10n_sa_edi_pos_enabled', readonly=False)
