# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import uuid

from odoo import api, models

_logger = logging.getLogger(__name__)


class RestaurantTable(models.Model):
    _inherit = "restaurant.table"

    def _rotate_identifier(self):
        """Rotate the table identifier so old QR links become invalid.

        Called after payment or table clearing when self_order_rotate_identifier is True.
        WARNING: This invalidates permanently printed QR codes.
        """
        for table in self:
            old_identifier = table.identifier
            table.identifier = uuid.uuid4().hex[:8]
            _logger.info(
                "Rotated table identifier for table %s: %s -> %s",
                table.display_name, old_identifier[:4] + '****', table.identifier[:4] + '****',
            )
