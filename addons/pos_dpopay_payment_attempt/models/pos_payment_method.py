# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import models

_logger = logging.getLogger(__name__)


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    def send_dpopay_request(self, data, endpoint):
        # Odoo-only keys, DPO Pay must not receive them.
        order_uuid = data.pop('orderUuid', None)
        cancel_reason = data.pop('cancelReason', None)
        response = super().send_dpopay_request(data, endpoint)
        try:
            with self.env.cr.savepoint():
                self.env['pos.payment']._log_terminal_transaction(
                    self, data, response, endpoint=endpoint, order_uuid=order_uuid, cancel_reason=cancel_reason)
        except Exception:
            # The payment must go on even if the log line can't be written.
            _logger.exception("Could not log DPO Pay transaction %s (%s)", data.get('sourceId'), endpoint)
        return response
