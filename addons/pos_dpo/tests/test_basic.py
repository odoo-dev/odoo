# Part of Odoo. See LICENSE file for full copyright and licensing details.

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
        cls.tid = "0000000000"
        cls.mid = "0100010001"
        cls.main_pos_config.use_pricelist = False
        payment_method = cls.env["pos.payment.method"].create({
            "name": "DPO By Network",
            "payment_method_type": "terminal",
            "use_payment_terminal": "dpo",
            "dpo_tid": cls.tid,
            "dpo_mid": cls.mid,
            "dpo_test_mode": True,
            "dpo_client_id": "dpo_pay_test_client_id",
            "dpo_client_secret": "dpo_client_secret",
            "journal_id": cls.bank_journal.id,
        })
        cls.main_pos_config.write({"payment_method_ids": [(4, payment_method.id)]})

    def _check_source_id(self, json_data):
        if not json_data or "sourceId" not in json_data:
            raise UserError("Source ID is required to start a transaction.")
        self.source_id = json_data["sourceId"]

    def _get_base_url(self, token=False):
        host = "api-dev.network.global"
        if token:
            return f"https://{host}/v1"
        return f"https://{host}/ngenius-webapi/payments/push/v1/tid:{self.tid}/mid:{self.mid}"

    def _mock_response(self, status=200, json_data=None, content="ok"):
        response = Response()
        response.status_code = status
        response._content = content.encode()
        if json_data:
            response.json = lambda: json_data
        return response

    def _mock_post(self, url, **kwargs):
        json_body = kwargs.get("json", {})
        _logger.info("Mocking POST: %s", url)

        if url.endswith("/get-status"):
            self._check_source_id(json_body)
            return self._mock_response(json_data={
                "amount": "1000",
                "complete": not self.is_cancel_test,
                "inProgress": self.is_cancel_test,
                "currency": "0784",
                "cardInserted": False,
                "success": False,
                "sourceId": self.source_id,
                "tipAmount": "0",
                "displayText": "PRESENT CARD",
            })

        if url == f"{self._get_base_url(token=True)}/tokenkc/generate":
            return self._mock_response(json_data={
                "access_token": self.token,
                "token_type": "Bearer",
                "expires_in": "1800"
            })

        if url.endswith("/start-transaction"):
            self._check_source_id(json_body)
            return self._mock_response(json_data={
                "responseCode": 200,
                "responseMessage": "Transaction has initiated"
            })

        if url.endswith("/cancel-transaction"):
            self.is_cancel_test = False
            return self._mock_response(json_data={
                "responseCode": 200,
                "responseMessage": "Transaction has cancelled"
            })

        if url.endswith("/get-result"):
            self._check_source_id(json_body)
            return self._mock_response(json_data={
                "amount": "1000",
                "authCode": "044423",
                "complete": True,
                "currency": "0784",
                "cardType": "VISA",
                "ReceiptNo": "000002",
                "sourceId": self.source_id,
                "TransactionDate": "21/02/2024",
                "TransactionTime": "15:27",
            })

        return self._mock_response(status=404, json_data={
            "responseCode": 404,
            "responseMessage": "No matching endpoint"
        })

    def test_dpo_pay_basic_order(self):
        with patch("odoo.addons.pos_dpo.models.dpo_pos_request.Session.post", self._mock_post):
            self.start_pos_tour("PosDpoPayTour")

    def test_dpo_pay_cancel_payment(self):
        self.is_cancel_test = True
        with patch("odoo.addons.pos_dpo.models.dpo_pos_request.Session.post", self._mock_post):
            self.start_pos_tour("PosDpoPayCancelTour")
