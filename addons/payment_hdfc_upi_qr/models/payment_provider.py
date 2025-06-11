# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import re
import requests
import json

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.payment_hdfc_upi_qr import const
from odoo.addons.payment_hdfc_upi_qr import utils as hdfc_upi_utils

_logger = logging.getLogger(__name__)


class PaymentProvider(models.Model):
    _inherit = 'payment.provider'

    code = fields.Selection(
        selection_add=[('hdfc_upi', 'HDFC UPI')],
        ondelete={'hdfc_upi': 'set default'}
    )

    hdfc_upi_merchant_id = fields.Char(
        string="HDFC UPI Merchant ID",
        help="The merchant ID provided by HDFC Bank for UPI integration.",
        required_if_provider='hdfc_upi',
        groups='base.group_system'
    )
    hdfc_upi_merchant_name = fields.Char(
        string="HDFC UPI Merchant Name",
        help="The merchant name to be displayed in UPI apps.",
        required_if_provider='hdfc_upi',
    )
    hdfc_upi_merchant_category = fields.Char(
        string="HDFC UPI Merchant Category Code",
        help="The merchant category code (MCC) provided by HDFC Bank.",
        default="0000",
        required_if_provider='hdfc_upi',
    )
    hdfc_upi_encryption_key = fields.Char(
        string="HDFC UPI Encryption Key",
        help="The encryption key provided by HDFC Bank for secure communication.",
        required_if_provider='hdfc_upi',
        groups='base.group_system'
    )

    # Use l10n_in_upi_id from res.company via company_id
    @api.constrains('company_id')
    def _check_l10n_in_upi_id(self):
        for provider in self:
            if provider.code == 'hdfc_upi' and provider.state != 'disabled':
                upi_id = provider.company_id.l10n_in_upi_id
                if not upi_id:
                    raise ValidationError(_("UPI VPA is required for HDFC UPI provider (from company UPI Id)."))
                if '@' not in upi_id:
                    raise ValidationError(_("UPI VPA must be in the format 'username@provider' (from company UPI Id)."))
                if not upi_id.count('@') == 1:
                    raise ValidationError(_("UPI VPA must contain exactly one '@' character."))

    def _get_default_payment_method_codes(self):
        """Return the default payment method codes for this provider.
        
        For HDFC UPI, uses the standard UPI payment method from core payment data.
        
        :return: The default payment method codes
        :rtype: set
        """
        default_codes = super()._get_default_payment_method_codes()
        if self.code == 'hdfc_upi':
            return const.DEFAULT_PAYMENT_METHOD_CODES
        return default_codes

    def _should_build_inline_form(self, is_validation=False):
        """Override to specify that inline forms are used for HDFC UPI.
        
        HDFC UPI uses inline forms to display QR codes directly in the payment form.
        
        :param bool is_validation: Whether the validation operation is being performed
        :return: True for HDFC UPI provider, parent result otherwise
        :rtype: bool
        """
        if self.code == 'hdfc_upi':
            return True
        return super()._should_build_inline_form(is_validation=is_validation)

    def _get_validation_amount(self):
        """Return the amount to use for validation operations.
        
        For HDFC UPI, a minimal amount of 1.0 INR is used for validation.
        
        :return: The validation amount
        :rtype: float
        """
        self.ensure_one()
        if self.code == 'hdfc_upi':
            return 1.0  # Use a small amount for validation
        return super()._get_validation_amount()

    def _get_validation_currency(self):
        """Return the currency to use for validation operations.
        
        UPI only supports Indian Rupee (INR) currency.
        
        :return: The validation currency
        :rtype: res.currency
        """
        self.ensure_one()
        if self.code == 'hdfc_upi':
            return self.env.ref('base.INR')  # UPI only supports INR
        return super()._get_validation_currency()

    def _compute_feature_support_fields(self):
        """Specify the features supported by the HDFC UPI provider.
        
        HDFC UPI supports:
        - Full refunds
        - Does not support tokenization
        - Does not support express checkout
        """
        super()._compute_feature_support_fields()
        if self.code == 'hdfc_upi':
            self.support_refund = 'full_only'
            self.support_tokenization = False
            self.support_express_checkout = False

    def _check_required_if_provider(self):
        """Check required fields based on provider code.
        
        For HDFC UPI provider, validates that all required configuration
        fields are properly set when the provider is enabled.
        
        :raises ValidationError: If any required field is missing
        """
        super()._check_required_if_provider()
        for provider in self.filtered(lambda p: p.code == 'hdfc_upi' and p.state != 'disabled'):
            if not provider.hdfc_upi_merchant_id:
                raise ValidationError(_("Merchant ID is required for HDFC UPI provider"))
            if not provider.hdfc_upi_merchant_name:
                raise ValidationError(_("Merchant Name is required for HDFC UPI provider"))
            upi_id = provider.company_id.l10n_in_upi_id
            if not upi_id:
                raise ValidationError(_("UPI VPA is required for HDFC UPI provider (from company UPI Id)."))
            if not provider.hdfc_upi_encryption_key:
                raise ValidationError(_("Encryption Key is required for HDFC UPI provider"))

    def _get_supported_currencies(self):
        """ Override of `payment` to return the supported currencies. """
        supported_currencies = super()._get_supported_currencies()
        if self.code == 'hdfc_upi':
            supported_currencies = supported_currencies.filtered(
                lambda c: c.name in const.SUPPORTED_CURRENCIES
            )
        return supported_currencies

    def _hdfc_upi_get_api_url(self, endpoint):
        """Return the appropriate URL for the requested endpoint.
        
        Constructs the full API URL based on the provider state (test/production).
        
        :param str endpoint: The endpoint to be reached by the API request
        :return: The URL for the requested endpoint
        :rtype: str
        """
        self.ensure_one()
        
        base_url = const.HDFC_UPI_API_URLS.get(
            'test' if self.state == 'test' else 'production'
        )
        endpoint_path = const.API_ENDPOINTS.get(endpoint, '')
        return f"{base_url}{endpoint_path}"

    def _hdfc_upi_make_request(self, endpoint, payload=None, method='POST'):
        """Make a request to HDFC UPI API at the specified endpoint.
        
        :param str endpoint: The endpoint to be reached by the request
        :param dict payload: The payload of the request
        :param str method: The HTTP method of the request
        :return: The JSON-formatted content of the response
        :rtype: dict
        :raise: ValidationError if an HTTP error occurs
        """
        self.ensure_one()
        
        api_url = self._hdfc_upi_get_api_url(endpoint)
        timeout = const.API_CONFIG['timeout']
        
        headers = {
            'Content-Type': const.API_CONFIG['content_type'],
            'Accept': 'application/json',
        }
        
        try:
            _logger.info("Making HDFC UPI API request to %s", api_url)
            response = requests.request(
                method,
                api_url,
                json=payload,
                headers=headers,
                timeout=timeout,
                verify=const.API_CONFIG['verify_https']
            )
            
            try:
                response.raise_for_status()
            except requests.exceptions.HTTPError:
                _logger.exception(
                    "Invalid API request at %s with data %s: %s", 
                    api_url, payload, response.text
                )
                error_message = _("API request failed with status %s") % response.status_code
                try:
                    error_data = response.json()
                    if 'message' in error_data:
                        error_message = error_data['message']
                except (ValueError, KeyError):
                    pass
                
                raise ValidationError("HDFC UPI: " + error_message)
                
        except requests.exceptions.ConnectionError:
            _logger.exception("Unable to reach HDFC UPI endpoint at %s", api_url)
            raise ValidationError("HDFC UPI: " + _("Could not establish connection to the API."))
        except requests.exceptions.Timeout:
            _logger.exception("Timeout while connecting to HDFC UPI endpoint at %s", api_url)
            raise ValidationError("HDFC UPI: " + _("Request timed out. Please try again."))
        except requests.exceptions.RequestException as e:
            _logger.exception("Request error while connecting to HDFC UPI: %s", str(e))
            raise ValidationError("HDFC UPI: " + _("Network error occurred. Please try again."))
        
        try:
            return response.json()
        except ValueError:
            _logger.error("Invalid JSON response from HDFC UPI API: %s", response.text)
            raise ValidationError("HDFC UPI: " + _("Invalid response format from API."))

    def _hdfc_upi_get_formatted_amount(self, amount, currency=None):
        """Return the amount in the format required by HDFC UPI.
        
        :param float amount: The transaction amount
        :param res.currency currency: The transaction currency (should be INR)
        :return: The formatted amount for HDFC UPI
        :rtype: dict
        """
        if currency and currency.name != 'INR':
            raise ValidationError(_("HDFC UPI only supports INR currency"))
        
        # Validate amount limits
        is_valid, error_message = hdfc_upi_utils.validate_transaction_amount(amount)
        if not is_valid:
            raise ValidationError(f"HDFC UPI: {error_message}")
        
        return {
            'value': hdfc_upi_utils.format_upi_amount(amount),
            'currency': 'INR',
        }

    def _hdfc_upi_get_inline_form_values(self, amount=None, currency=None, reference=None):
        """Return a serialized JSON of the required values to render the inline form.
        
        :param float amount: The transaction amount
        :param res.currency currency: The transaction currency
        :param str reference: The transaction reference
        :return: The JSON serial of the required values to render the inline form
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
                raise ValidationError(_("HDFC UPI: %s") % error_message)
        
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
