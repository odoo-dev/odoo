# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from odoo import http, _
from odoo.http import request
from odoo.exceptions import UserError
from odoo.addons.pos_self_order.controllers.orders import PosSelfOrderController

_logger = logging.getLogger(__name__)


class PosSelfOrderControllerSecure(PosSelfOrderController):

    @http.route(
        "/pos-self-order/process-order/<device_type>/",
        auth="public", type="jsonrpc", website=True,
    )
    def process_order(self, order, access_token, table_identifier, device_type, table_session_token=None, **kwargs):
        """Block orders if HMAC table session token is missing, tampered, or expired."""
        pos_config, table = self._verify_authorization(access_token, table_identifier, order)

        preset = False
        if pos_config.use_presets and order and order.get('preset_id'):
            preset = request.env['pos.preset'].sudo().browse(order.get('preset_id'))

        if pos_config.use_presets and preset:
            is_dine_in = preset.service_at == 'table'
        else:
            is_dine_in = pos_config.self_ordering_service_mode == 'table'

        if pos_config._is_secure_table_session_enabled() and table and is_dine_in:
            if table.parent_id:
                table = table.parent_id

            token = table_session_token or (order and order.get('table_session_token'))
            if not token or not pos_config._verify_table_session_token(table.identifier, token):
                _logger.warning(
                    "Order blocked for table %s: invalid or expired HMAC table session token",
                    table.display_name,
                )
                raise UserError(
                    _("Your session has expired. Please scan the QR code again to continue ordering.")
                )

        if order and isinstance(order, dict) and 'table_session_token' in order:
            order.pop('table_session_token', None)

        return super().process_order(order, access_token, table_identifier, device_type)
