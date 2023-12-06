import requests
import logging
from odoo import _, api, fields, models
from odoo.addons.payment_xendit.const import SUPPORTED_CURRENCIES, API_URL_OBJ, DEFAULT_PAYMENT_METHODS_CODES
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


class PaymentProvider(models.Model):
    _inherit = "payment.provider"

    code = fields.Selection(
        selection_add=[('xendit', 'Xendit')],
        ondelete={'xendit': 'set default'}
    )

    xendit_api_key = fields.Char("Xendit API Key", groups="base.group_system")
    xendit_webhook_token = fields.Char("Xendit Callback Token", groups="base.group_system")

    def _xendit_make_request(self, api_obj, payload=None, endpoint_param=None, method='POST'):
        """ All API requests to xendit to be done here. Error handling for most issues will be done here

        :param api_obj: Xendit object to be interacted with, will fetch the corresponding API URL
        :param payload: data to be passed if POST request is done
        :param endpoint_param: extra param of URL needed to supply the endpoint
        :param method: type of HTTP Request GET/POST mostly

        :return Response object in dictionary format
        """
        auth = (self.xendit_api_key, '')
        url = API_URL_OBJ.get(api_obj)

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
            raise ValidationError("Xendit: " + _("Could not establish connection to the API"))
        except requests.exceptions.HTTPError as err:
            msg = err.response.json().get('message')
            _logger.exception(
                "Invalid API request at %s with data %s: %s. Error message: %s", url, payload, err.response.text, msg
            )
            raise ValidationError("Xendit: Communication with API failed. Message: %s" % msg)
        return response.json()

    @api.model
    def _get_compatible_providers(self, *args, currency_id=None, **kwargs):
        """Override of `payment` to filter out Xendit for unsupported currencies"""
        providers = super()._get_compatible_providers(*args, currency_id=currency_id, **kwargs)

        currency = self.env['res.currency'].browse(currency_id)
        if currency and currency.name not in SUPPORTED_CURRENCIES:
            providers = providers.filtered(lambda p: p.code != 'xendit')

        return providers

    def _get_default_payment_method_codes(self):
        """ Override of `payment` to return the default payment method codes. """
        default_codes = super()._get_default_payment_method_codes()
        if self.code != 'xendit':
            return default_codes
        return DEFAULT_PAYMENT_METHODS_CODES
