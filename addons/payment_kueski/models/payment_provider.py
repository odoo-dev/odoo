# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import hashlib
import time

from odoo import fields, models
from odoo.tools.urls import urljoin

from odoo.addons.mail.tools import jwt
from odoo.addons.payment_kueski import const


class PaymentProvider(models.Model):
    _inherit = "payment.provider"

    code = fields.Selection(
        selection_add=[("kueski", "Kueski Pay")], ondelete={"kueski": "set default"}
    )
    kueski_api_key = fields.Char(
        string="Kueski API Key",
        required_if_provider="kueski",
        copy=False,
        groups="base.group_system",
    )
    kueski_api_secret = fields.Char(
        string="Kueski API Secret",
        required_if_provider="kueski",
        copy=False,
        groups="base.group_system",
    )

    # === BUSINESS METHODS === #

    def _get_supported_currencies(self):
        """Override of `payment` to return MXN as the only supported currency."""
        if self.code != "kueski":
            return super()._get_supported_currencies()
        return (
            super()
            ._get_supported_currencies()
            .filtered(lambda c: c.name == const.SUPPORTED_CURRENCY)
        )

    def _get_default_payment_method_codes(self):
        """Override of `payment` to return the default payment method codes."""
        self.ensure_one()
        if self.code != "kueski":
            return super()._get_default_payment_method_codes()
        return const.DEFAULT_PAYMENT_METHOD_CODES

    def _kueski_generate_token(self):
        """Return a JWT with the claims of Kueski's "JWT Authentication", signed with the secret."""
        self.ensure_one()
        iat = int(time.time())
        claims = {
            "public_key": self.kueski_api_key,
            "iat": iat,
            "jti": hashlib.sha256(f"{self.kueski_api_secret}:{iat}".encode()).hexdigest(),
        }
        # mail's JWT helper expects the key base64url-encoded.
        key = base64.urlsafe_b64encode(self.kueski_api_secret.encode()).decode()
        return jwt.sign(claims, key, 300, jwt.Algorithm.HS256)

    # === REQUEST HELPERS === #

    def _build_request_url(self, endpoint, **kwargs):
        """Override of `payment` to build the request URL."""
        if self.code != "kueski":
            return super()._build_request_url(endpoint, **kwargs)
        return urljoin(const.PRODUCTION_API_URL if self.is_live else const.TEST_API_URL, endpoint)

    def _build_request_headers(self, method, endpoint, payload, **kwargs):
        """Override of `payment` to authenticate the request with a JWT."""
        if self.code != "kueski":
            return super()._build_request_headers(method, endpoint, payload, **kwargs)

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._kueski_generate_token()}",
        }
        if idempotency_key := kwargs.get("idempotency_key"):
            headers["Idempotency-Key"] = idempotency_key
        return headers

    def _parse_response_content(self, response, **kwargs):
        """Override of `payment` to extract the payment intent from the JSend response."""
        if self.code != "kueski":
            return super()._parse_response_content(response, **kwargs)
        return response.json()["data"]["payment_intent"]

    def _parse_response_error(self, response):
        """Override of `payment` to extract the error message from the JSend response."""
        if self.code != "kueski":
            return super()._parse_response_error(response)
        return response.json().get("message", "")
