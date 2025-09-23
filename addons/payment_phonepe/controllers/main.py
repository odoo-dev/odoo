# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

from odoo.http import Controller, request, route

from odoo.addons.payment_phonepe import const as phonepe_const
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


class PhonepeController(Controller):

    RETURN_URL = "/payment/phonepe/return"
    WEBHOOK_URL = '/payment/phonepe/webhook'

    @route(RETURN_URL, type='http', auth='public', methods=['GET'])
    def phonepe_return_from_checkout(self, **data):
        """ Process the notification data sent by Phonepe after redirection.

        :param dict data: The notification data.
        """
        _logger.info("Notification received from Phonepe with data:\n%s", pprint.pformat(data))
        # Don't process the notification data as they contain no valuable information
        return request.redirect('/payment/status')

    @route(WEBHOOK_URL, type='http', auth='public', methods=['POST'], csrf=False)
    def phonepe_webhook(self):
        """ Process the notification data sent by Phonepe to the webhook.

        :return: An empty string to acknowledge the notification.
        :rtype: str
        """

        data = request.get_json_data()
        _logger.info("Notification received from Phonepe with data:\n%s", pprint.pformat(data))

        event_type = data['event']
        if event_type in phonepe_const.HANDLED_WEBHOOK_EVENTS:
            webhook_type = 'payment' if 'order' in event_type else 'refund'
            try:
                payload = data['payload']
                payload.update(webhook_type=webhook_type)

                # Validate request is from phonepe
                received_signature = request.httprequest.headers.get('Authorization')
                tx_sudo = request.env['payment.transaction'].sudo()._search_by_reference(
                    'phonepe', payload
                )
                tx_sudo.provider_id._phonepe_verify_signature(
                    received_signature
                )

                # Handle the notification data.
                tx_sudo._process('phonepe', payload)
            except ValidationError:  # Acknowledge the notification to avoid getting spammed.
                _logger.exception("Unable to handle the notification data; skipping to acknowledge")
        return request.make_json_response('')
