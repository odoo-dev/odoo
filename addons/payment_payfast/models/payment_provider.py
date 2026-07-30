# Part of Odoo. See LICENSE file for full copyright and licensing details.

import hashlib
from datetime import datetime, timezone
from urllib.parse import quote_plus

import requests

from odoo import api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.payment.logging import get_payment_logger
from odoo.addons.payment_payfast import const

_logger = get_payment_logger(__name__)


class PaymentProvider(models.Model):
    _inherit = "payment.provider"

    code = fields.Selection(
        selection_add=[("payfast", "Payfast")], ondelete={"payfast": "set default"}
    )
    payfast_merchant_id = fields.Char(
        string="Payfast Merchant ID", required_if_provider="payfast", copy=False
    )
    payfast_merchant_key = fields.Char(
        string="Payfast Merchant Key",
        required_if_provider="payfast",
        copy=False,
        groups="base.group_system",
    )
    payfast_passphrase = fields.Char(
        string="Payfast Passphrase",
        help="Required for Recurring Billing (subscriptions/tokenization). Set under Settings ->"
        " Recurring Billing on your Payfast (Sandbox) dashboard.",
        copy=False,
        groups="base.group_system",
    )

    # === CONSTRAINT METHODS === #

    @api.constrains("available_currency_ids")
    def _check_available_currency_ids(self):
        for provider in self.filtered(lambda p: p.code == "payfast"):
            if provider.available_currency_ids and any(
                cur.name not in const.SUPPORTED_CURRENCIES
                for cur in provider.available_currency_ids
            ):
                raise ValidationError(provider.env._("Only ZAR is supported by Payfast."))

    # === CRUD METHODS === #

    def _get_default_payment_method_codes(self):
        """Override of `payment` to return the default payment method codes."""
        self.ensure_one()
        if self.code != "payfast":
            return super()._get_default_payment_method_codes()
        return const.DEFAULT_PAYMENT_METHOD_CODES

    # === COMPUTE METHODS === #

    def _get_supported_currencies(self):
        """Override of `payment` to return the supported currencies."""
        supported_currencies = super()._get_supported_currencies()
        if self.code == "payfast":
            supported_currencies = supported_currencies.filtered(
                lambda c: c.name in const.SUPPORTED_CURRENCIES
            )
        return supported_currencies

    def _compute_feature_support_fields(self):
        """Override of `payment` to enable additional features."""
        super()._compute_feature_support_fields()
        self.filtered(lambda p: p.code == "payfast").support_tokenization = True

    # === BUSINESS METHODS === #

    def _payfast_get_api_url(self):
        """Return the base URL to use (live or sandbox) depending on the provider's state.

        Note: self.ensure_one()

        :return: The base Payfast URL.
        :rtype: str
        """
        self.ensure_one()
        return const.PAYFAST_URLS["live" if self.is_live else "test"]

    def _payfast_generate_signature(self, values, incoming=False):
        """Generate the MD5 signature for a given set of values.

        The parameters must be ordered as they appear on the payment/notification form, and
        the passphrase (if set) must be appended at the end before hashing.
        https://developers.payfast.co.za/docs#step_2_signature

        :param dict values: The values to sign.
        :param bool incoming: Whether the values come from an incoming ITN notification (in which
                               case all posted keys are used, in the order they were received,
                               blank values included) rather than an outgoing payment request
                               (in which blank values are omitted).
        :return: The MD5 signature.
        :rtype: str
        """
        self.ensure_one()
        if incoming:
            ordered_keys = [k for k in values if k != "signature"]
        else:
            ordered_keys = [k for k in const.SIGNATURE_FIELDS_ORDER if k in values]

        pairs = []
        for key in ordered_keys:
            value = values.get(key)
            if not incoming and value in (None, ""):
                continue
            pairs.append(f"{key}={quote_plus(str(value).strip())}")
        param_string = "&".join(pairs)

        if self.payfast_passphrase:
            param_string += f"&passphrase={quote_plus(self.payfast_passphrase.strip())}"
        return hashlib.md5(param_string.encode()).hexdigest()  # noqa: S324

    def _payfast_validate_with_server(self, param_string):
        """Confirm the ITN data by posting it back to Payfast's validation endpoint.

        https://developers.payfast.co.za/docs#step_4_confirm_payment

        :param str param_string: The url-encoded notification data (without the signature check
                                  already stripped as needed).
        :return: Whether Payfast confirmed the data as valid.
        :rtype: bool
        """
        self.ensure_one()
        url = f"{self._payfast_get_api_url()}/eng/query/validate"
        try:
            response = requests.post(
                url,
                data=param_string,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10,
            )
            response.raise_for_status()
        except requests.exceptions.RequestException:
            _logger.exception("Unable to reach Payfast to validate the notification data.")
            return False
        return response.text.strip() == "VALID"

    def _payfast_generate_api_signature(self, values):
        """Generate the MD5 signature for a request to Payfast's account-level API.

        Unlike `_payfast_generate_signature`, this covers the headers, query params and body of
        an API request together: every value is merged and sorted alphabetically by key, and the
        passphrase (if set) is merged in as a regular `passphrase` key before sorting, instead of
        being appended at the end.
        https://developers.payfast.co.za/api

        :param dict values: The merged headers, query params and body values to sign.
        :return: The MD5 signature.
        :rtype: str
        """
        self.ensure_one()
        signed_values = dict(values)
        if self.payfast_passphrase:
            signed_values["passphrase"] = self.payfast_passphrase.strip()

        param_string = "&".join(
            f"{key}={quote_plus(str(signed_values[key]).strip())}" for key in sorted(signed_values)
        )
        return hashlib.md5(param_string.encode()).hexdigest()  # noqa: S324

    def _payfast_send_api_request(self, method, endpoint, json_body=None):
        """Send a request to Payfast's account-level API (refunds, subscriptions, ...).

        This is a separate, JSON-based API from the checkout/ITN flow above, authenticated with
        its own header-based signature scheme. When not in live mode, a `testing=true` query
        param is appended (as Payfast's own SDK does) so sandbox credentials are accepted; it is
        deliberately left out of the signature, matching the SDK's behavior.
        https://developers.payfast.co.za/api

        :param str method: The HTTP method of the request.
        :param str endpoint: The endpoint to reach, e.g. `refunds/<pf_payment_id>`.
        :param dict json_body: The JSON-serializable body of the request, if any.
        :return: The response's JSON content.
        :rtype: dict
        :raise ValidationError: If the request could not be made, or Payfast returned an error.
        """
        self.ensure_one()
        headers = {
            "merchant-id": self.payfast_merchant_id,
            "version": const.PAYFAST_API_VERSION,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S%z"),
        }
        headers["signature"] = self._payfast_generate_api_signature({
            **headers,
            **(json_body or {}),
        })

        try:
            response = requests.request(
                method,
                f"{const.PAYFAST_API_URL}/{endpoint}",
                params={"testing": "true"} if not self.is_live else None,
                json=json_body,
                headers=headers,
                timeout=10,
            )
            response.raise_for_status()
        except requests.exceptions.HTTPError as e:
            _logger.exception("Payfast's API returned an error:\n%s", response.text)
            raise ValidationError(
                self.env._("Payfast's API returned an error: %(error)s", error=response.text)
            ) from e
        except requests.exceptions.RequestException as e:
            _logger.exception("Unable to reach Payfast's API.")
            raise ValidationError(
                self.env._("Could not communicate with Payfast's API: %(error)s", error=e)
            ) from e
        return response.json()
