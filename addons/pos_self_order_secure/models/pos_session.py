# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import models

_logger = logging.getLogger(__name__)


class PosSession(models.Model):
    _inherit = "pos.session"

    def close_session_from_ui(self, payment_method_closing={}):
        """Invalidate all active table tokens when the POS session is closed."""
        for session in self:
            config = session.config_id
            if config._is_secure_table_session_enabled():
                config.sudo().self_order_session_version += 1
                _logger.info(
                    "Invalidated active table session tokens on POS session close for config %s",
                    config.name,
                )
        return super().close_session_from_ui(payment_method_closing)
