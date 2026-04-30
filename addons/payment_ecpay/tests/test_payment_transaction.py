# Part of Odoo. See LICENSE file for full copyright and licensing details.

from zoneinfo import ZoneInfo

from odoo.tests import tagged
from odoo.tools.urls import urljoin

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_ecpay import const
from odoo.addons.payment_ecpay.tests.common import EcpayCommon


@tagged("post_install", "-at_install")
class TestPaymentTransaction(EcpayCommon):
    def test_reference_uses_only_alphanumeric_chars(self):
        """The computed reference must be alphanumeric."""
        reference = self.env["payment.transaction"]._compute_reference(provider_code="ecpay")
        self.assertRegex(reference, r"^[a-zA-Z0-9]+$")

    def test_reference_length_is_at_most_20_chars(self):
        """The computed reference must be at most 20 characters long."""
        reference = self.env["payment.transaction"]._compute_reference(provider_code="ecpay")
        self.assertTrue(len(reference) <= 20)

    def test_no_item_missing_from_rendering_values(self):
        """Test that the rendered values are conform to the transaction fields."""
        tx = self._create_transaction(
            "redirect", payment_method_id=self.env.ref("payment.payment_method_card").id
        )
        base_url = tx.provider_id.get_base_url()
        all_payment_methods = {
            item for methods in const.PAYMENT_METHODS_MAPPING.values() for item in methods
        }
        ignored_payment_methods = "#".join(
            all_payment_methods.difference(const.PAYMENT_METHODS_MAPPING[tx.payment_method_code])
        )
        expected_values = {
            "api_url": tx.provider_id._ecpay_get_api_url(),
            "url_params": {
                "MerchantID": tx.provider_id.ecpay_merchant_id,
                "MerchantTradeNo": tx.reference,
                "MerchantTradeDate": (
                    tx.create_date
                    .replace(tzinfo=ZoneInfo("UTC"))
                    .astimezone(ZoneInfo("Asia/Taipei"))
                    .strftime("%Y/%m/%d %H:%M:%S")
                ),
                "PaymentType": "aio",
                "TotalAmount": int(tx.amount),
                "TradeDesc": "ECPay from Odoo",
                "ItemName": tx.reference,
                "ReturnURL": urljoin(base_url, const.WEBHOOK_ROUTE),
                "ChoosePayment": "ALL",
                "EncryptType": "1",
                "ClientBackURL": urljoin(base_url, const.PAYMENT_RETURN_ROUTE),
                "Remark": tx.reference,
                "OrderResultURL": urljoin(base_url, const.PAYMENT_RETURN_ROUTE),
                "IgnorePayment": ignored_payment_methods,
                "Language": payment_utils.get_language_code(
                    self.env.context.get("lang", "en_US"), const.LANGUAGE_CODES_MAPPING
                ),
            },
        }
        expected_values["url_params"]["CheckMacValue"] = tx.provider_id._ecpay_calculate_signature(
            expected_values["url_params"]
        )

        self.maxDiff = None
        self.assertDictEqual(tx._get_specific_rendering_values(None), expected_values)

    def test_extract_reference_finds_reference(self):
        """Test that the transaction reference is found in the payment data."""
        tx = self._create_transaction("redirect")
        reference = self.env["payment.transaction"]._extract_reference(
            "ecpay", self.payment_result_data
        )
        self.assertEqual(tx.reference, reference)

    def test_extract_amount_data_returns_amount_and_currency(self):
        """Test that the amount and currency are returned from the payment data."""
        tx = self._create_transaction("redirect")
        amount_data = tx._extract_amount_data(self.payment_result_data)
        self.assertDictEqual(
            amount_data,
            {"amount": tx.amount, "currency_code": tx.currency_id.name, "precision_digits": 0},
        )

    def test_apply_updates_confirms_transaction(self):
        """Test that the transaction state is set to 'done' on successful payment."""
        tx = self._create_transaction("redirect")
        tx._apply_updates(self.payment_result_data)
        self.assertEqual(tx.state, "done")

    def test_apply_updates_sets_provider_reference(self):
        """Test that the provider reference is updated from the payment data."""
        tx = self._create_transaction("redirect")
        tx._apply_updates(self.payment_result_data)
        self.assertEqual(tx.provider_reference, self.payment_result_data["TradeNo"])

    def test_apply_updates_sets_payment_method(self):
        """Test that the payment method is updated from the payment data."""
        tx = self._create_transaction("redirect")
        tx._apply_updates(self.payment_result_data)
        self.assertEqual(tx.payment_method_id, self.env.ref("payment.payment_method_ipass_money"))
