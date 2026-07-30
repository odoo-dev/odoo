# Part of Odoo. See LICENSE file for full copyright and licensing details.

import pprint
import socket
from urllib.parse import quote_plus, urlparse

from odoo import http
from odoo.http import request

from odoo.addons.payment.logging import get_payment_logger
from odoo.addons.payment_payfast import const

_logger = get_payment_logger(__name__)


class PayfastController(http.Controller):
    _return_url = "/payment/payfast/return"
    _cancel_url = "/payment/payfast/cancel"
    _notify_url = "/payment/payfast/notify"

    @http.route(_return_url, type="http", auth="public", methods=["GET"])
    def payfast_return_from_checkout(self, **data):
        """Handle the customer's redirection back to Odoo after a successful payment.

        Note: the data received here is not signed and must never be trusted to confirm a
        payment; it is only used to redirect the customer to the right status page. The actual
        confirmation happens asynchronously via the ITN on `_notify_url`.

        :param dict data: The un-trusted data forwarded by Payfast as query params.
        """
        _logger.info("Handling redirection from Payfast with data:\n%s", pprint.pformat(data))
        return request.redirect("/payment/status")

    @http.route(_cancel_url, type="http", auth="public", methods=["GET"])
    def payfast_cancel_from_checkout(self, **data):
        """Handle the customer's redirection back to Odoo after cancelling the payment.

        :param dict data: The un-trusted data forwarded by Payfast as query params.
        """
        _logger.info("Handling cancellation from Payfast with data:\n%s", pprint.pformat(data))
        return request.redirect("/payment/status")

    @http.route(_notify_url, type="http", auth="public", methods=["POST"], csrf=False)
    def payfast_notify(self, **data):
        """Process the ITN (Instant Transaction Notification) sent by Payfast.

        Performs the 4 security checks required by Payfast before confirming the transaction:
        https://developers.payfast.co.za/docs#step_4_confirm_payment
        1. Signature validation.
        2. Source IP/host validation.
        3. Payment data validation (amount match).
        4. Server-to-server confirmation with Payfast.

        Always returns an HTTP 200 to acknowledge receipt and avoid unnecessary retries, even
        when a check fails; failures are only logged for investigation.

        :param dict data: The notification data sent by Payfast.
        :return: An empty string to acknowledge the notification.
        :rtype: str
        """
        _logger.info("Notification received from Payfast with data:\n%s", pprint.pformat(data))

        tx_sudo = request.env["payment.transaction"].sudo()._search_by_reference("payfast", data)
        if not tx_sudo:
            return self._payfast_acknowledge()

        provider_sudo = tx_sudo.provider_id

        # Check 1: signature.
        if not self._verify_signature(data, provider_sudo):
            _logger.warning(
                "Received notification with invalid signature for transaction %s.",
                tx_sudo.reference,
            )
            return self._payfast_acknowledge()

        # Check 2: source host.
        if not self._verify_source():
            _logger.warning(
                "Received notification from an untrusted source for transaction %s.",
                tx_sudo.reference,
            )
            return self._payfast_acknowledge()

        # Check 3: payment data (amount) matches the transaction.
        if not self._verify_amount(data, tx_sudo):
            _logger.warning(
                "Received notification with a mismatched amount for transaction %s.",
                tx_sudo.reference,
            )
            return self._payfast_acknowledge()

        # Check 4: server-to-server confirmation with Payfast.
        param_string = self._build_param_string(data)
        if not provider_sudo._payfast_validate_with_server(param_string):
            _logger.warning(
                "Payfast could not confirm the notification data for transaction %s.",
                tx_sudo.reference,
            )
            return self._payfast_acknowledge()

        # All checks passed; it is now safe to process the notification data.
        tx_sudo._record(data)
        return self._payfast_acknowledge()

    @staticmethod
    def _payfast_acknowledge():
        """Return the HTTP 200 response expected by Payfast to stop notification retries.

        :return: An empty string.
        :rtype: str
        """
        return ""

    @staticmethod
    def _verify_signature(data, provider_sudo):
        """Check that the signature included in the notification matches the expected one.

        :param dict data: The notification data, including the `signature` field.
        :param recordset provider_sudo: The provider handling the transaction, as a sudo record.
        :return: Whether the signature is valid.
        :rtype: bool
        """
        received_signature = data.get("signature", "")
        expected_signature = provider_sudo._payfast_generate_signature(data, incoming=True)
        return received_signature == expected_signature

    @staticmethod
    def _verify_source():
        """Check that the notification's `Referer` header resolves to a known Payfast host.

        Mirrors Payfast's own reference implementation: the `Referer`'s host must match one of
        the known ITN hostnames, or one of the IP addresses those hostnames currently resolve to.
        https://developers.payfast.co.za/docs#step_4_confirm_payment

        :return: Whether the referrer is a valid Payfast host.
        :rtype: bool
        """
        referer_host = urlparse(request.httprequest.headers.get("Referer", "")).hostname
        if not referer_host:
            return False

        valid_hosts = set(const.VALID_NOTIFICATION_HOSTS)
        for host in const.VALID_NOTIFICATION_HOSTS:
            try:
                valid_hosts.update(socket.gethostbyname_ex(host)[2])
            except OSError:
                continue  # DNS resolution failed; fall back on the hostname-only checks.

        return referer_host in valid_hosts

    @staticmethod
    def _verify_amount(data, tx_sudo):
        """Check that the amount received in the notification matches the transaction amount.

        :param dict data: The notification data, including the `amount_gross` field.
        :param recordset tx_sudo: The transaction referenced in the notification, as a sudo record.
        :return: Whether the amounts match, within a tolerance of ZAR 0.01.
        :rtype: bool
        """
        try:
            amount_gross = float(data.get("amount_gross", "0.0"))
        except (TypeError, ValueError):
            return False
        return abs(amount_gross - tx_sudo.amount) <= 0.01

    @staticmethod
    def _build_param_string(data):
        """Rebuild the url-encoded parameter string from the notification data, in the order the
        fields were received, as required for the server-to-server validation call.

        :param dict data: The notification data.
        :return: The url-encoded parameter string.
        :rtype: str
        """
        return "&".join(f"{key}={quote_plus(str(value))}" for key, value in data.items())
