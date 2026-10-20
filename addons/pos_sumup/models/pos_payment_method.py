import logging

import requests

from odoo import _, fields, models
from odoo.exceptions import UserError
from odoo.tools import hash_sign

_logger = logging.getLogger(__name__)

SUMUP_API_URL = "https://api.sumup.com"


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    def _get_terminal_provider_selection(self):
        return super()._get_terminal_provider_selection() + [("sumup", "SumUp")]

    def _get_providers_with_terminals(self):
        return super()._get_providers_with_terminals() + ["sumup"]

    # SumUp
    sumup_api_key = fields.Char(
        string="SumUp API key",
        help="Used when connecting to SumUp: https://developer.sumup.com/tools/authorization/api-keys#create-an-api-key",
        copy=False,
        groups="base.group_erp_manager",
    )
    sumup_merchant_code = fields.Char(
        help="Short unique identifier for the merchant (e.g. MK10CL2A).",
    )

    def sumup_get_checkout_status(self, checkout_id: str, terminal_id: int | None = None):
        """Ask SumUp directly for the current status of a reader checkout.
        Used as a polling fallback for the initial payment, in case the
        SUMUP_LATEST_RESPONSE bus notification is missed."""
        self.ensure_one()
        terminal = self._get_payment_terminal(terminal_id)
        try:
            response = requests.get(
                f"{SUMUP_API_URL}/v0.1/merchants/{self.sumup_merchant_code}/readers/{terminal.sumup_terminal_id}/checkout/{checkout_id}",
                headers={"Authorization": f"Bearer {self.sudo().sumup_api_key}"},
                timeout=10,
            )
            response.raise_for_status()
        except requests.exceptions.RequestException:
            return False
        return response.json()

    def _sumup_resolve_transaction_id(self, client_transaction_id: str):
        """Resolve the real SumUp transaction id for a completed checkout.

        Neither the webhook notification nor the reader-checkout status endpoint
        provide it.
        """
        self.ensure_one()
        try:
            response = requests.get(
                f"{SUMUP_API_URL}/v2.1/merchants/{self.sumup_merchant_code}/transactions",
                headers={"Authorization": f"Bearer {self.sudo().sumup_api_key}"},
                params={"client_transaction_id": client_transaction_id},
                timeout=10,
            )
            response.raise_for_status()
        except requests.exceptions.RequestException:
            return False
        return response.json().get("id")

    def _sumup_notification_url(self, terminal):
        """Build the return_url passed to SumUp, carrying a signed reference to this
        payment method and its terminal so that the notification webhook can be routed
        back to the exact reader
        """
        self.ensure_one()
        token = hash_sign(
            self.sudo().env,
            "pos_sumup",
            {"payment_method_id": self.id, "terminal_id": terminal.id},
            expiration_hours=1,
        )
        return f"{self.get_base_url()}/pos_sumup/notification?token={token}"

    def sumup_pay(self, amount: float, terminal_id: int | None = None):
        self.ensure_one()
        terminal = self._get_payment_terminal(terminal_id)
        currency = self.journal_id.currency_id or self.company_id.currency_id
        minor_unit = currency.decimal_places
        minor_amount = round(amount * (10**minor_unit))
        try:
            response = requests.post(
                f"{SUMUP_API_URL}/v0.1/merchants/{self.sumup_merchant_code}/readers/{terminal.sumup_terminal_id}/checkout",
                headers={"Authorization": f"Bearer {self.sudo().sumup_api_key}"},
                json={
                    "total_amount": {
                        "currency": currency.name,
                        "minor_unit": minor_unit,
                        "value": minor_amount,
                    },
                    "return_url": self._sumup_notification_url(terminal),
                },
                timeout=10,
            )
        except requests.exceptions.RequestException:
            return {"error": {"message": _("Could not reach SumUp. Please try again.")}}

        if not response.ok:
            try:
                error_detail = response.json().get("errors").get("detail")
            except ValueError:
                error_detail = None
            return {
                "error": {
                    "status_code": response.status_code,
                    "message": error_detail or response.text,
                },
            }

        return response.json()

    def sumup_refund(self, amount: float, client_transaction_id: str):
        self.ensure_one()
        original_payment = client_transaction_id and self.env["pos.payment"].search(
            [
                ("transaction_id", "=", client_transaction_id),
                ("payment_method_id.payment_provider", "=", "sumup"),
            ],
            limit=1,
        )
        if not original_payment:
            raise UserError(_("SumUp can't refund a transaction not paid with SumUp."))
        currency = self.journal_id.currency_id or self.company_id.currency_id
        amount = abs(round(amount * (10**currency.decimal_places)))
        transaction_id = self._sumup_resolve_transaction_id(client_transaction_id)
        if not transaction_id:
            raise UserError(
                _("Couldn't find a transaction corresponding to this payment."),
            )
        response = requests.post(
            f"{SUMUP_API_URL}/v1.0/merchants/{self.sumup_merchant_code}/payments/{transaction_id}/refunds",
            headers={"Authorization": f"Bearer {self.sudo().sumup_api_key}"},
            json={
                "amount": amount,
            },
            timeout=10,
        )
        return response.json()

    def sumup_cancel(self, terminal_id: int | None = None):
        self.ensure_one()
        terminal = self._get_payment_terminal(terminal_id)
        try:
            response = requests.post(
                f"{SUMUP_API_URL}/v0.1/merchants/{self.sumup_merchant_code}/readers/{terminal.sumup_terminal_id}/terminate",
                headers={"Authorization": f"Bearer {self.sudo().sumup_api_key}"},
                json={
                    "return_url": self._sumup_notification_url(terminal),
                },
                timeout=10,
            )
            response.raise_for_status()
        except requests.exceptions.RequestException:
            raise UserError(_("Could not reach SumUp. Please try again."))
        return True
