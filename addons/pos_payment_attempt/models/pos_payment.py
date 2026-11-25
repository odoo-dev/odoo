# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models

from .pos_payment_attempt import FINAL_STATES


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    @api.model
    def _get_terminal_transaction_log_values(self, payment_method, request, response, **kwargs):
        """Hook for payment terminal modules: describe a terminal request as a log line.

        :param payment_method: the ``pos.payment.method`` that sent the request
        :param dict request: data sent to the provider
        :param dict response: data returned by the provider
        :return: dict with ``transaction_id`` and ``state``, optionally ``amount``, ``message``
                 and ``pos_order_id``; an empty dict logs nothing (the default).
        """
        return {}

    @api.model
    def _log_terminal_transaction(self, payment_method, request, response, **kwargs):
        values = self._get_terminal_transaction_log_values(payment_method, request, response, **kwargs)
        if not values.get('transaction_id'):
            return self.env['pos.payment.attempt']
        # sudo: POS users only read the log, the provider request writes it.
        Attempt = self.env['pos.payment.attempt'].sudo()
        attempt = Attempt.search([
            ('payment_method_id', '=', payment_method.id),
            ('transaction_id', '=', values['transaction_id']),
        ], limit=1)
        if not attempt:
            return Attempt.create({**values, 'payment_method_id': payment_method.id})
        # A final status only changes to success (e.g. an approval confirmed late).
        if attempt.state in FINAL_STATES and values.get('state') != 'success':
            values.pop('state', None)
        values = {key: value for key, value in values.items() if value and attempt[key] != value}
        if values:
            attempt.write(values)
        return attempt
