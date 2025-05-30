import logging

from requests import Response
from unittest.mock import patch

from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon
from odoo.tests.common import tagged
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

@tagged("post_install_l10n", "post_install", "-at_install")
class TestDpoPayPoS(TestPointOfSaleHttpCommon):
    source_id = ""
    token = "test_token_1234567890"
    is_cancel_test = False

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.main_pos_config.use_pricelist = False
        payment_method = cls.env["pos.payment.method"].create(
            {
                "name": "DPO by Network",
                "payment_method_type": "terminal",
                "use_payment_terminal": "dpo",
                "dpo_tid": "0000000000",
                "dpo_mid": "0100010001",
                "dpo_test_mode": True,
                "dpo_client_id": "dpo_pay_test_client_id",
                "dpo_client_secret": "dpo_client_secret",
                "journal_id": cls.bank_journal.id,
            }
        )
        cls.main_pos_config.write({"payment_method_ids": [(4, payment_method.id)]})

    def _check_source_id(self, json_data):
        """Check if source_id is present in the JSON data."""
        if not json_data:
            raise UserError("No JSON data provided for transaction start.")
        if "sourceId" not in json_data:
            raise UserError("Source ID is required to start a transaction.")
        self.source_id = json_data.get("sourceId", "")

    def _start_transaction(self, response, **kwargs):
        self._check_source_id(kwargs.get("json", {}))

        response.json = lambda: {
            "responseCode": 200,
            "responseMessage": 'Transaction has initiated'
        }

    def _get_status_response(self, response: Response, **kwargs):
        self._check_source_id(kwargs.get("json", {}))
        response.json = lambda: {
            "amount": "1000",
            "cardInserted": False,
            "cashback": "0",
            "complete": not self.is_cancel_test,
            "currency": "0784",
            "currencyDecimalPlaces": "0",
            "dccAccepted": False,
            "dccOffered": False,
            "declined": False,
            "discountAmount": "0",
            "displayText": "PRESENT CARD",
            "eposCheckCard": False,
            "inProgress": self.is_cancel_test,
            "maxTipAmount": "0",
            "newAmount": "0",
            "offline": False,
            "signatureRequired": False,
            "sourceId": self.source_id,
            "success": False,
            "tipAmount": "0",
        }

    def _get_result_response(self, response: Response, **kwargs):
        self._check_source_id(kwargs.get("json", {}))
        response.json = lambda: {
            "AC": "AD5D830297BFDDCD",
            "AID": "A0000000031010",
            "ApplicationVersion": "008C",
            "CID": "80",
            "CardHolderName": "AHMAD/MUHAMMAD BILAL",
            "EmvCvm": "420300",
            "ExpiryDate": "2710",
            "Label": "Visa Credit",
            "MID": "001000000034",
            "ReceiptNo": "000002",
            "rrn": "000000000006",
            "TID": "88880311",
            "TSI": "E800",
            "TVR": "0080048000",
            "TransactionDate": "21/02/2024",
            "TransactionTime": "15:27",
            "amount": "1000",
            "authCode": "044423",
            "cardInserted": False,
            "cardReadMode": "SCR",
            "cardType": "VISA",
            "cashback": "0",
            "complete": True,
            "currency": "0784",
            "currencyDecimalPlaces": "2",
        }

    def _cancel_response(self, response: Response, **kwargs):
        response.json = lambda: {
            "responseCode": 200,
            "responseMessage": 'Transaction has cancelled'
        }

    def _not_found_response(self, response: Response):
        response.status_code = 404
        response.json = lambda: {
            "responseCode": 404,
            "responseMessage": 'No matching endpoint found for the request'
        }

    def _mock_post(self, url, **kwargs):
        response = Response()
        response.status_code = 200
        response._content = "ok"
        _logger.info("Mocking POST request to: %s", url)
        if url == self._get_base_url(True) + "/tokenkc/generate":
            response.json = lambda: {
                "access_token": self.token,
                "token_type": "Bearer",
                "expires_in": "1800",
            }

        elif url == self._get_base_url() + "/start-transaction":
            self._start_transaction(response, **kwargs)

        elif url == self._get_base_url() + "/cancel-transaction":
            self._cancel_response(response, **kwargs)
            self.is_cancel_test = False

        elif url == self._get_base_url() + "/get-status":
            self._get_status_response(response, **kwargs)

        elif url == self._get_base_url() + "/get-result":
            self._get_result_response(response, **kwargs)

        else:
            self._not_found_response(response)

        return response

    def _get_base_url(self, is_token=False) -> str:
        """Return base or token URL depending on test mode and purpose."""
        host = "api-dev.network.global"

        if is_token:
            return f"https://{host}/v1"

        return f"https://{host}/ngenius-webapi/payments/push/v1/tid:0000000000/mid:0100010001"

    def test_dpo_pay_basic_order(self):
        with patch("odoo.addons.pos_dpo.models.dpo_pos_request.Session.post", self._mock_post):
            self.start_pos_tour("PosDpoPayTour")

    def test_dpo_pay_cancel_payment(self):
        self.is_cancel_test = True
        with patch("odoo.addons.pos_dpo.models.dpo_pos_request.Session.post", self._mock_post):
            self.start_pos_tour("PosDpoPayCancelTour")
