# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_jp_timestamp_enabled = fields.Boolean(
        string='Scanned Document Timestamping',
        config_parameter='l10n_jp_account_timestamp.timestamp_enabled',
        groups='base.group_system',
    )
    l10n_jp_timestamp_mode = fields.Selection(
        selection=[('test', 'Test'), ('production', 'Production')],
        string='Timestamp Mode',
        default='test',
        required=True,
        config_parameter='l10n_jp_account_timestamp.timestamp_mode',
        groups='base.group_system',
    )
