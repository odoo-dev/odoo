# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import pprint

import requests

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.payment_hdfc_upi_qr import const
from odoo.addons.payment_hdfc_upi_qr import utils as hdfc_upi_utils

_logger = logging.getLogger(__name__)


class PaymentProvider(models.Model):
    _inherit = 'payment.provider'

    code = fields.Selection(
        selection_add=[('hdfc_upi', 'HDFC UPI')], ondelete={'hdfc_upi': 'set default'}
    )
    hdfc_upi_merchant_id = fields.Char(
        string="Merchant ID",
        help="The merchant ID provided by HDFC Bank for UPI integration.",
        required_if_provider='hdfc_upi',
        groups='base.group_system'
    )
    hdfc_upi_merchant_name = fields.Char(
        string="Merchant Name",
        help="The merchant name to be displayed in UPI apps.",
        required_if_provider='hdfc_upi',
    )
    hdfc_upi_merchant_category = fields.Char(
        string="Merchant Category Code",
        help="The merchant category code (MCC) provided by HDFC Bank.",
        default="0000",
        required_if_provider='hdfc_upi',
    )
    hdfc_upi_encryption_key = fields.Char(
        string="Encryption Key",
        help="The encryption key provided by HDFC Bank for secure communication.",
        required_if_provider='hdfc_upi',
        groups='base.group_system'
    )

    # === COMPUTE METHODS === #

    def _compute_feature_support_fields(self):
        """ Override of `payment` to enable additional features. """
        super()._compute_feature_support_fields()
        self.filtered(lambda p: p.code == 'hdfc_upi').update({
            'support_refund': 'full_only',
            'support_tokenization': False,
            'support_express_checkout': False,
        })

    # === CONSTRAINT METHODS === #

    @api.constrains('company_id')
    def _check_l10n_in_upi_id(self):
        """ Check that company UPI VPA is properly configured. """
        for provider in self:
            if provider.code == 'hdfc_upi' and provider.state != 'disabled':
                upi_id = provider.company_id.l10n_in_upi_id
                if not upi_id:
                    raise ValidationError(_(
                        "UPI VPA is required for HDFC UPI provider (from company UPI Id)."
                    ))
                if '@' not in upi_id:
                    raise ValidationError(_(
                        "UPI VPA must be in the format 'username@provider' (from company UPI Id)."
                    ))
                if not upi_id.count('@') == 1:
                    raise ValidationError(_(
                        "UPI VPA must contain exactly one '@' character."
                    ))

    # === BUSINESS METHODS - PAYMENT FLOW === #

    def _hdfc_upi_make_request(self, endpoint, payload=None, method='POST'):
        """ Make a request to HDFC UPI API at the specified endpoint.

        Note: self.ensure_one()

        :param str endpoint: The endpoint to be reached by the request.
        :param dict payload: The payload of the request.
        :param str method: The HTTP method of the request.
        :return: The JSON-formatted content of the response.
        :rtype: dict
        :raise: ValidationError if an HTTP error occurs.
        """
        self.ensure_one()

        api_url = self._hdfc_upi_get_api_url(endpoint)
        timeout = const.API_CONFIG['timeout']

        headers = {
            'Content-Type': const.API_CONFIG['content_type'],
            'Accept': 'application/json',
        }

        try:
            _logger.info("Sending '%s' request to %s:\n%s", method, api_url, pprint.pformat(payload))
            response = requests.request(
                method,
                api_url,
                json=payload,
                headers=headers,
                timeout=timeout
            )

            try:
                response.raise_for_status()
            except requests.exceptions.HTTPError:
                _logger.exception(
                    "Invalid API request at %s with data:\n%s\nResponse:\n%s",
                    api_url, pprint.pformat(payload), response.text
                )
                error_message = _("API request failed with status %s", response.status_code)
                try:
                    error_data = response.json()
                    if 'message' in error_data:
                        error_message = error_data['message']
                except (ValueError, KeyError):
                    pass

                raise ValidationError(_("HDFC UPI: %s", error_message))

        except requests.exceptions.ConnectionError:
            _logger.exception("Unable to reach HDFC UPI endpoint at %s", api_url)
            raise ValidationError("HDFC UPI: " + _("Could not establish connection to the API."))
        except requests.exceptions.Timeout:
            _logger.exception("Timeout while connecting to HDFC UPI endpoint at %s", api_url)
            raise ValidationError("HDFC UPI: " + _("Request timed out. Please try again."))
        except requests.exceptions.RequestException:
            _logger.exception("Request error while connecting to HDFC UPI")
            raise ValidationError("HDFC UPI: " + _("Network error occurred. Please try again."))

        try:
            response_data = response.json()
            _logger.info("Response from HDFC UPI API:\n%s", pprint.pformat(response_data))
            return response_data
        except ValueError:
            _logger.error("Invalid JSON response from HDFC UPI API: %s", response.text)
            raise ValidationError("HDFC UPI: " + _("Invalid response format from API."))

    # === BUSINESS METHODS - GETTERS === #

    def _get_supported_currencies(self):
        """ Override of `payment` to return the supported currencies. """
        supported_currencies = super()._get_supported_currencies()
        if self.code == 'hdfc_upi':
            supported_currencies = supported_currencies.filtered(
                lambda c: c.name in const.SUPPORTED_CURRENCIES
            )
        return supported_currencies

    def _get_default_payment_method_codes(self):
        """ Override of `payment` to return the default payment method codes. """
        default_codes = super()._get_default_payment_method_codes()
        if self.code != 'hdfc_upi':
            return default_codes
        return const.DEFAULT_PAYMENT_METHOD_CODES

    def _hdfc_upi_get_api_url(self, endpoint):
        """ Return the appropriate URL for the requested endpoint.

        Constructs the full API URL based on the provider state (test/production).

        :param str endpoint: The endpoint to be reached by the API request.
        :return: The URL for the requested endpoint.
        :rtype: str
        """
        self.ensure_one()

        base_url = const.HDFC_UPI_API_URLS.get(
            'test' if self.state == 'test' else 'production'
        )
        endpoint_path = const.API_ENDPOINTS.get(endpoint, '')
        return f"{base_url}{endpoint_path}"

    def _hdfc_upi_get_inline_form_values(self, amount=None, currency=None, reference=None):
        """ Return a serialized JSON of the required values to render the inline form.

        Note: self.ensure_one()

        :param float amount: The transaction amount.
        :param res.currency currency: The transaction currency.
        :param str reference: The transaction reference.
        :return: The JSON serial of the required values to render the inline form.
        :rtype: str
        """
        self.ensure_one()

        # Validate currency
        if currency and currency.name != 'INR':
            raise ValidationError(_("HDFC UPI only supports INR currency"))

        # Validate amount
        if amount:
            is_valid, error_message = hdfc_upi_utils.validate_transaction_amount(amount, 'INR')
            if not is_valid:
                raise ValidationError(_("HDFC UPI: %s", error_message))

        inline_form_values = {
            'merchant_id': self.hdfc_upi_merchant_id,
            'merchant_name': hdfc_upi_utils.sanitize_merchant_name(self.hdfc_upi_merchant_name),
            'merchant_vpa': self.company_id.l10n_in_upi_id,
            'merchant_category': self.hdfc_upi_merchant_category or '0000',
            'formatted_amount': hdfc_upi_utils.format_upi_amount(amount) if amount else '0.00',
            'currency_code': 'INR',
            'reference': reference or '',
            'qr_config': const.QR_CODE_CONFIG,
        }

        return json.dumps(inline_form_values)
