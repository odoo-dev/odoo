# Part of Odoo. See LICENSE file for full copyright and licensing details.

from typing import Literal
from urllib.parse import urlencode

from odoo import _, api, fields, models, tools
from odoo.exceptions import RedirectWarning, ValidationError
from odoo.http import request

from odoo.addons.payment_payu import const as payu_const
from odoo.addons.payment_payu.controllers.onboarding import PayUController
from odoo.addons.payment.logging import get_payment_logger

_logger = get_payment_logger(__name__)


class PaymentProvider(models.Model):
    _inherit = 'payment.provider'

    code = fields.Selection(
        selection_add=[('payu', 'PayU')], ondelete={'payu': 'set default'},
    )
    payu_merchant_key = fields.Char(
        string='Merchant Key',
        help='The key solely used to identify the account with PayU.',
        copy=False,
    )
    payu_merchant_salt = fields.Char(
        string='Salt',
        help='The Salt used to generate a hash.',
        copy=False,
    )

    # === COMPUTE METHODS === #

    def _compute_feature_support_fields(self):
        """ Override of `payment` to enable additional features. """
        super()._compute_feature_support_fields()
        self.filtered(lambda p: p.code == 'payu').update({
            'support_refund': 'partial',
        })

    # === CONSTRAINT METHODS === #

    @api.constrains('state')
    def _check_payu_credentials_are_set_before_enabling(self):
        """ Check that the PayU credentials are valid when the provider is enabled.

        :raise ValidationError: If the PayU credentials are not valid.
        """
        for provider in self.filtered(lambda p: p.code == 'payu' and p.state != 'disabled'):
            if not provider.payu_merchant_key or not provider.payu_merchant_salt:
                raise ValidationError(_(
                    "PayU credentials are missing. Click the \"Connect\" button to set up"
                    " your account.",
                ))

    # === CRUD METHODS === #

    def _get_supported_currencies(self):
        """ Override of `payment` to return the supported currencies. """
        supported_currencies = super()._get_supported_currencies()
        if self.code == 'payu':
            supported_currencies = supported_currencies.filtered(lambda c: c.name in payu_const.SUPPORTED_CURRENCIES)
        return supported_currencies

    def _get_default_payment_method_codes(self):
        """ Override of `payment` to return the default payment method codes. """
        self.ensure_one()
        if self.code != 'payu':
            return super()._get_default_payment_method_codes()
        return payu_const.DEFAULT_PAYMENT_METHOD_CODES

    # === REQUEST HELPERS === #

    def _build_request_url(self, endpoint, *, mode: Literal['payment', 'refund'] = 'payment', is_proxy_request=False, **kwargs):
        """ Override of `payment` to build the request URl. """
        if self.code != 'payu':
            return super()._build_request_url(endpoint, mode=mode, is_proxy_request=is_proxy_request, **kwargs)
        if is_proxy_request:
            return f'{payu_const.OAUTH_URL}{endpoint}'

        url_host = payu_const.TEST_BASE_URL if self.state == 'test' else payu_const.PROD_BASE_URL
        return f'https://{url_host}{endpoint}'

    def _build_request_headers(self, *args, mode: Literal['payment', 'refund'] = 'payment', is_proxy_request=False, **kwargs):
        """ Override of `payment` to build the request headers. """
        if self.code != 'payu':
            return super()._build_request_headers(*args, mode=mode, is_proxy_request=is_proxy_request, **kwargs)

        return {'Content-Type': 'application/x-www-form-urlencoded' if mode == 'refund' or is_proxy_request else 'application/json'}

    def _parse_response_content(self, response, *, mode: Literal['payment', 'refund'] = 'payment', is_proxy_request=False, **kwargs):
        """ Override of `payment` to parse response content. """
        if self.code != 'payu':
            return super()._parse_response_content(response, mode=mode, is_proxy_request=is_proxy_request, **kwargs)
        try:
            response_content = response.json()
        except ValueError:
            raise ValidationError(_('Invalid response from Payu.'))

        # Return the response in case of onboarding
        if is_proxy_request:
            return response_content

        if response_content.get('status') == 0:
            # status: (0: API failure, 1: API Success)
            raise ValidationError(
                _('The payment provider rejected the request.\n%s', response_content.get('msg')),
            )
        return response_content

    def _parse_response_error(self, response):
        if self.code != 'payu':
            return super()._parse_response_error(response)
        try:
            response_msg = response.json().get('msg') or response.json().get('error_description')  # Refund or Onboarding
        except ValueError:
            raise ValidationError(_('Error occurred while parsing message from Payu.'))
        return response_msg

    def action_start_onboarding(self, menu_id=None):
        """ Override of `payment` to redirect to the PayU OAuth URL.

        Note: `self.ensure_one()`

        :param int menu_id: The menu from which the onboarding is started, as an `ir.ui.menu` id.
        :return: An URL action to redirect to the PayU OAuth URL.
        :rtype: dict
        :raise RedirectWarning: If the company's currency is not supported.
        """
        self.ensure_one()

        if self.code != 'payu':
            return super().action_start_onboarding(menu_id=menu_id)

        if self.company_id.currency_id.name not in payu_const.SUPPORTED_CURRENCIES:
            raise RedirectWarning(
                _("PayU is not available in your country; please use another payment provider."),
                self.env.ref('payment.action_payment_provider').id,
                _("Other Payment Providers"),
            )

        params = {
            'return_url': tools.urls.urljoin(self.get_base_url(), PayUController.OAUTH_RETURN_URL),
            'provider_id': self.id,
            'csrf_token': request.csrf_token(),
        }

        authorization_url = f'{payu_const.OAUTH_URL}/authorize?{urlencode(params)}'
        return {
            'type': 'ir.actions.act_url',
            'url': authorization_url,
            'target': 'self',
        }

    def _get_reset_values(self):
        """Override of `payment` to supply the provider-specific credential values to reset."""
        if self.code != 'payu':
            return super()._get_reset_values()

        # Reset the merchant credentials
        return {
            'payu_merchant_key': None,
            'payu_merchant_salt': None,
        }
