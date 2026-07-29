from odoo import http
from odoo.http import request
from odoo.tools import verify_hash_signed
import logging

_logger = logging.getLogger(__name__)


class PosWorldline(http.Controller):

    {
  "data": {
    "SaleToPOIServiceResponse": {
      "Header": {
        "MessageFunction": "SaleFinancialServiceResponse",
        "ProtocolVersion": "5.1-WL2.0.2",
        "ExchangeIdentification": "550e8400-e29b-41d4-a716-446655440000",
        "CreationDateTime": "2026-05-07T14:35:22.0+01:00",
        "InitiatingParty": {
          "Identification": "WL000D5T0000004",
          "Type": "Merchant"
        },
        "SalesSystemInfo": {
          "IntegratorId": "9b2e6f1a1c3d4e5f8a7b0c1d2e3f4a5b",
          "SaleSoftware": [
            {
              "Type": "ECR",
              "SubTypeInformation": "Checkout",
              "Identification": {
                "ProviderIdentification": "YourSoftware",
                "Identification": "YourPOS",
                "SerialNumber": "SN-0001"
              },
              "Status": {
                "VersionNumber": "1.4.2"
              }
            }
          ]
        }
      },
      "ServiceResponse": {
        "Response": {
          "Result": "Success"
        },
        "PaymentResponse": {
          "PaymentTransaction": {
            "TransactionType": "CardPayment",
            "TransactionIdentification": {
              "TransactionDateTime": "2026-05-07T14:35:22.0+01:00",
              "TransactionReference": "R26197055"
            },
            "TransactionDetails": {
              "Currency": "EUR",
              "TotalAmount": 104.11
            },
            "TransactionResponse": {
              "AuthorisationResult": {
                "ResponseToAuthorisation": {
                  "Response": "Approved"
                },
                "AuthorisationCode": "678803"
              }
            }
          }
        }
      }
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
    @http.route('/pos_worldline/webhook', methods=['POST'], auth='public', type='http', save_session=False, csrf=False)
    def worldline_webhook(self, payload):
        _logger.info("Received webhook from Worldline for payment '%s'", id)

        # Verify the request origin

        payment_method_sudo = request.env["pos.payment.method"].sudo()

        payment_method_sudo = payment_method_sudo.browse(payment_method_id).exists()
        if not payment_method_sudo:
            _logger.warning("No payment method found matching Mollie webhook, ignoring")
            return "OK"
        pos_session_sudo = request.env["pos.session"].sudo().browse(pos_session_id).exists()
        if not pos_session_sudo:
            _logger.warning("No POS session found matching Mollie webhook, ignoring")
            return "OK"

        payment_info = payment_method_sudo.mollie_get_payment(id)


        # Get transaction result
        # 1. Success
        if payload.get("data"):
            result = payload["data"]["SaleToPOIServiceResponse"]["ServiceResponse"]["Response"]["Result"]
            if result == "Success":
                _logger.info("Payment '%s' was successful", id)

        # 2. Failed
        else:
            transaction_id = transaction_reference = data["SaleToPOIServiceResponse"]["ServiceResponse"]["PaymentResponse"]["SaleTransactionIdentification"
]["TransactionReference"]
            response = payload["SaleToPOIServiceResponse"]["ServiceResponse"]
            transaction_id = ["PaymentResponse"]["SaleTransactionIdentification"]
            resp = response["Response"]['Response']  # Ex: "Failed"
            reason = response["Response"]['ResponseReason']  # Ex: "Refusal"
            info = response["Response"]["AdditionalResponseInformation"]  # Ex: "WPI_ERR_COND_USER_TIMEOUT:EFT_E_CARDHOLDER_TIMEOUT"
            _logger.info("Transaction '%s' ended with result %s with reason: %s. Additional information: %s", resp, reason, info)

        # Notify the POS session of the payment result
        pos_session_sudo.config_id._notify('WORLDLINE_PAYMENT_STATUS', message)

        return "OK"
