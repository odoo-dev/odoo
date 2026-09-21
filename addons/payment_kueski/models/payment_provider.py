# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64

from odoo import api, fields, models
from odoo.tools.urls import urljoin

from odoo.addons.payment_kueski import const


class PaymentProvider(models.Model):
    _inherit = "payment.provider"

    code = fields.Selection(
        selection_add=[("kueski", "Kueski Pay")], ondelete={"kueski": "set default"}
    )
    kueski_merchant_id = fields.Char(
        string="Kueski Merchant ID", required_if_provider="kueski", copy=False
    )
    kueski_key_id = fields.Many2one(
        string="Kueski Private Key",
        help="The RSA private key whose public key is registered with Kueski.",
        comodel_name="certificate.key",
        domain=[("public", "=", False)],
        required_if_provider="kueski",
        copy=False,
        groups="base.group_system",
    )
    kueski_public_key = fields.Text(
        string="Kueski Public Key",
        help="The PEM-encoded public key to send to Kueski.",
        compute="_compute_kueski_public_key",
        groups="base.group_system",
    )

    # === COMPUTE METHODS === #

    @api.depends("kueski_key_id")
    def _compute_kueski_public_key(self):
        for provider in self:
            key = provider.kueski_key_id
            provider.kueski_public_key = (
                key._get_public_key_bytes(encoding="pem", formatting="").decode()
                if key and not key.loading_error
                else False
            )

    # === ACTION METHODS === #

    def action_kueski_generate_key(self):
        """Generate the RSA key pair whose public key must be sent to Kueski."""
        self.ensure_one()
        self.kueski_key_id = self.env["certificate.key"]._generate_rsa_private_key(
            self.company_id, name=f"Kueski Pay - {self.company_id.name}"
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

    # === REQUEST HELPERS === #

    def _build_request_url(self, endpoint, **kwargs):
        """Override of `payment` to build the request URL."""
        if self.code != "kueski":
            return super()._build_request_url(endpoint, **kwargs)
        return urljoin(const.PRODUCTION_API_URL if self.is_live else const.TEST_API_URL, endpoint)

    def _build_request_headers(self, method, endpoint, payload, **kwargs):
        """Override of `payment` to sign the request as per "Authorization and Signing"."""
        if self.code != "kueski":
            return super()._build_request_headers(method, endpoint, payload, **kwargs)

        url = self._build_request_url(endpoint, **kwargs)
        signed_data = f"{self.kueski_merchant_id}|{method}|{url}|{payload or '{}'}"
        headers = {
            "Content-Type": "application/json",
            "X-Merchant-Id": self.kueski_merchant_id,
            "X-Signature": base64.urlsafe_b64encode(
                self.kueski_key_id._sign(
                    base64.urlsafe_b64encode(signed_data.encode()), formatting=""
                )
            ).decode(),
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
