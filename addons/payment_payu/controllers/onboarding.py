# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

from werkzeug.exceptions import Forbidden

from odoo import _
from odoo.exceptions import ValidationError
from odoo.http import Controller, request, route

_logger = logging.getLogger(__name__)


class PayUController(Controller):

    OAUTH_RETURN_URL = '/payment/payu/oauth/return'

    @route(OAUTH_RETURN_URL, type='http', auth='user', methods=['GET'], website=True)
    def payu_return_from_authorization(self, **data):
        """Exchange the authorization code for an access token and redirect to the provider form.

        :param dict data: The authorization code received from PayU, in addition to the provided
                        provider id and CSRF token that were sent back by the proxy.
        :raise Forbidden: If the received CSRF token cannot be verified.
        :raise ValidationError: If the provider id does not match any PayU provider.
        :return: Redirect to the payment provider form.
        """

        _logger.info("Returning from authorization with data:\n%s", pprint.pformat(data))

        # Retrieve and validate incoming data
        provider_id = int(data.get('provider_id'))
        authorization_code = data.get('authorization_code')
        csrf_token = data.get('csrf_token')
        merchant_id = data.get('merchantId')

        # Validate CSRF token
        if not request.validate_csrf(csrf_token):
            _logger.warning("CSRF token verification failed.")
            raise Forbidden("CSRF token validation failed.")

        # Retrieve provider, validate it
        provider_sudo = request.env['payment.provider'].sudo().browse(provider_id)
        if not provider_sudo.exists() or provider_sudo.code != 'payu':
            raise ValidationError(_("Invalid PayU provider with id %s", provider_id))

        action = request.env.ref('payment.action_payment_provider')
        redirect_url = f'/odoo/action-{action.id}/{int(provider_sudo.id)}'
        if not authorization_code:  # The user cancelled the authorization.
            return request.redirect(redirect_url)

        # Attempt to retrieve access token from PayU
        try:
            auth_payload = {'authorization_code': authorization_code}
            response_auth_content = provider_sudo._send_api_request(
                'POST', '/get_access_token', data=auth_payload, is_proxy_request=True
            )
        except ValidationError as e:
            _logger.error("Error fetching access token from PayU: %s", str(e))
            return request.render(
                'payment_payu.authorization_error',
                qcontext={'error_message': str(e), 'provider_url': '/odoo/action-payment_provider/'}
            )

        # Attempt to retrieve merchant credentials from PayU
        access_token = response_auth_content.get('access_token')
        if not access_token:
            _logger.error("Access token not received from PayU.")
            return request.render(
                'payment_payu.authorization_error',
                qcontext={'error_message': 'Access token not received.', 'provider_url': '/odoo/action-payment_provider/'}
            )

        try:
            credentials_payload = {'merchant_id': merchant_id, 'access_token': access_token}
            response_merchant_content = provider_sudo._send_api_request(
                'POST', '/get_credentials', data=credentials_payload, is_proxy_request=True
            )
        except ValidationError as e:
            _logger.error("Error fetching merchant credentials from PayU: %s", str(e))
            return request.render(
                'payment_payu.authorization_error',
                qcontext={'error_message': str(e), 'provider_url': '/odoo/action-payment_provider/'}
            )

        # Extract credentials and save them to the provider
        credentials = response_merchant_content.get('data', {}).get('credentials', {})
        if credentials:
            provider_sudo.write({
                # Save the OAuth credentials.
                'payu_merchant_key': credentials.get('prod_key'),
                'payu_merchant_salt': credentials.get('prod_salt'),
                # Enable the provider.
                'state': 'enabled',
                'is_published': True,
            })
            _logger.info("Successfully saved PayU credentials for provider %s", provider_sudo.name)
        else:
            _logger.error("Credentials not found in PayU response for provider %s", provider_sudo.name)

        # Redirect to the provider form
        return request.redirect(redirect_url)
