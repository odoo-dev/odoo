from unittest.mock import patch
import json
from threading import Timer
import requests
from odoo import http
from odoo.addons.point_of_sale.controllers.main import PosController
from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon
from odoo.tests.common import tagged
from odoo.http import request

response_from_adyen_on_pos_webhook = {
    "SaleToPOIResponse": {
        "MessageHeader": {
            "MessageCategory": "Payment",
            "MessageClass": "Service",
            "MessageType": "Response",
            "POIID": "P400Plus-275319618",
            "ProtocolVersion": "3.0",
            "SaleID": "Furniture Shop (ID: 1)",
            "ServiceID": "1139077632",
        },
        "PaymentResponse": {
            "POIData": {
                "POIReconciliationID": "1000",
                "POITransactionID": {
                    "TimeStamp": "2024-10-24T11:24:30.020Z",
                    "TransactionID": "4eU8001729769070017.SD3Q9TMJJTSSM475",
                },
            },
            "PaymentReceipt": [            ],
            "PaymentResult": {
                "AmountsResp": {"AuthorizedAmount": 1.04, "Currency": "USD"},
                "CustomerLanguage": "en",
                "OnlineFlag": True,
                "PaymentAcquirerData": {
                    "AcquirerPOIID": "P400Plus-275319618",
                    "AcquirerTransactionID": {
                        "TimeStamp": "2024-10-24T11:24:30.020Z",
                        "TransactionID": "SD3Q9TMJJTSSM475",
                    },
                    "ApprovalCode": "123456",
                    "MerchantID": "OdooMP_POS",
                },
                "PaymentInstrumentData": {
                    "CardData": {
                        "CardCountryCode": "826",
                        "EntryMode": ["Contactless"],
                        "MaskedPan": "541333 " "**** " "9999",
                        "PaymentBrand": "mc",
                        "SensitiveCardData": {
                            "CardSeqNumb": "33",
                            "ExpiryDate": "0228",
                        },
                    },
                    "PaymentInstrumentType": "Card",
                },
            },
            "Response": {
                "AdditionalResponse": "AID=A000000004101001&PaymentAccountReference=xAPclxsN8y8e5ZY2TIC0FC6v4llHl&acquirerAccountCode=TestPmmAcquirerAccountMarketPlace&acquirerCode=TestPmmAcquirer&acquirerResponseCode=APPROVED&alias=C731691501538802&aliasType=Default&applicationLabel=MCENGBRGBP&applicationPreferredName=mc%20en%20gbr%20gbp&authCode=123456&authorisationMid=900&authorisedAmountCurrency=USD&authorisedAmountValue=104&avsResult=0%20Unknown&backendGiftcardIndicator=false&cardBin=541333&cardHolderName=%20%2f&cardHolderVerificationMethodResults=1F0302&cardIssueNumber=33&cardIssuerCountryId=826&cardScheme=mc&cardSummary=9999&cardType=mc&cvcResult=0%20Unknown&expiryDate=2%2f2028&expiryMonth=02&expiryYear=2028&fundingSource=CREDIT&giftcardIndicator=false&isCardCommercial=unknown&iso8601TxDate=2024-10-24T11%3a24%3a30.020Z&issuerBin=54133300&issuerCountry=GB&merchantReference=921e7aa8-36b3-400c-a416-2b9a1eaf1283--3&metadata.pos_hmac=ba6c62413839eb32030a3ee6400af4d367b8fb889b54ea85dffcb5a13625c318&mid=900&offline=false&paymentMethod=mc&paymentMethodVariant=mc&posAmountCashbackValue=0&posAmountGratuityValue=0&posAuthAmountCurrency=USD&posAuthAmountValue=104&posEntryMode=CLESS_CHIP&posOriginalAmountValue=104&posadditionalamounts.originalAmountCurrency=USD&posadditionalamounts.originalAmountValue=104&pspReference=SD3Q9TMJJTSSM475&refusalReasonRaw=APPROVED&retry.attempt1.acquirer=TestPmmAcquirer&retry.attempt1.acquirerAccount=TestPmmAcquirerAccountMarketPlace&retry.attempt1.rawResponse=APPROVED&retry.attempt1.responseCode=Approved&retry.attempt1.shopperInteraction=POS&shopperCountry=BE&startMonth=01&startYear=2017&tc=474D7E0A23DBBFB2&tid=60214284&transactionLanguage=en&transactionReferenceNumber=SD3Q9TMJJTSSM475&transactionType=GOODS_SERVICES&txdate=24-10-2024&txtime=13%3a24%3a30",
                "Result": "Success",
            },
            "SaleData": {
                "SaleTransactionID": {
                    "TimeStamp": "2024-10-24T11:24:29.000Z",
                    "TransactionID": "921e7aa8-36b3-400c-a416-2b9a1eaf1283--3",
                }
            },
        },
    }
}

