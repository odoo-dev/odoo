# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    pos_self_order_secure_session = fields.Boolean(
        related="pos_config_id.self_order_secure_session",
        readonly=False,
    )
    pos_self_order_session_timeout_minutes = fields.Integer(
        related="pos_config_id.self_order_session_timeout_minutes",
        readonly=False,
        string="Session Timeout (minutes)",
    )
