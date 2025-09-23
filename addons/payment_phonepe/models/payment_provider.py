# Part of Odoo. See LICENSE file for full copyright and licensing details.

import hashlib
import logging
import pprint

import requests
from datetime import datetime, timedelta
from werkzeug.exceptions import Forbidden

from odoo import fields, models
from odoo.exceptions import ValidationError

from odoo.addons.payment_phonepe import const as phonepe_const


_logger = logging.getLogger(__name__)


class PaymentProvider(models.Model):
    _inherit = "payment.provider"

    code = fields.Selection(
        selection_add=[('phonepe', 'PhonePe')], ondelete={'phonepe': 'set default'}
    )
    phonepe_client_id = fields.Char(
        string="Phonepe Client Id",
        required_if_provider="phonepe"
    )
    phonepe_client_version = fields.Integer(
        string="Phonepe Client Version",
        required_if_provider="phonepe",
        groups="base.group_system",
        default=1
    )
    phonepe_client_secret = fields.Char(
        string="Phonepe Client Secret",
        required_if_provider="phonepe",
        groups="base.group_system"
    )

    phonepe_webhook_username = fields.Char(
        string="Phonepe Webhook Username",
        required_if_provider="phonepe",
        groups="base.group_system"
    )

    phonepe_webhook_password = fields.Char(
        string="Phonepe Webhook Password",
        required_if_provider="phonepe",
        groups="base.group_system"
    )

    # === PhonePe Access Token Fields === #
    phonepe_access_token = fields.Char(string="Phonepe Access Token", groups="base.group_system")
    phonepe_access_token_expiry = fields.Datetime(string="Phonepe Access Token Expiry", groups="base.group_system")

    # === COMPUTE METHODS === #

    def _compute_feature_support_fields(self):
        """ Override of `payment` to enable additional features. """
        super()._compute_feature_support_fields()
        self.filtered(lambda p: p.code == 'phonepe').update({
            'support_manual_capture': 'full_only',
            'support_refund': 'partial',
        })

    # === BUSINESS METHODS - PAYMENT FLOW === #

    def _get_supported_currencies(self):
        """ Override of `payment` to return the supported currencies. """
        supported_currencies = super()._get_supported_currencies()
        if self.code == 'phonepe':
            supported_currencies = supported_currencies.filtered(
                lambda c: c.name in phonepe_const.SUPPORTED_CURRENCIES
            )
        return supported_currencies

    def _get_default_payment_method_codes(self):
        """ Override of `payment` to return the default payment method codes. """
        default_codes = super()._get_default_payment_method_codes()
        if self.code != 'phonepe':
            return default_codes
        return phonepe_const.DEFAULT_PAYMENT_METHOD_CODES

    def _phonepe_get_endpoint_url(self):
        if self.state == 'test':
            return 'https://api-preprod.phonepe.com/apis'
        return 'https://api.phonepe.com/apis'

    def _phonepe_make_request(self, endpoint, payload=None, method='POST'):
        """ Make a request to Phonepe API at the specified endpoint.

        Note: self.ensure_one()

        :param str endpoint: The endpoint to be reached by the request.
        :param dict payload: The payload of the request.
        :param str method: The HTTP method of the request.
        :return The JSON-formatted content of the response.
        :rtype: dict
        :raise ValidationError: If an HTTP error occurs.
        """
        self.ensure_one()

        payment_mode = 'pg-sandbox' if self.state == 'test' else 'pg'

        url = f'{self._phonepe_get_endpoint_url()}/{payment_mode}{endpoint}'
        headers = None
        if access_token := self._phonepe_get_access_token():
            headers = {'Authorization': f'O-Bearer {access_token}'}
        try:
            if method == 'GET':
                response = requests.get(
                    url,
                    params=payload,
                    headers=headers,
                    timeout=10,
                )
            else:
                response = requests.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=10,
                )
            try:
                response.raise_for_status()
            except requests.exceptions.HTTPError:
                _logger.exception(
                    "Invalid API request at %s with data:\n%s", url, pprint.pformat(payload),
                )
                raise ValidationError(
                    f"Phonepe: Phonepe gave us the following information: '{response.json().get('message')}'"
                )
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            _logger.exception("Unable to reach endpoint at %s", url)
            raise ValidationError(
                "Phonepe: Could not establish the connection to the API."
            )
        return response.json() if response.status_code != 204 else {}

    def _phonepe_verify_signature(self, authorization_header):
        """
        Verifies the PhonePe callback by comparing the Authorization header to SHA-256(username:password).

        See https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/webhook/#nav-callback-validation-verification.

        :param str authorization_header: The 'Authorization' header received in the callback.
        :return: True if valid
        :rtype: bool
        :raise: Forbidden: If invalid authorization header
        """
        if not self.phonepe_webhook_username or not self.phonepe_webhook_password:
            _logger.warning("Missing webhook credentials for computing secret; aborting signature calculation")
            return
        secret = f"{self.phonepe_webhook_username}:{self.phonepe_webhook_password}"
        computed_hash = hashlib.sha256(secret.encode()).hexdigest()
        if computed_hash == authorization_header:
            return True
        else:
            _logger.warning("Invalid Authorization header: %s", authorization_header)
            raise Forbidden()

    def _phonepe_get_access_token(self):
        self.ensure_one()
        if not self.phonepe_access_token or (self.phonepe_access_token_expiry and self.phonepe_access_token_expiry < fields.Datetime.now()):
            self._phonepe_refresh_access_token()
        return self.phonepe_access_token

    def _phonepe_refresh_access_token(self):
        """ Refresh the access token.

        Note: `self.ensure_one()`

        :return: dict
        """
        self.ensure_one()

        payment_mode = 'pg-sandbox' if self.state == 'test' else 'identity-manager'

        url = f'{self._phonepe_get_endpoint_url()}/{payment_mode}/v1/oauth/token'
        payload = {
            'client_version': self.phonepe_client_version,
            "client_id": self.phonepe_client_id,
            "client_secret": self.phonepe_client_secret,
            "grant_type": "client_credentials"  # Constant value from phonepe
        }

        headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        }

        response = requests.post(
            url,
            data=payload,
            headers=headers,
            timeout=10,
        )

        try:
            response.raise_for_status()
        except requests.exceptions.HTTPError:
            _logger.exception(
                "Invalid API request at %s with data:\n%s", url, pprint.pformat(payload),
            )
            raise ValidationError(
                f"Phonepe: Phonepe gave us the following information: '{response.json().get('message')}'"
            )
        response_content = response.json()
        if response_content.get('access_token'):
            if response_content.get('expires_in'):
                expiry = fields.Datetime.now() + timedelta(seconds=int(response_content['expires_in']))
            else:
                expiry = datetime.fromtimestamp(response_content['expires_at'])
            self.write({
                'phonepe_access_token': response_content['access_token'],
                'phonepe_access_token_expiry': expiry,
            })
        return response_content['access_token']
