# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

import requests

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.payment_hdfc_upi_qr import const

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

    def _hdfc_upi_make_request(self, endpoint, payload=None):
        """ Make a request to HDFC UPI API at the specified endpoint.

        Note: self.ensure_one()

        :param str endpoint: The endpoint to be reached by the request.
        :param dict payload: The payload of the request.
        :return: The JSON-formatted content of the response.
        :rtype: dict
        :raise: ValidationError if an HTTP error occurs.
        """
        self.ensure_one()

        url = self._hdfc_upi_get_api_url(endpoint)
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

        try:
            _logger.info("Sending 'POST' request to %s:\n%s", url, pprint.pformat(payload))  # will be removed after testing
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=60
            )
            response.raise_for_status()
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            _logger.exception("Unable to reach HDFC UPI endpoint at %s", url)
            raise ValidationError("HDFC UPI: " + _("Could not establish the connection to the API."))
        except requests.exceptions.HTTPError as err:
            _logger.exception(
                "Invalid API request at %s with data:\n%s", url, pprint.pformat(payload)
            )
            error_message = err.response.json().get('message')
            raise ValidationError(
                "HDFC UPI: " + _("HDFC UPI gave us the following information: '%s'", error_message)
            )
        return response.json()

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
