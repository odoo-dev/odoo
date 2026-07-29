from odoo import fields, models
import logging

_logger = logging.getLogger(__name__)


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    def _get_terminal_provider_selection(self):
        return super()._get_terminal_provider_selection() + [("worldline", "Worldline")]

    def _allowed_actions_in_self_order(self):
        return super()._allowed_actions_in_self_order() + ["worldline_create_payment", "worldline_create_refund", "worldline_cancel_payment", "worldline_get_payment"]

    worldline_terminal_id = fields.Char("Worldline Terminal ID")
    worldline_merchand_id = fields.Char("Worldline Merchant ID")
    test_mode = fields.Boolean("Test Mode", default=False, help="If enabled, the payment method will use the Worldline test environment.")

    worldline_api_url = fields.Char("Worldline URL", compute="_compute_worldline_api_url", help="The base URL for the Worldline API.")
    worldline_webhook_url = fields.Char("Worldline Webhook URL", compute="_compute_worldline_webhook_url", help="The URL that Worldline will call to notify the POS of payment status changes.")

    def _compute_worldline_api_url(self):
        for record in self:
            if record.test_mode:
                record.worldline_api_url = "https://api.terminal.iacc.global.worldline-solutions.com"
            else:
                record.worldline_api_url = "https://api.terminal.global.worldline-solutions.com"

    def _compute_worldline_webhook_url(self):
        for record in self:
            record.worldline_webhook_url = f"https://{self.env.sudo().get_param('web.base.url')}/pos_worldline/webhook"

    def _get_worldline_transaction_json(self, amount: float, currency: str, payment_uuid: str, pos_session_id: int):
        self.ensure_one()

        json_to_send = {
            "SaleToPOIServiceRequest": {
                "Header": {
                    "MessageFunction": "SaleFinancialServiceRequest",
                        "ProtocolVersion": "5.1-WL2.0.2",
                        "ExchangeIdentification": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",  # TODO: TO GET FROM WORLDLINE ???
                        "CreationDateTime": "2020-05-04T18:13:51.0+01:00",
                        "InitiatingParty": {
                            "Identification": "Odoo Point Of Sale",
                            "Type": "Merchant",
                        },
                        "SalesSystemInfo": {
                            "IntegratorId": "9b2e6f1a1c3d4e5f8a7b0c1d2e3f4a5b",  # TODO:TO GET FROM WORLDLINE
                            "SaleSoftware": [
                                {
                                    "Type": "ECR",
                                    "Status": {
                                        "VersionNumber": "1.0.0",
                                    },
                                },
                            ],
                        },
                        "WebhookUrl": "https://example.com/webhook?transactionId=a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",  # To FORMAT
                        "NumberOfRetries": 3,  # The number of times to retry the request if the WebhookUrl server is unavailable or returns an error message
                },
                "ServiceRequest": {
                    "Environment": {
                        "POI": {
                            "Identification": {
                                "Identification": "POITerm1",  # TODO: GET TERMINAL ID FROM WORLDLINE
                            },
                        },
                    },
                    "ServiceContent": "FinancialPaymentRequest",  # Can be FinancialReversalRequest
                    "PaymentRequest": {
                        "PaymentTransaction": {
                            "TransactionType": "CardPayment",
                            "TransactionIdentification": {
                                "TransactionDateTime": "2020-05-04T18:13:51.0+01:00",
                                "TransactionReference": payment_uuid,  # to get from pos
                            },
                            "TransactionDetails": {
                                "Currency": currency,
                                "TotalAmount": amount,
                            },
                        },
                    },
                },
            },
        }
        _logger.info("Worldline transaction JSON: %s", json_to_send)
        return json_to_send


    def worldline_create_payment(self, amount: float, payment_uuid: str, pos_session_id: int):
        self.ensure_one()
        worldline_api_url = self.worldline_api_url + f"/api/v2/merchants/{self.worldline_merchant_id}/terminals/{self.worldline_terminal_id}/payments"
        currency = self.journal_id.currency_id or self.company_id.currency_id
        payment_request_json = self._get_worldline_transaction_json(amount, currency, payment_uuid, pos_session_id)


        return self.sudo().mollie_payment_provider_id._send_api_request("POST", "/payments", json=payment_request_json)

    def mollie_create_refund(self, original_payment_id: str, amount: float, payment_uuid: str, pos_session_id: int):
        self.ensure_one()

        currency = self.journal_id.currency_id or self.company_id.currency_id
        payment_request = {
            "amount": {
                "currency": currency.name,
                "value": f"{amount:.{currency.decimal_places}f}"
            },
            "description": f"pos_session_id={pos_session_id},payment_uuid={payment_uuid}",
        }
        return self.sudo().mollie_payment_provider_id._send_api_request("POST", f"/payments/{original_payment_id}/refunds", json=payment_request)

    def mollie_cancel_payment(self, payment_id: str):
        self.ensure_one()
        return self.sudo().mollie_payment_provider_id._send_api_request("DELETE", f"/payments/{payment_id}")

    def mollie_get_payment(self, payment_id: str):
        self.ensure_one()
        return self.sudo().mollie_payment_provider_id._send_api_request("GET", f"/payments/{payment_id}")
