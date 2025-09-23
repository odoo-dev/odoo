# Part of Odoo. See LICENSE file for full copyright and licensing details.

import pprint
import json

from werkzeug.exceptions import Forbidden

from odoo.http import Controller, request, route

from odoo.addons.payment.logging import get_payment_logger
from odoo.addons.payment_easebuzz import utils as easebuzz_utils, const as easebuzz_const

_logger = get_payment_logger(__name__)


class EasebuzzController(Controller):

    RETURN_URL = "/payment/easebuzz/return"
    WEBHOOK_URL = '/payment/easebuzz/webhook'

    @route(RETURN_URL, type='http', auth='public', methods=['GET'])
    def easebuzz_return_from_checkout(self, **data):
        """ Process the notification data sent by Easebuzz after redirection.

        :param dict data: The notification data.
        """

        _logger.info("Notification received from Easebuzz with data:\n%s", pprint.pformat(data))
        # Don't process the notification data as they contain no valuable information
        return request.redirect('/payment/status')

    @route(WEBHOOK_URL, type='http', auth='public', methods=['POST'], csrf=False)
    def easebuzz_webhook(self, **data):
        """ Process the notification data sent by Easebuzz to the webhook.

        :return: An empty string to acknowledge the notification.
        :rtype: str
        """

        _logger.info("Notification received from Easebuzz with data:\n%s", pprint.pformat(data))
        webhook_type = 'refund' if 'data' in data else 'payment'
        payload = data if webhook_type == 'payment' else json.loads(data['data'])
        payload.update(webhook_type=webhook_type)

        # Validate request is from Easebuzz
        tx_sudo = request.env['payment.transaction'].sudo()._search_by_reference(
            'easebuzz', payload
        )
        hash_sequence_key = 'PAYMENT_WEBHOOK' if webhook_type == 'payment' else 'REFUND_WEBHOOK'
        self._easebuzz_verify_webhook(
            payload,
            easebuzz_const.EASEBUZZ_HASH_SEQUENCE[hash_sequence_key],
            key=tx_sudo.provider_id.easebuzz_key,
            salt=tx_sudo.provider_id.easebuzz_salt,
        )

        # Handle the notification data
        tx_sudo._process('easebuzz', payload)

        return request.make_json_response('')

    @staticmethod
    def _easebuzz_verify_webhook(payload, hash_sequence, key, salt):
        """ Verifies the Easebuzz callback by computing the sha512 hash of the key by the `hash_sequence` and comparing it with `hash` payload.

        See https://docs.easebuzz.in/docs/payment-gateway/587zy3v064so6-what-are-webhooks

        :param dict payload: Payload received in webhook
        :param hash_sequence: Hash sequence of to compute the hash of payload values in that sequence.
        :return: True if valid
        :rtype: bool
        :raise: Forbidden: If computed hash mismatches with the received hash
        """
        received_hash = payload.get('hash')
        payload['salt'] = salt
        payload['key'] = key
        computed_hash = easebuzz_utils.compute_hash_payload(payload, hash_sequence)

        if computed_hash == received_hash:
            return True

        _logger.warning("Invalid hash sequence %s for data\n%s", hash_sequence, pprint.pformat(payload))
        raise Forbidden()
