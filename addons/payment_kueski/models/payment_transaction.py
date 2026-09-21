# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
from urllib.parse import urlencode

from odoo import api, models
from odoo.exceptions import ValidationError
from odoo.tools.urls import urljoin

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment.logging import get_payment_logger
from odoo.addons.payment_kueski import const
from odoo.addons.payment_kueski import utils as kueski_utils
from odoo.addons.payment_kueski.controllers.main import KueskiController

_logger = get_payment_logger(__name__)


class PaymentTransaction(models.Model):
    _inherit = "payment.transaction"

    def _get_specific_rendering_values(self, processing_values):
        """Override of `payment` to create a payment intent and return its redirect values.

        :param dict processing_values: The generic processing values of the transaction.
        :return: The dict of provider-specific rendering values.
        :rtype: dict
        """
        if self.provider_code != "kueski":
            return super()._get_specific_rendering_values(processing_values)

        # Kueski appends nothing to the callback URLs, so they carry the reference themselves.
        return_url_params = {
            "tx_ref": self.reference,
            "access_token": payment_utils.generate_access_token(self.reference),
        }
        return_url = (
            f"{urljoin(self.provider_id.get_base_url(), KueskiController._return_url)}"
            f"?{urlencode(return_url_params)}"
        )
        payload = {
            "order_id": self.reference,
            "description": self.reference,
            "amount": {"amount": f"{self.amount:.2f}", "currency": self.currency_id.name},
            "capture_method": const.CAPTURE_METHOD,
            "billing": self._kueski_prepare_billing(),
            **self._kueski_prepare_order_values(),
            "callbacks": dict.fromkeys(
                ("on_success", "on_reject", "on_canceled", "on_failed"), return_url
            ),
        }
        try:
            intent_data = self._send_api_request(
                "POST",
                "/v2/payment_intents",
                data=json.dumps(payload),
                idempotency_key=payment_utils.generate_idempotency_key(self),
            )
        except ValidationError as error:
            self._set_error(str(error))
            return {}

        self.provider_reference = intent_data["payment_intent_id"]
        redirect_url = intent_data["redirect_url"]
        return {
            "api_url": redirect_url,
            "http_method": "get",
            "url_params": payment_utils.extract_url_params(redirect_url),
        }

    def _kueski_prepare_billing(self):
        """Return the billing data of the transaction's partner.

        :return: The billing payload, as described in Kueski's "Billing Model".
        :rtype: dict
        """
        partner = self.partner_id
        return kueski_utils.drop_empty_values({
            "business": {"name": self.partner_name, "tax_id": partner.vat},
            "address": kueski_utils.format_address(partner),
            "phone_number": self.partner_phone,
            "email": self.partner_email,
        })

    def _kueski_prepare_order_values(self):
        """Return the items and shipping of the related sales order, if any.

        :return: The `items` and `shipping` of the payload.
        :rtype: dict
        """
        if "sale_order_ids" not in self._fields:  # The module `sale` is not installed.
            return {}
        order = self.sale_order_ids[:1]
        if not order:
            return {}

        items = []
        product_lines = order.order_line.filtered(
            lambda line: not line.display_type and not line.is_downpayment and line.price_total > 0
        )
        for line in product_lines:
            # Kueski only accepts integer quantities, so a fractional one is sent as a single unit.
            quantity = line.product_uom_qty if line.product_uom_qty.is_integer() else 1
            items.append(
                kueski_utils.drop_empty_values({
                    "name": line.product_id.name,
                    "description": line.name,
                    "quantity": int(quantity),
                    "price": f"{line.price_total / quantity:.2f}",
                    "tax": f"{line.price_tax / quantity:.2f}",
                    "currency": order.currency_id.name,
                    "sku": line.product_id.default_code,
                })
            )

        shipping_partner = order.partner_shipping_id
        first_name, last_name = payment_utils.split_partner_name(shipping_partner.name)
        shipping = kueski_utils.drop_empty_values({
            "name": {"first": first_name, "last": last_name},
            "address": kueski_utils.format_address(shipping_partner),
            "phone_number": shipping_partner.phone,
            "email": shipping_partner.email,
        })
        return {"items": items, "shipping": shipping}

    @api.model
    def _extract_reference(self, provider_code, payment_data):
        """Override of `payment` to extract the reference from the payment data."""
        if provider_code != "kueski":
            return super()._extract_reference(provider_code, payment_data)
        return payment_data.get("order_id")

    def _apply_updates(self, payment_data):
        """Override of `payment` to update the transaction based on the payment data."""
        if self.provider_code != "kueski":
            return super()._apply_updates(payment_data)

        status = payment_data.get("status")
        if status in const.PAYMENT_STATUS_MAPPING["pending"]:
            self._set_pending()
        elif status in const.PAYMENT_STATUS_MAPPING["done"]:
            self._set_done()
        elif status in const.PAYMENT_STATUS_MAPPING["cancel"]:
            self._set_canceled()
        elif status in const.PAYMENT_STATUS_MAPPING["error"]:
            self._set_error(
                self.env._(
                    "Kueski declined the payment (reason: %(reason)s).",
                    reason=payment_data.get("status_reason"),
                )
            )
        else:
            _logger.warning(
                "Received data with invalid payment status (%s) for transaction %s.",
                status,
                self.reference,
            )
            self._set_error(self.env._("Unknown payment status: %s", status))

    def _extract_amount_data(self, payment_data):
        """Override of `payment` to extract the amount and currency from the payment data."""
        if self.provider_code != "kueski":
            return super()._extract_amount_data(payment_data)

        amount_data = payment_data["amount"]
        return {"amount": float(amount_data["amount"]), "currency_code": amount_data["currency"]}
