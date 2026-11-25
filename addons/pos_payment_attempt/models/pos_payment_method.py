# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import models

from .pos_payment_attempt import FINAL_STATES

_logger = logging.getLogger(__name__)


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    def _log_terminal_transaction(self, transaction_id, state, *, amount=None, message=None, order_uuid=None):
        super()._log_terminal_transaction(transaction_id, state, amount=amount, message=message, order_uuid=order_uuid)
        if not transaction_id:
            return
        try:
            with self.env.cr.savepoint():
                self._upsert_terminal_transaction(transaction_id, state, amount, message, order_uuid)
        except Exception:
            # The payment must go on even if the log line can't be written.
            _logger.exception("Could not log terminal transaction %s (%s)", transaction_id, state)

    def _upsert_terminal_transaction(self, transaction_id, state, amount, message, order_uuid):
        # sudo: POS users only read the log; the terminal request writes it.
        Attempt = self.env['pos.payment.attempt'].sudo()
        values = {'state': state, 'amount': amount, 'message': message}
        if order_uuid:
            values['pos_order_id'] = self.env['pos.order'].sudo().search([('uuid', '=', order_uuid)], limit=1).id
        attempt = Attempt.search([('payment_method_id', '=', self.id), ('transaction_id', '=', transaction_id)], limit=1)
        if not attempt:
            return Attempt.create({
                **{key: value for key, value in values.items() if value},
                'transaction_id': transaction_id,
                'payment_method_id': self.id,
            })
        # A final status only changes to success (e.g. an approval confirmed late).
        if attempt.state in FINAL_STATES and state != 'success':
            values.pop('state')
        values = {key: value for key, value in values.items() if value and attempt[key] != value}
        if values:
            attempt.write(values)
        return attempt
