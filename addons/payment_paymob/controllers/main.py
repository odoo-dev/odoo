# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

from odoo import http
from odoo.exceptions import ValidationError
from odoo.http import request


_logger = logging.getLogger(__name__)


class PaymobController(http.Controller):
    _return_url = '/payment/paymob/return'
    _webhook_url = '/payment/paymob/webhook'

    @http.route(
        _return_url, type='http', auth='public', methods=['GET', 'POST'], csrf=False,
        save_session=False
    )
    def paymob_return_from_checkout(self, **data):
        """ Process the notification data sent by Paymob after redirection from checkout.

        The route is flagged with `save_session=False` to prevent Odoo from assigning a new session
        to the user if they are redirected to this route with a POST request. Indeed, as the session
        cookie is created without a `SameSite` attribute, some browsers that don't implement the
        recommended default `SameSite=Lax` behavior will not include the cookie in the redirection
        request from the payment provider to Odoo. As the redirection to the '/payment/status' page
        will satisfy any specification of the `SameSite` attribute, the session of the user will be
        retrieved and with it the transaction which will be immediately post-processed.

        :param dict data: The notification data (only `id`) and the transaction reference (`ref`)
                          embedded in the return URL
        """
        _logger.info("handling redirection from Paymob with data:\n%s", pprint.pformat(data))
        request.env['payment.transaction'].sudo()._handle_notification_data('paymob', data)
        return request.redirect('/payment/status')

    @http.route(_webhook_url, type='http', auth='public', methods=['POST'], csrf=False)
    def paymob_webhook(self, **data):
        """ Process the notification data sent by Paymob to the webhook.

        :param dict data: The notification data (only `id`) and the transaction reference (`ref`)
                          embedded in the return URL
        :return: An empty string to acknowledge the notification
        :rtype: str
        """
        _logger.info("notification received from Paymob with data:\n%s", pprint.pformat(data))
        try:
            request.env['payment.transaction'].sudo()._handle_notification_data('paymob', data)
        except ValidationError:  # Acknowledge the notification to avoid getting spammed
            _logger.exception("unable to handle the notification data; skipping to acknowledge")
        return ''  # Acknowledge the notification
