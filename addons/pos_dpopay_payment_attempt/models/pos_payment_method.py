# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import _, models

_logger = logging.getLogger(__name__)

TRANSACTION_NOT_FOUND = 'Transaction not found'


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    def send_dpopay_request(self, data, endpoint):
        # Keys only meant for Odoo; DPO Pay must not receive them.
        attempt_uuid = data.pop('attemptUuid', None)
        cancel_reason = data.pop('cancelReason', None)
        response = super().send_dpopay_request(data, endpoint)
        if data.get('sourceId'):
            try:
                with self.env.cr.savepoint():
                    self._dpopay_log_attempt(attempt_uuid, data, endpoint, response, cancel_reason)
            except Exception:
                # The payment must go on even if the attempt can't be recorded.
                _logger.exception("Could not log DPO Pay attempt %s (%s)", data.get('sourceId'), endpoint)
        return response

    def _dpopay_amount_from_minor_units(self, amount):
        currency = self.journal_id.currency_id or self.company_id.currency_id
        try:
            return int(amount) / (10 ** currency.decimal_places)
        except (TypeError, ValueError):
            return 0.0

    def _dpopay_attempt_values_from_result(self, result):
        pan = (result.get('panMasked') or '').replace(' ', '')
        return {
            'name': result.get('sourceid') or result.get('sourceId'),
            'card_no': pan[-4:] if pan else None,
            'card_brand': result.get('cardType') or (result.get('dataMap') or {}).get('Source'),
            'authcode': result.get('authCode'),
        }

    def _dpopay_attempt_state_from_status(self, response):
        """Map a ``get-status`` response to an attempt state and message (state is None when unchanged)."""
        if response.get('errorMessage'):
            if response['errorMessage'] == TRANSACTION_NOT_FOUND:
                return 'failed', _("The terminal has no transaction with this reference.")
            return None, None
        description = response.get('resultCodeDescription') or response.get('displayText')
        if response.get('declined'):
            return 'failed', description or _("Payment declined.")
        if response.get('offline'):
            return 'failed', _("The terminal is offline.")
        if response.get('complete'):
            if not response.get('success'):
                return 'failed', description or _("Payment unsuccessful.")
            # Approved; the attempt becomes a success with the transaction result.
            return None, None
        return 'processing', None

    def _dpopay_log_attempt(self, attempt_uuid, data, endpoint, response, cancel_reason=None):
        self.ensure_one()
        response = response if isinstance(response, dict) else {}
        error = response.get('errorMessage')
        values = {'name': data['sourceId']}
        state = message = None
        skip_if_unchanged = False

        if endpoint == 'start-transaction':
            values['amount'] = self._dpopay_amount_from_minor_units(data.get('amount'))
            if error:
                state, values['error_message'] = 'failed', error
            else:
                state, message = 'processing', _("Transaction sent to the terminal.")
        elif endpoint == 'get-status':
            state, message = self._dpopay_attempt_state_from_status(response)
            if state == 'failed':
                values['error_message'] = message
            skip_if_unchanged = True
        elif endpoint == 'get-result':
            if response.get('success') and not error:
                state, message = 'success', response.get('resultCodeDescription') or _("Payment approved.")
                values.update(self._dpopay_attempt_values_from_result(response))
            else:
                message = _("Could not fetch the transaction result: %s", error or response.get('resultCodeDescription'))
        elif endpoint == 'cancel-transaction':
            if response.get('responseCode'):
                state = 'timeout' if cancel_reason == 'timeout' else 'cancelled'
                message = _("No answer from the customer in time, transaction cancelled.") if state == 'timeout' \
                    else _("Transaction cancelled on the terminal.")
            else:
                message = _("The terminal refused to cancel: %s", error or _("unknown reason"))

        self.env['pos.payment.attempt']._upsert(
            attempt_uuid, self,
            state=state,
            source='server',
            message=message,
            payload={'endpoint': endpoint, 'response': response},
            values=values,
            skip_if_unchanged=skip_if_unchanged,
        )

    def _payment_attempt_check_status(self, attempt):
        if self.payment_provider != 'dpopay':
            return super()._payment_attempt_check_status(attempt)
        self.ensure_one()
        data = {'sourceId': attempt.name}
        status = self._execute_dpopay_api_request(dict(data), 'get-status')
        payload = {'endpoint': 'get-status', 'response': status}
        if status.get('complete') and status.get('success') and not status.get('errorMessage'):
            result = self._execute_dpopay_api_request(dict(data), 'get-result')
            if result.get('success') and not result.get('errorMessage'):
                return attempt._log_event(
                    state='success', source='server',
                    message=result.get('resultCodeDescription') or _("Payment approved."),
                    payload={'endpoint': 'get-result', 'response': result},
                    values=self._dpopay_attempt_values_from_result(result),
                )
            return attempt._log_event(source='server', payload=payload,
                message=_("Approved on the terminal, but the result could not be fetched: %s", result.get('errorMessage')))

        state, message = self._dpopay_attempt_state_from_status(status)
        if status.get('errorMessage') and not state:
            message = _("Status check failed: %s", status['errorMessage'])
        return attempt._log_event(
            state=state, source='server', payload=payload,
            message=message or _("Still waiting for the customer on the terminal."),
            values={'error_message': message} if state == 'failed' else None,
        )
