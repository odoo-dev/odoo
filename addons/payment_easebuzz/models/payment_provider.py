# Part of Odoo. See LICENSE file for full copyright and licensing details.

from typing import Literal
import logging
import pprint

import requests

from odoo import fields, models
from odoo.exceptions import ValidationError

from odoo.addons.payment_easebuzz import const as easebuzz_const

_logger = logging.getLogger(__name__)


class PaymentProvider(models.Model):
    _inherit = "payment.provider"

    code = fields.Selection(
        selection_add=[('easebuzz', 'Easebuzz')], ondelete={'easebuzz': 'set default'}
    )

    easebuzz_key = fields.Char(
        string="Easebuzz Key",
        required_if_provider="easebuzz"
    )

    easebuzz_salt = fields.Char(
        string="Easebuzz Salt",
        required_if_provider="easebuzz"
    )

    #  === COMPUTE METHODS === #

    def _compute_feature_support_fields(self):
        """ Override of `payment` to enable additional features. """
        super()._compute_feature_support_fields()
        self.filtered(lambda p: p.code == 'easebuzz').update({
            'support_manual_capture': 'full_only',
            'support_refund': 'partial'
        })

    # === BUSINESS METHODS - PAYMENT FLOW === #

    def _get_supported_currencies(self):
        """ Override of `payment` to return the supported currencies. """
        supported_currencies = super()._get_supported_currencies()
        if self.code == 'easebuzz':
            supported_currencies = supported_currencies.filtered(
                lambda c: c.name in easebuzz_const.SUPPORTED_CURRENCIES
            )
        return supported_currencies

    def _get_default_payment_method_codes(self):
        """ Override of `payment` to return the default payment method codes. """
        default_codes = super()._get_default_payment_method_codes()
        if self.code != 'easebuzz':
            return default_codes

        return easebuzz_const.DEFAULT_PAYMENT_METHOD_CODES

    def _easebuzz_get_endpoint_url(self, mode: Literal['payment', 'refund']):
        """ Compute the endpoint url for Easebuzz API based on mode (`payment`, `refund`)
        :param str mode: The transaction mode `payment` or `refund`
        :return The computed endpoint url
        :rtype str
        """
        if self.state == 'test':
            subdomain = 'testpay' if mode == 'payment' else 'testdashboard'
        else:
            subdomain = 'pay' if mode == 'payment' else 'dashboard'
        return f'https://{subdomain}.easebuzz.in'

    def _easebuzz_get_headers(self, mode: Literal['payment', 'refund']):
        """ Compute headers for Easebuzz API request based on mode (`payment`, `refund`)
        :param str mode: The transaction mode `payment` or `refund`
        :return Headers required for Easebuzz API
        :rtype dict
        """
        if mode == 'payment':
            return {
                'Content-Type': 'application/x-www-form-urlencoded'
            }

        return {
            'Content-Type': 'application/json'
        }

    def _easebuzz_make_request(self, endpoint, payload=None, method='POST', mode: Literal['payment', 'refund'] = 'payment'):
        """ Make a request to Easebuzz API at the specified endpoint.

        Note: self.ensure_one()

        :param str endpoint: The endpoint to be reached by the request.
        :param dict payload: The payload of the request.
        :param str method: The HTTP method of the request.
        :param str mode: The transaction mode `payment` or `refund`
        :return The JSON-formatted content of the response.
        :rtype: dict
        :raise ValidationError: If an HTTP error occurs.
        """
        self.ensure_one()

        url = self._easebuzz_get_endpoint_url(mode) + endpoint
        headers = self._easebuzz_get_headers(mode)
        try:
            response = requests.request(method, url, data=payload, headers=headers, timeout=10)
            try:
                response.raise_for_status()
                response_json = response.json()
                if response_json.get('status') == 0:
                    raise requests.exceptions.HTTPError()  # Raise HttpError when the response status is 0 as Easebuzz always provide 200 status code
            except requests.exceptions.HTTPError:
                _logger.exception(
                    "Invalid API request at %s with data:\n%s", url, pprint.pformat(payload),
                )
                _logger.exception("Response %s", pprint.pformat(response.json()))
                raise ValidationError(
                    f"Easebuzz: Easebuzz gave us the following information: '{response.json().get('error_desc')}'"
                )
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            _logger.exception("Unable to reach endpoint at %s", url)
            raise ValidationError(
                "Easebuzz: Could not establish the connection to the API."
            )
        return response.json()
