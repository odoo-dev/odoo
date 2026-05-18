# Part of Odoo. See LICENSE file for full copyright and licensing details.

import pprint

from werkzeug.exceptions import Forbidden

from odoo.http import Controller, request, route

from odoo.addons.payment_payu import const as payu_consts
from odoo.addons.payment_payu import utils as payu_utils
from odoo.addons.payment.logging import get_payment_logger

_logger = get_payment_logger(__name__)


class PayUController(Controller):

    RETURN_URL = '/payment/payu/return'
    WEBHOOK_URL = '/payment/payu/webhook'

    @route(RETURN_URL, type='http', auth='public', methods=['GET'])
    def payu_return_from_checkout(self, **payload):
        """Handle PayU redirect after checkout completion.

        After the user completes a payment on PayU's hosted page, they are redirected
        back to this endpoint. This route does **not** process the transaction because
        PayU sends the authoritative transaction details to the webhook endpoint.
        It simply acknowledges the redirect and forwards the user to the payment status page.

        :param dict payload: The query parameters received from PayU upon redirection,
                        usually containing `txnid`, `status`, and other fields.
        :return: A redirection response to the payment status page.
        :rtype: werkzeug.wrappers.Response
        """
        _logger.info('PayU return redirect received with payload:\n%s', pprint.pformat(payload))
        # No processing needed — main payload is received via the webhook
        return request.redirect('/payment/status')

    @route(WEBHOOK_URL, type='http', auth='public', methods=['POST'], csrf=False)
    def payu_webhook(self, **payload):
        """Process a PayU webhook notification and update the corresponding payment transaction.

        PayU sends asynchronous notifications (payment success, failure, or refund) to this
        webhook endpoint. The notification is verified, matched to an existing transaction,
        and processed accordingly.

        :param dict payload: The payment notification payload received from PayU.
                            It typically includes fields such as `mihpayid`, `status`,
                            `udf1`, and signature-related parameters.
        :return: An empty JSON response acknowledging receipt of the webhook.
        :rtype: str
        :raise ValidationError: If the signature verification or transaction processing fails.
        """
        if request.httprequest.content_type == 'application/json':
            payload = request.httprequest.get_json(silent=True)

        _logger.info('Notification received from PayU with payload:\n%s', pprint.pformat(payload))

        # Identify the event type: payment or refund
        event_type = 'refund' if 'action' in payload and payload.get('action').strip() == 'refund' else 'payment'
        if not event_type:
            _logger.warning('Missing event type in PayU payload.')
            return request.make_json_response('')
        # Find the corresponding payment transaction
        tx_sudo = request.env['payment.transaction'].sudo()._search_by_reference('payu', payload)
        if not tx_sudo:
            _logger.warning('No matching PayU transaction found for payload: %s', payload.get('mihpayid'))
            return request.make_json_response('')

        # Verify payload signature before processing
        try:
            PayUController._verify_signature(payload, tx_sudo)
        except Exception:
            _logger.exception('PayU signature verification failed')
            return request.make_json_response('')

        # Process the verified transaction
        try:
            tx_sudo._process('payu', payload)
            _logger.info('PayU transaction processed successfully (Ref: %s)', tx_sudo.reference)
        except Exception:
            _logger.exception('Failed to process PayU transaction')
            return request.make_json_response('')

        # Always return empty string as acknowledgment
        return request.make_json_response('')

    @staticmethod
    def _verify_signature(payment_data, tx_sudo):
        """Verify the PayU callback payload using merchant credentials.

        This method validates the authenticity of a PayU webhook or callback by comparing
        the received `hash` with a newly computed SHA-512 hash. The hash is generated using
        the merchant's key and salt obtained from the related `payment.transaction` record
        and follows PayU's predefined hash sequence for webhook events.

        :param dict payment_data: The payload data received from PayU, containing fields such as
                                `status`, `txnid`, `amount`, and the received `hash`.
        :param recordset tx_sudo: The related `payment.transaction` record (in sudo mode),
                                used to access the merchant's `payu_merchant_key` and `payu_merchant_salt`.
        :return: True if the computed hash matches the received one.
        :rtype: bool
        :raise werkzeug.exceptions.Forbidden: If the hash verification fails (mismatch detected).
        """
        if 'action' in payment_data and payment_data.get('action').strip() == 'refund':
            if tx_sudo.provider_id.payu_merchant_key == payment_data.get('key').strip():
                return True
            raise Forbidden()

        received_hash = (payment_data.get('hash') or '').strip()
        payment_data['salt'] = tx_sudo.provider_id.payu_merchant_salt
        payment_data['key'] = tx_sudo.provider_id.payu_merchant_key

        computed_hash = payu_utils.generate_payu_hash(payment_data, payu_consts.PAYU_HASH_SEQUENCE.get('PAYMENT_WEBHOOK'))

        if computed_hash == received_hash:
            _logger.debug('PayU signature verified successfully for txnid=%s', payment_data.get('txnid'))
            return True

        _logger.warning(
            'PayU signature verification failed. Received: %s, Computed: %s\npayload: %s',
            received_hash, computed_hash, pprint.pformat(payment_data),
        )
        raise Forbidden()
