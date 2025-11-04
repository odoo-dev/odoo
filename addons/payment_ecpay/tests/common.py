from odoo.addons.payment.tests.common import PaymentCommon


class EcpayCommon(PaymentCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.ecpay = cls._prepare_provider(
            "ecpay",
            update_values={
                "ecpay_merchant_id": "3002607",
                "ecpay_hash_key": "pwFHCqoQZGmho4w6",
                "ecpay_hash_iv": "EkRm7iFT261dpevs",
            },
        )
        cls.provider = cls.ecpay
        cls.amount = 788
        cls.currency_twd = cls._enable_currency("TWD")
        cls.currency = cls.currency_twd
        cls.payment_result_data = {
            "CheckMacValue": "76391DC64D9244BBA638594C00EB3DA4A6AEEF3AB5907EFC0911BFB56A5E81E8",
            "CustomField1": "",
            "CustomField2": "",
            "CustomField3": "",
            "CustomField4": "",
            "MerchantID": "3002607",
            "MerchantTradeNo": "tx20260325033903",
            "PaymentDate": "2026/03/25 11:39:08",
            "PaymentType": "DigitalPayment_IPASS",
            "PaymentTypeChargeFee": "0",
            "RtnCode": "1",
            "RtnMsg": "Succeeded",
            "SimulatePaid": "0",
            "StoreID": "",
            "TradeAmt": "788",
            "TradeDate": "2026/03/25 11:39:03",
            "TradeNo": "2603251139038665",
        }
