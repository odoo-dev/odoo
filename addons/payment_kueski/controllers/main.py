# Part of Odoo. See LICENSE file for full copyright and licensing details.

import pprint

from werkzeug.exceptions import Forbidden

from odoo import http
from odoo.exceptions import ValidationError
from odoo.http import request

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment.logging import get_payment_logger

_logger = get_payment_logger(__name__)


class KueskiController(http.Controller):
    _return_url = "/payment/kueski/return"
    _webhook_url = "/payment/kueski/webhook"

    @http.route(_return_url, type="http", auth="public", methods=["GET"])
    def kueski_return_from_checkout(self, tx_ref=None, access_token=None):
        """Process the redirection from Kueski by fetching the payment intent of the transaction.

        :param str tx_ref: The reference of the transaction, embedded in the callback URL.
        :param str access_token: The access token of the transaction, embedded in the callback URL.
        """
        _logger.info("Handling redirection from Kueski for transaction %s.", tx_ref)
        if not payment_utils.check_access_token(access_token, tx_ref):
            _logger.warning("Received redirection with invalid access token.")
            raise Forbidden
        self._fetch_and_process({"order_id": tx_ref})
        return request.redirect("/payment/status")

    @http.route(_webhook_url, type="http", auth="public", methods=["POST"], csrf=False)
    def kueski_webhook(self):
        """Process the notification sent by Kueski to the webhook.

        :return: An empty JSON object to acknowledge the notification.
        :rtype: Response
        """
        data = request.get_json_data()
        _logger.info("Notification received from Kueski with data:\n%s", pprint.pformat(data))
        # The notification is unsigned (mTLS only), so only the fetched payment intent is trusted.
        self._fetch_and_process(data)
        return request.make_json_response({})

    @staticmethod
    def _fetch_and_process(data):
        """Fetch the payment intent of the transaction matching the data from Kueski and record it.

        :param dict data: The data holding the transaction reference in `order_id`.
        :return: None
        """
        tx_sudo = request.env["payment.transaction"].sudo()._search_by_reference("kueski", data)
        if not tx_sudo or not tx_sudo.provider_reference:
            return

        try:
            intent_data = tx_sudo._send_api_request(
                "GET", f"/v2/payment_intents/{tx_sudo.provider_reference}"
            )
        except ValidationError:
            _logger.error(
                "Unable to fetch the payment intent of transaction %s.", tx_sudo.reference
            )
        else:
            tx_sudo._record(intent_data)
