# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from odoo import http
from odoo.http import request
from odoo.tools import consteq

_logger = logging.getLogger(__name__)


class PosSelfKioskSecure(http.Controller):

    # ---- Generate HMAC token on QR scan ----
    @http.route("/pos-self/session/create", type='jsonrpc', auth='public', website=True)
    def create_table_session(self, config_id=None, table_identifier=None, access_token=None):
        """Generate a stateless HMAC-signed table session token on QR scan."""
        if not config_id or not str(config_id).isnumeric() or not table_identifier:
            return {'status': 'error', 'message': 'Missing parameters'}

        pos_config = request.env["pos.config"].sudo().browse(int(config_id))
        if not pos_config.exists() or not pos_config._is_secure_table_session_enabled():
            return {'status': 'disabled'}

        if not access_token or not pos_config.access_token or not consteq(pos_config.access_token, access_token):
            return {'status': 'error', 'message': 'Invalid access token'}

        table = request.env["restaurant.table"].sudo().search(
            [("identifier", "=", table_identifier), ("active", "=", True)], limit=1
        )
        if not table:
            return {'status': 'error', 'message': 'Table not found'}
        if table.parent_id:
            table = table.parent_id

        if pos_config.floor_ids and table.floor_id not in pos_config.floor_ids:
            return {'status': 'error', 'message': 'Table does not belong to this POS'}

        token, expires_at = pos_config._generate_table_session_token(table.identifier)
        _logger.info(
            "QR scan: generated secure table session token for table %s (config %s, expires at %s)",
            table.display_name, pos_config.name, expires_at,
        )
        return {
            'status': 'open',
            'token': token,
            'timeout_minutes': pos_config.self_order_session_timeout_minutes,
            'expires_at_ms': expires_at * 1000,
        }
