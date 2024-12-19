# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import pprint
from datetime import timedelta

import requests
from werkzeug import urls

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError

from odoo.addons.payment_paymob import const
from odoo.addons.payment_paymob.controllers.main import PaymobController


_logger = logging.getLogger(__name__)


class PaymentProvider(models.Model):
    _inherit = 'payment.provider'

    code = fields.Selection(
        selection_add=[('paymob', "Paymob")], ondelete={'paymob': 'set default'}
    )
    paymob_account_country_id = fields.Many2one(
        string="Paymob Country",
        help="The country of the Paymob account",
        comodel_name='res.country',
        compute='_compute_paymob_account_country',
        inverse='_inverse_paymob_account_country',
        domain=f'[("code", "in", {list(const.COUNTRY_CURRENCY_MAPPING.keys())})]',
    )
    paymob_public_key = fields.Char(string="Paymob Public Key", required_if_provider='paymob')
    paymob_secret_key = fields.Char(
        string="Paymob Secret Key",
        required_if_provider='paymob',
        groups='base.group_system',
    )
    paymob_integration_ids = fields.Many2many(
        string="Integration IDs",
        help="Integration IDs configured on the paymob portal",
        comodel_name="payment.method.paymob",
        relation='payment_provider_payment_method_paymob_rel',
    )

    # ==== CONSTRAINT METHODS === #

    @api.constrains('available_currency_ids', 'state')
    def _limit_available_country_currency_ids(self):
        for provider in self.filtered(lambda p: p.code == 'paymob'):
            if len(provider.available_currency_ids) > 1 and provider.state != 'disabled':
                raise ValidationError(_("Only one currency can be selected by Paymob account."))

    # === COMPUTE METHODS === #

    @api.depends('available_currency_ids')
    def _compute_paymob_account_country(self):
        for provider in self.filtered(lambda p: p.code == 'paymob'):
            provider.paymob_account_country_id = self.env['res.country'].search(
                [('code', '=', provider._get_country_from_currency())], limit=1)

    def _inverse_paymob_account_country(self):
        for provider in self.filtered(lambda p: p.code == 'paymob'):
            provider.available_currency_ids = self.env['res.currency'].with_context(
                active_test=False,
            ).search([('name', '=', provider._get_paymob_account_currency())], limit=1)

    # === BUSINESS METHODS === #

    def _paymob_make_request(self, endpoint, data=None):
        """ Make a request to Paymob API at the specified endpoint.

        Note: self.ensure_one()

        :param str endpoint: The endpoint to be reached by the request.
        :param dict data: The string payload of the request.
        :return: The JSON-formatted content of the response.
        :rtype: dict
        :raise ValidationError: If an HTTP error occurs.
        """
        url = self._paymob_get_api_url() + endpoint
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Token {self.paymob_secret_key}'
        }
        try:
            response = requests.post(url, headers=headers, json=data, timeout=10)
            try:
                response.raise_for_status()
            except requests.exceptions.HTTPError:
                payload = data or json_payload
                # Paymob errors https://developer.paymob.com/api/rest/reference/orders/v2/errors/
                _logger.exception(
                    "Invalid API request at %s with data:\n%s", url, pprint.pformat(payload)
                )
                msg = response.json().get('message', '')
                raise ValidationError(
                    "Paymob: " + _("The communication with the API failed. Details: %s", msg)
                )
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            _logger.exception("Unable to reach endpoint at %s", url)
            raise ValidationError("Paymob: " + _("Could not establish the connection to the API."))
        return response.json()

    # === BUSINESS METHODS - GETTERS === #
    def _get_country_from_currency(self):
        country_code = [
            country for country, currency
            in const.COUNTRY_CURRENCY_MAPPING.items()
            if currency == self.available_currency_ids.name
        ]
        if country_code:
            return country_code[0]

    def _get_paymob_account_currency(self):
        return const.COUNTRY_CURRENCY_MAPPING[self.paymob_account_country_id.code]

    def _get_supported_currencies(self):
        """ Override of `payment` to return the supported currencies. """
        supported_currencies = super()._get_supported_currencies()
        if self.code == 'paymob':
            if self.paymob_account_country_id:
                supported_currencies = supported_currencies.filtered(
                    lambda c: c.name == self._get_paymob_account_currency()
                )
            else:
                supported_currencies = supported_currencies.filtered(
                    lambda c: c.name in const.SUPPORTED_CURRENCIES
                )
        return supported_currencies[0]

    def _paymob_get_api_url(self):
        """ Return the API URL according to the provider country.

        Note: self.ensure_one()

        :return: The API URL
        :rtype: str
        """
        self.ensure_one()
        url = f"https://{const.COUNTRY_API_MAPPING[self.paymob_account_country_id.code]}.paymob.com"
        return url

    def _get_default_payment_method_codes(self):
        """ Override of `payment` to return the default payment method codes. """
        default_codes = super()._get_default_payment_method_codes()
        if self.code != 'paymob':
            return default_codes
        return const.DEFAULT_PAYMENT_METHOD_CODES

    def _paymob_get_inline_form_values(self, currency=None):
        """ Return a serialized JSON of the required values to render the inline form.

        Note: `self.ensure_one()`

        :param res.currency currency: The transaction currency.
        :return: The JSON serial of the required values to render the inline form.
        :rtype: str
        """
        inline_form_values = {
            'provider_id': self.id,
            'client_id': self.paymob_client_id,
            'currency_code': currency and currency.name,
        }
        return json.dumps(inline_form_values)


class PaymobPaymentMethod(models.Model):
    _name = 'payment.method.paymob'
    _description = "Paymob Payment Method"

    name = fields.Char(string="Integration ID", required=True)
    provider_ids = fields.Many2many(
        comodel_name='payment.provider',
        relation='payment_provider_payment_method_paymob_rel',
        string="Providers",
        help="The list of providers supporting this payment method.",
    )

    @api.model
    def name_create(self, name):
        existing_integration = self.search([('name', '=ilike', name.strip())], limit=1)
        if existing_integration:
            return existing_integration.id, existing_integration.display_name
        return super().name_create(name)
