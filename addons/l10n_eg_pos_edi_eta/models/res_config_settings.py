from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    pos_l10n_eg_pos_serial = fields.Char(
        string="POS Serial",
        related='pos_config_id.l10n_eg_pos_serial',
        readonly=False
    )
    pos_l10n_eg_pos_version = fields.Char(
        string="POS Version",
        related='pos_config_id.l10n_eg_pos_version',
        readonly=False
    )
    pos_l10n_eg_pos_client_id = fields.Char(
        string="POS Client ID",
        related='pos_config_id.l10n_eg_pos_client_id',
        readonly=False
    )
    pos_l10n_eg_pos_client_secret = fields.Char(
        string="POS Client Secret",
        related='pos_config_id.l10n_eg_pos_client_secret',
        readonly=False
    )
    pos_l10n_eg_pos_model_framework = fields.Char(
        string="POS Model Framework",
        related='pos_config_id.l10n_eg_pos_model_framework',
        readonly=False
    )
    pos_l10n_eg_pos_client_authenticated = fields.Boolean(
        related='pos_config_id.l10n_eg_pos_client_authenticated',
        readonly=False
    )

    def l10n_eg_pos_action_authenticate_device(self):
        return self.pos_config_id.l10n_eg_pos_action_authenticate_device()
