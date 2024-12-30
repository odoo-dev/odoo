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
        # x={'acq_response_code': '00',
        # 'amount_cents': '10002785',
        # 'bill_balanced': 'false',
        # 'captured_amount': '0',
        # 'created_at': '2025-01-03T19:55:30.318287+05:00',
        # 'currency': 'PKR',
        # 'data.message': 'Approved',
        # 'discount_details': '[]',
        # 'error_occured': 'false',
        # 'has_parent_transaction': 'false',
        # 'hmac': 'a14aebfe25d62e58343cf6ed90e376518ac4a33ff3b93409beaf66363527c809b6c802f0f2642a749438804a9e33ac03aaf000d3cfad1b2a75f3ea602472e8c1',
        # 'id': '20279777',
        # 'integration_id': '191469',
        # 'is_3d_secure': 'true',
        # 'is_auth': 'false',
        # 'is_bill': 'false',
        # 'is_capture': 'false',
        # 'is_refund': 'false',
        # 'is_refunded': 'false',
        # 'is_settled': 'false',
        # 'is_standalone_payment': 'true',
        # 'is_void': 'false',
        # 'is_voided': 'false',
        # 'merchant_commission': '0',
        # 'merchant_order_id': 'S00038#1',
        # 'order': '25793766',
        # 'owner': '176511',
        # 'pending': 'false',
        # 'profile_id': '167115',
        # 'refunded_amount_cents': '0',
        # 'source_data.card_num': '512345xxxxxx2346',
        # 'source_data.pan': '2346',
        # 'source_data.sub_type': 'MasterCard',
        # 'source_data.type': 'card',
        # 'success': 'true',
        # 'txn_response_code': 'APPROVED',
        # 'updated_at': '2025-01-03T19:55:48.105607+05:00'}
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
