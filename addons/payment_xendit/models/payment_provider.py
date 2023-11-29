# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

import requests

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.payment_xendit import const


_logger = logging.getLogger(__name__)


class PaymentProvider(models.Model):
    _inherit = 'payment.provider'

    code = fields.Selection(
        selection_add=[('xendit', 'Xendit')], ondelete={'xendit': 'set default'}
    )
    xendit_api_key = fields.Char(string="Xendit API Key", groups='base.group_system')
    xendit_webhook_token = fields.Char(string="Xendit Callback Token", groups='base.group_system')

    # === BUSINESS METHODS ===#

    @api.model
    def _get_compatible_providers(self, *args, currency_id=None, **kwargs):
        """Override of `payment` to filter out Xendit for unsupported currencies"""
        providers = super()._get_compatible_providers(*args, currency_id=currency_id, **kwargs)

        currency = self.env['res.currency'].browse(currency_id)
        if currency and currency.name not in const.SUPPORTED_CURRENCIES:
            providers = providers.filtered(lambda p: p.code != 'xendit')

        return providers

    def _get_default_payment_method_codes(self):
        """ Override of `payment` to return the default payment method codes. """
        default_codes = super()._get_default_payment_method_codes()
        if self.code != 'xendit':
            return default_codes
        return const.DEFAULT_PAYMENT_METHODS_CODES

    def _xendit_make_request(self, api_obj, payload=None, endpoint_param=None, method='POST'):
        """ Make a request to Xendit API and return the JSON-formatted content of the response.

        Note: self.ensure_one()

        :param api_obj: Xendit object to be interacted with, will fetch the corresponding API URL
        :param dict payload: The payload of the request.
        :param endpoint_param: extra param of URL needed to supply the endpoint
        :param method: type of HTTP Request GET/POST mostly
        :return The JSON-formatted content of the response.
        :rtype: dict
        :raise ValidationError: If an HTTP error occurs.
        """
        self.ensure_one()

        auth = (self.xendit_api_key, '')
        url = const.API_URL_OBJ.get(api_obj)
        if not url:
            _logger.error("Invalid API object %s, typo or not registered", api_obj)
            return
        if endpoint_param:
            url = url.format(**endpoint_param)

        try:
            response = requests.request(method, url, json=payload, auth=auth)
            response.raise_for_status()
        except requests.exceptions.ConnectionError:
            _logger.exception("Unable to reach endpoint at %s", url)
            raise ValidationError("Xendit: " + _("Could not establish the connection to the API."))
        except requests.exceptions.HTTPError as err:
            error_message = err.response.json().get('message')
            _logger.exception(
                "Invalid API request at %s with data:\n%s", url, pprint.pformat(payload)
            )
            raise ValidationError(
                "Xendit: " + _(
                    "The communication with the API failed. Xendit gave us the following"
                    " information: '%s'", error_message
                )
            )
        return response.json()