@tagged('post_install', '-at_install')
class TestAdyenPoS(TestPointOfSaleHttpCommon):
    @classmethod
    def setUpClass(self):
        super().setUpClass()
        def mocked_adyen_server():
            DELAY_BETWEEN_ADYEN_REQUEST_AND_WEBHOOK_RESPONSE = 1
            Timer(DELAY_BETWEEN_ADYEN_REQUEST_AND_WEBHOOK_RESPONSE, lambda : requests.post("/pos_adyen/notification", json=response_from_adyen_on_pos_webhook))
            assert json.loads(request.httprequest.data) == {
                "SaleToPOIRequest": {
                    "MessageHeader": {
                        "MessageCategory": "Payment",
                        "MessageClass": "Service",
                        "MessageType": "Request",
                        "POIID": "P400Plus-275319618",
                        "ProtocolVersion": "3.0",
                        "SaleID": "Clothes Shop (ID: 2)",
                        "ServiceID": "1810652344",
                    },
                    "PaymentRequest": {
                        "PaymentTransaction": {
                            "AmountsReq": {"Currency": "USD", "RequestedAmount": 1.15}
                        },
                        "SaleData": {
                            "SaleToAcquirerData": "metadata.pos_hmac=0b2009a0918f07c7a2a057759438db4258a0b88b6f590dc7e5661cdb4182dd74",
                            "SaleTransactionID": {
                                "TimeStamp": "2024-10-24T12:39:37+02:00",
                                "TransactionID": "85102ef0-2508-429a-944e-4d89268e2a6e--4",
                            },
                        },
                    },
                }
            }
            return http.Response(
                'ok',
                content_type="application/json",
            )

        self.env.registry.clear_cache('routing')
        PosController.adyen_mock_endpoint = http.route(["/fake_adyen/live"], type="http")(mocked_adyen_server)

        # @self.addCleanup
        # def _cleanup():
        #     del PosController.adyen_mock_endpoint
        #     self.env.registry.clear_cache('routing')
    # TODO make sure that this tour is not run in both desktop and mobile mode
    def test_adyen_basic_order(self):
        self.main_pos_config.write({
            "payment_method_ids": [
                (0, 0, {
                    "name": "Adyen",
                    "use_payment_terminal": True,
                    "adyen_api_key": "my_adyen_api_key",
                    "adyen_terminal_identifier": "my_adyen_terminal",
                    "adyen_test_mode": False,
                }),
            ],
        })
        @patch("odoo.addons.pos_adyen.models.pos_payment_method.PosPaymentMethod._get_adyen_endpoints")
        def _get_mock_adyen_endpoints(self):
            return {
                'terminal_request': '/fake_adyen/%s',
            }

        self.main_pos_config.with_user(self.pos_user).open_ui()
        self.start_tour("/pos/ui?config_id=%d" % self.main_pos_config.id, 'PosAdyenTour', login="pos_user", debug=True)
