from datetime import datetime, timezone
import logging
import uuid

import requests

from odoo import fields, models

_logger = logging.getLogger(__name__)

TIMEOUT = 10
WORLDLINE_INTEGRATOR_ID = "TO GET FROM WORLDLINE"  # TODO: TO GET FROM WORLDLINE
WORLDLINE_BEARER_TOKEN = "TO GET FROM WORLDLINE"  # TODO: TO GET FROM WORLDLINE


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    def _get_terminal_provider_selection(self):
        # "worldline_cloud" (not "worldline"): enterprise/pos_iot_worldline already claims the
        # "worldline" key for its IoT-box based integration, and both this module's JS payment
        # interface and the core provider-selection list would collide with it under that key.
        return super()._get_terminal_provider_selection() + [("worldline_cloud", "Worldline")]

    def _allowed_actions_in_self_order(self):
        return super()._allowed_actions_in_self_order() + ["worldline_create_payment", "worldline_create_refund"]

    worldline_terminal_id = fields.Char("Worldline Terminal ID")
    worldline_merchant_id = fields.Char("Worldline Merchant ID")
    test_mode = fields.Boolean("Test Mode", default=False, help="If enabled, the payment method will use the Worldline test environment.")

    worldline_api_url = fields.Char("Worldline URL", compute="_compute_worldline_api_url", help="The base URL for the Worldline API.")
    worldline_webhook_url = fields.Char("Worldline Webhook URL", compute="_compute_worldline_webhook_url", help="The URL that Worldline will call to notify the POS of payment status changes.")
    worldline_local_test_url = fields.Char("Worldline Local Test URL", help="Dev/testing only: if set, requests are sent here instead of the real Worldline endpoints. Point this at the local test.py stand-in server, e.g. http://127.0.0.1:8090.")

    def _compute_worldline_api_url(self):
        for record in self:
            if record.worldline_local_test_url:
                record.worldline_api_url = record.worldline_local_test_url
            elif record.test_mode:
                record.worldline_api_url = "https://api.terminal.iacc.global.worldline-solutions.com"
            else:
                record.worldline_api_url = "https://api.terminal.global.worldline-solutions.com"

    def _compute_worldline_webhook_url(self):
        for record in self:
            record.worldline_webhook_url = f"{record.get_base_url()}/pos_worldline/webhook"

    def _get_worldline_transaction_json(self, transaction_type: str, amount: float, currency, payment_uuid: str, pos_session_id: int, original_payment_id: str | None = None):
        self.ensure_one()

        # ExchangeIdentification doubles as the idempotency key: it must be a fresh UUID on every
        # request, and CreationDateTime/TransactionDateTime must reflect when the request is sent.
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"

        payment_transaction = {
            "TransactionType": transaction_type,  # CardPayment or Refund
            "TransactionIdentification": {
                "TransactionDateTime": now,
                # pos_session_id is smuggled in alongside the payment uuid so the webhook
                # controller can find its way back to the right pos.session/bus channel
                # when Worldline calls back with the result (see _worldline_send_notification).
                "TransactionReference": f"{payment_uuid}/{pos_session_id}",
            },
            "TransactionDetails": {
                "Currency": currency.name,
                "TotalAmount": amount,
            },
        }
        if original_payment_id:
            payment_transaction["OriginalTransaction"] = {
                "TransactionIdentification": {
                    "TransactionDateTime": now,  # TODO: original transaction datetime isn't tracked, reusing current time
                    "TransactionReference": original_payment_id,
                },
            }

        json_to_send = {
            "SaleToPOIServiceRequest": {
                "Header": {
                    "MessageFunction": "SaleFinancialServiceRequest",
                    "ProtocolVersion": "5.1-WL2.0.2",
                    "ExchangeIdentification": str(uuid.uuid4()),
                    "CreationDateTime": now,
                    "InitiatingParty": {
                        "Identification": "Odoo Point Of Sale",
                        "Type": "Merchant",
                    },
                    "SalesSystemInfo": {
                        "IntegratorId": WORLDLINE_INTEGRATOR_ID,  # TODO: TO GET FROM WORLDLINE
                        "SaleSoftware": [
                            {
                                "Type": "ECR",
                                "Status": {
                                    "VersionNumber": "1.0.0",
                                },
                            },
                        ],
                    },
                    "WebhookUrl": self.worldline_webhook_url,
                    "NumberOfRetries": 3,  # The number of times to retry the request if the WebhookUrl server is unavailable or returns an error message
                },
                "ServiceRequest": {
                    "Environment": {
                        "POI": {
                            "Identification": {
                                "Identification": self.worldline_terminal_id,  # TODO: GET TERMINAL ID FROM WORLDLINE
                            },
                        },
                    },
                    "ServiceContent": "FinancialPaymentRequest",  # Payment and Refund both go through here, differentiated by PaymentTransaction.TransactionType
                    "PaymentRequest": {
                        "PaymentTransaction": payment_transaction,
                    },
                },
            },
        }
        _logger.info("Worldline transaction JSON: %s", json_to_send)
        return json_to_send

    def _worldline_send_request(self, json_body):
        self.ensure_one()
        url = f"{self.worldline_api_url}/api/v2/merchants/{self.worldline_merchant_id}/terminals/{self.worldline_terminal_id}/payments"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {WORLDLINE_BEARER_TOKEN}",  # TODO: TO GET FROM WORLDLINE
        }
        try:
            resp = requests.post(url, json=json_body, headers=headers, timeout=TIMEOUT)
        except requests.exceptions.RequestException as e:
            _logger.exception("Failed to call Worldline payments endpoint")
            return {"error": str(e)}

        if resp.status_code == 202:
            # Async request: only the requestId is returned here, the actual Nexo
            # response (payment/refund result) is delivered later to the WebhookUrl.
            return resp.json()

        try:
            return {"error": resp.json().get("message")}
        except ValueError:
            return {"error": resp.text}

    def worldline_create_payment(self, amount: float, payment_uuid: str, pos_session_id: int):
        self.ensure_one()
        currency = self.journal_id.currency_id or self.company_id.currency_id
        payment_request_json = self._get_worldline_transaction_json("CardPayment", amount, currency, payment_uuid, pos_session_id)
        return self._worldline_send_request(payment_request_json)

    def worldline_create_refund(self, original_payment_id: str, amount: float, payment_uuid: str, pos_session_id: int):
        self.ensure_one()
        currency = self.journal_id.currency_id or self.company_id.currency_id
        refund_request_json = self._get_worldline_transaction_json("Refund", amount, currency, payment_uuid, pos_session_id, original_payment_id=original_payment_id)
        return self._worldline_send_request(refund_request_json)

    def _worldline_send_notification(self, pos_session, payload):
        """Relay a parsed webhook result to the POS session's bus channel.

        Called by the /pos_worldline/webhook controller once it has matched the
        incoming Nexo response to a payment method and a pos.session.
        """
        pos_session.config_id._notify('WORLDLINE_CLOUD_PAYMENT_STATUS', payload)
