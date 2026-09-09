from odoo.exceptions import AccessError
from odoo.tests.common import TransactionCase


class TestElectronicPayment(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.dummy_payment_method = cls.env["pos.electronic.payment"].create({
            "name": "Test",
            "payment_provider": "test",
            "integration_type": "terminal",
        })
        cls.currency_id = cls.env.company.currency_id.id

    def test_start_payment_validation(self):
        with self.assertRaises(ValueError):
            self.dummy_payment_method.browse([]).start_payment(5.00, self.currency_id)
        with self.assertRaises(AccessError):
            self.dummy_payment_method.with_user(self.env.ref('base.public_user')).start_payment(5.00, self.currency_id)
        with self.assertRaises(ValueError):
            self.dummy_payment_method.start_payment(-5.00, self.currency_id)
        with self.assertRaises(ValueError):
            self.dummy_payment_method.start_payment(5.00, -123)

    def test_start_refund_validation(self):
        with self.assertRaises(ValueError):
            self.dummy_payment_method.browse([]).start_refund(5.00, self.currency_id)
        with self.assertRaises(AccessError):
            self.dummy_payment_method.with_user(self.env.ref('base.public_user')).start_refund(5.00, self.currency_id)
        with self.assertRaises(ValueError):
            self.dummy_payment_method.start_refund(-5.00, self.currency_id)
        with self.assertRaises(ValueError):
            self.dummy_payment_method.start_refund(5.00, -123)

    def test_start_reversal_validation(self):
        with self.assertRaises(ValueError):
            self.dummy_payment_method.browse([]).start_reversal(5.00, self.currency_id, "test")
        with self.assertRaises(AccessError):
            self.dummy_payment_method.with_user(self.env.ref('base.public_user')).start_reversal(5.00, self.currency_id, "test")
        with self.assertRaises(ValueError):
            self.dummy_payment_method.start_reversal(-5.00, self.currency_id, "test")
        with self.assertRaises(ValueError):
            self.dummy_payment_method.start_reversal(5.00, -123, "test")

    def test_capture_payment_validation(self):
        with self.assertRaises(ValueError):
            self.dummy_payment_method.browse([]).capture_payment(5.00, self.currency_id, "test")
        with self.assertRaises(AccessError):
            self.dummy_payment_method.with_user(self.env.ref('base.public_user')).capture_payment(5.00, self.currency_id, "test")
        with self.assertRaises(ValueError):
            self.dummy_payment_method.capture_payment(-5.00, self.currency_id, "test")
        with self.assertRaises(ValueError):
            self.dummy_payment_method.capture_payment(5.00, -123, "test")

    def test_adjust_payment_validation(self):
        with self.assertRaises(ValueError):
            self.dummy_payment_method.browse([]).adjust_payment(5.00, self.currency_id, "test")
        with self.assertRaises(AccessError):
            self.dummy_payment_method.with_user(self.env.ref('base.public_user')).adjust_payment(5.00, self.currency_id, "test")
        with self.assertRaises(ValueError):
            self.dummy_payment_method.adjust_payment(-5.00, self.currency_id, "test")
        with self.assertRaises(ValueError):
            self.dummy_payment_method.adjust_payment(5.00, -123, "test")

    def test_cancel_transaction_validation(self):
        with self.assertRaises(ValueError):
            self.dummy_payment_method.browse([]).cancel_transaction("test")
        with self.assertRaises(AccessError):
            self.dummy_payment_method.with_user(self.env.ref('base.public_user')).cancel_transaction("test")

    def test_get_transaction_status_validation(self):
        with self.assertRaises(ValueError):
            self.dummy_payment_method.browse([]).get_transaction_status("test")
        with self.assertRaises(AccessError):
            self.dummy_payment_method.with_user(self.env.ref('base.public_user')).get_transaction_status("test")

    def test_get_payment_providers(self):
        provider_data = self.dummy_payment_method.get_payment_providers()
        provider_selection = self.dummy_payment_method._fields["payment_provider"].get_values(self.env)

        for provider in provider_selection:
            if provider not in provider_data:
                msg = f"'{provider}' electronic payment provider is installed but is not listed in `get_payment_providers`"
                self.fail(msg)
