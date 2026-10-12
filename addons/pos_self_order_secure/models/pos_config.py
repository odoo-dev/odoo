# Part of Odoo. See LICENSE file for full copyright and licensing details.

import hashlib
import hmac
import logging
import time

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


class PosConfig(models.Model):
    _inherit = "pos.config"

    self_order_secure_session = fields.Boolean(
        "Secure Table Sessions",
        default=True,
        help=(
            "Enable HMAC-secured table sessions for mobile self-order with pay-after-meal. "
            "Requires both mobile mode and pay-after-meal to take effect."
        ),
    )
    self_order_session_timeout_minutes = fields.Integer(
        "Session Timeout (min)",
        default=10,
        help="After this many minutes from scanning the QR code, the session expires and the customer must scan the QR code again.",
    )
    self_order_session_version = fields.Integer(
        "Session Secret Version",
        default=1,
        help="Incremented to invalidate all active table tokens at once (e.g. on config change or POS session close).",
    )

    def _is_secure_table_session_enabled(self):
        self.ensure_one()
        return (
            self.self_order_secure_session
            and self.self_ordering_mode == 'mobile'
            and self.self_ordering_pay_after == 'meal'
        )

    # ---- HMAC Token Management ----

    def _get_table_session_secret(self):
        self.ensure_one()
        db_uuid = self.env['ir.config_parameter'].sudo().get_str('database.uuid', default='')
        return f"{self.id}:{self.access_token}:{self.self_order_session_version}:{db_uuid}".encode()

    def _generate_table_session_token(self, table_identifier):
        self.ensure_one()
        timeout_seconds = (self.self_order_session_timeout_minutes or 10) * 60
        expires_at = int(time.time()) + timeout_seconds
        message = f"{self.id}:{table_identifier}:{expires_at}".encode()
        secret = self._get_table_session_secret()
        signature = hmac.new(secret, message, hashlib.sha256).hexdigest()
        token = f"{expires_at}.{signature}"
        return token, expires_at

    def _verify_table_session_token(self, table_identifier, token):
        self.ensure_one()
        if not token or '.' not in token:
            return False
        try:
            expires_at_str, signature = token.split('.', 1)
            expires_at = int(expires_at_str)
        except Exception:
            return False

        message = f"{self.id}:{table_identifier}:{expires_at}".encode()
        secret = self._get_table_session_secret()
        expected_sig = hmac.new(secret, message, hashlib.sha256).hexdigest()

        if not hmac.compare_digest(signature, expected_sig):
            return False

        return not time.time() > expires_at

    @api.constrains('self_order_session_timeout_minutes')
    def _check_session_timeout_values(self):
        for rec in self:
            if rec.self_order_session_timeout_minutes <= 0:
                raise ValidationError(_("Session timeout must be greater than 0 minutes."))

    # ---- Invalidate tokens when secure mode is disabled or config changed ----
    def write(self, vals):
        res = super().write(vals)
        if any(f in vals for f in ('self_ordering_mode', 'self_ordering_pay_after', 'self_order_secure_session')):
            for rec in self:
                rec.sudo().self_order_session_version += 1
        return res

    @api.model
    def _load_pos_self_data_fields(self, pos_config_id):
        fields_list = super()._load_pos_self_data_fields(pos_config_id)
        fields_list.extend([
            'self_order_secure_session',
            'self_order_session_timeout_minutes',
        ])
        return fields_list

    def _get_self_order_route(self, table_id=None, order=None):
        route = super()._get_self_order_route(table_id=table_id, order=order)
        if self._is_secure_table_session_enabled() and table_id:
            route += "&qr=1"
        return route
