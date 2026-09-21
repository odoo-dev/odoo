# Part of Odoo. See LICENSE file for full copyright and licensing details.

from cryptography.hazmat.primitives import serialization

from odoo.addons.payment.tests.common import PaymentCommon


class KueskiCommon(PaymentCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.kueski = cls._prepare_provider("kueski", update_values={"kueski_merchant_id": "123456"})
        cls.kueski.action_kueski_generate_key()
        cls.public_key = serialization.load_pem_public_key(cls.kueski.kueski_public_key.encode())

        cls.provider = cls.kueski
        cls.currency = cls._enable_currency("MXN")
        cls.payment_method = cls.provider.payment_method_ids[:1]
        cls.payment_method_id = cls.payment_method.id
        cls.intent_id = "315612511130103"
        cls.intent_data = {
            "payment_intent_id": cls.intent_id,
            "order_id": cls.reference,
            "status": "authorized",
            "status_reason": None,
            "amount": {"amount": f"{cls.amount:.2f}", "currency": "MXN"},
            "capture_method": "automatic",
            "redirect_url": f"https://testing.kueskipay.com/pay?payment_intent_id={cls.intent_id}",
        }
