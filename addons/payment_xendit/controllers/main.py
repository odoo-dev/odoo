# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

from werkzeug import urls
from werkzeug.exceptions import Forbidden

from odoo import http
from odoo.exceptions import ValidationError
from odoo.http import request


_logger = logging.getLogger(__name__)


class XenditController(http.Controller):

    _return_url = '/payment/status'
    _webhook_url = '/payment/xendit/webhook'

    @http.route('/payment/xendit/payment_methods', type='json', auth='public')
    def xendit_create_invoice(self, provider_id, amount, reference, currency_id, partner_id=None, payment_method_code=None, payment_option_id=None, **kwargs):
        """ Create an invoice on xendit which will return a invoice_url
        POST https://api.xendit.co/v2/invoices

        params:
        external_id (str) - name of where the sale is generated from
        amount (int) - amount to be paid in xendit checkout page
        description (str) - description if any
        success_redirect_url (str) - url to redirect to after payment is successful
        failure_redirect_url (str)- url to redirect to after payment fails
        """
        provider_sudo = request.env['payment.provider'].sudo().browse(provider_id)
        base_url = provider_sudo.get_base_url()
        currency_code = request.env['res.currency'].browse(currency_id).name
        partner_sudo = partner_id and request.env['res.partner'].sudo().browse(partner_id).exists()
        payload = {
            'external_id': reference,
            'amount': amount,
            'currency': currency_code,
            'description': reference,
            'customer': {
                'given_names': partner_sudo.name,
            },
            'success_redirect_url': urls.url_join(base_url, self._return_url),
            'failure_redirect_url': urls.url_join(base_url, self._return_url),
        }

        if partner_sudo.phone or partner_sudo.mobile:
            payload['customer']['mobile_number'] = partner_sudo.phone_get_sanitized_number('phone') or partner_sudo.phone_get_sanitized_number('mobile')
        if partner_sudo.email:
            payload['customer']['email'] = partner_sudo.email
        if payment_method_code:
            method_sudo = request.env['payment.method'].sudo()._get_from_code(payment_method_code)
            if payment_method_code == 'card':
                payload['payment_methods'] = ['CREDIT_CARD']
            elif method_sudo.code:
                payload['payment_methods'] = [method_sudo.code.upper()]

        checkout_url = provider_sudo._xendit_make_request('INVOICE', payload=payload).get('invoice_url')
        if not checkout_url:
            raise ValidationError("Issue on invoice creation on Xendit! No checkout URL received!")
        _logger.info("URL to redirect to Xendit: %s", checkout_url)

        return {
            "type": "ir.actions.act_url",
            "url": checkout_url,
            "target": "new",
        }

    @http.route(_webhook_url, type='http', methods=['POST'], auth='public', csrf=False)
    def xendit_webhook(self):
        """ Process the notification data sent by Xendit to the webhook.

        :return: An empty string to acknowledge the notification.
        :rtype: str
        """
        data = request.get_json_data()
        _logger.info("Notification received from Xendit with data:\n%s", pprint.pformat(data))

        tx_sudo = request.env['payment.transaction'].sudo()._get_tx_from_notification_data(
            'xendit', data
        )
        try:
            # Check the integrity of the notification.
            received_signature = request.httprequest.headers.get('x-callback-token')
            tx_sudo = request.env['payment.transaction'].sudo()._get_tx_from_notification_data(
                'xendit', data
            )
            self._verify_notification_signature(received_signature, tx_sudo)

            tx_sudo._handle_notification_data('xendit', data)
        except ValidationError:
            _logger.exception("Unable to handle notification data; skip to acknowledge")

        return request.make_json_response('')

    @staticmethod
    def _verify_notification_signature(received_signature, tx_sudo):
        """ Check that the received signature matches the expected one.

        :param str received_signature: The signature received with the notification data.
        :param payment.transaction tx_sudo: The transaction referenced by the notification data.
        :return: None
        :raise Forbidden: If the signatures don't match.
        """
        # Check for the received signature.
        if not received_signature:
            _logger.warning("No signature received on the callback!")
            raise Forbidden()

        # Compare the received signature with the expected signature.
        expected_signature = tx_sudo.provider_id.xendit_webhook_token
        if expected_signature != received_signature:
            _logger.warning("Received notification with invalid signature.")
            raise Forbidden()
