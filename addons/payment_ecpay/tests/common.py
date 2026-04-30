# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.payment.tests.common import PaymentCommon


class EcpayCommon(PaymentCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.ecpay = cls._prepare_provider(
            "ecpay",
            update_values={
                "ecpay_merchant_id": "mock-merchant-id",
                "ecpay_hash_key": "mock-hash-key",
                "ecpay_hash_iv": "mock-hash-iv",
            },
        )
        cls.provider = cls.ecpay
        cls.currency_twd = cls._enable_currency("TWD")
        cls.currency = cls.currency_twd
        cls.payment_result_data = {
            "MerchantID": "mock-merchant-id",
            "MerchantTradeNo": cls.reference,
            "PaymentType": "DigitalPayment_IPASS",
            "RtnCode": "1",
            "SimulatePaid": "0",
            "TradeAmt": int(cls.amount),
            "TradeNo": "2603251139038665",
        }
