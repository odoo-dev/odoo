from unittest.mock import patch
from contextlib import contextmanager

from odoo import _
from odoo.tests import Command
from odoo.tests.common import tagged

from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon
from odoo.addons.pos_qlub.models.pos_payment_method import PosPaymentMethod


@tagged("post_install", "-at_install")
class TestQlub(TestPointOfSaleHttpCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.company.currency_id = cls.env.ref("base.HKD")
        cls.main_pos_config.use_pricelist = False
        cls.qlub_pm = cls.env["pos.payment.method"].create({
            "name": "Qlub",
            "payment_method_type": "terminal",
            "journal_id": cls.bank_journal.id,
            "qlub_pos_name": "qlub_vendor_name",
            "qlub_key": "your_secret_key",
            "qlub_location": "spt-1233nnu",
            "qlub_terminal": "qlub_terminal_name",
            "use_payment_terminal": "qlub",
            "qlub_test_mode": True,
            "config_ids": [Command.link(cls.main_pos_config.id)]
        })

    def test_qlub_sign_request(self):
        # There should be many more things in the payload, but only these are needed for the signature
        payload = {
            "timestamp": 1742453172,
            "event": "transaction_created",
            "location_id": "spt-1233nnu"
        }

        # TODO: The hash from the documentation seems to be wrong (we are using the same input but the hash is different)
        self.assertEqual(
            self.qlub_pm._qlub_sign_request(payload),
            "0802d96c3b5f769f6d7b7212f4a4f3a508cd91a0b423cebfc0e6c20fb6487806"
        )

    @contextmanager
    def mock_call_qlub(self, success=True):
        def mocked_call_qlub(self, signature, payload):
            if success:
                return {"success": 200}
            error_message = _("Qlub server cannot process the transaction. Please retry.")
            return {"error": "%s\n%s" % (error_message, "INTERNAL_ERROR")}

        with patch.object(PosPaymentMethod, "_call_qlub", mocked_call_qlub):
            yield

    def test_qlub_transaction_create_success(self):
        with self.mock_call_qlub():
            self.start_pos_tour("qlub_transaction_creation_success")

    def test_qlub_transaction_create_failed(self):
        with self.mock_call_qlub(success=False):
            self.start_pos_tour("qlub_transaction_creation_failed")

    def test_qlub_transaction_create_failed_notification(self):
        with self.mock_call_qlub():
            self.start_pos_tour("qlub_transaction_creation_failed_notification")

    def test_qlub_transaction_cancel_from_terminal(self):
        with self.mock_call_qlub():
            self.start_pos_tour("qlub_transaction_cancel_from_terminal")

    def test_qlub_transaction_cancel_from_pos(self):
        with self.mock_call_qlub():
            self.start_pos_tour("qlub_transaction_cancel_from_pos")
