import base64
import hashlib
from unittest.mock import patch

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from odoo.exceptions import ValidationError
from odoo.tests import Command
from odoo.tests.common import tagged

from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon


@tagged('post_install', '-at_install')
class TestQFPayPoS(TestPointOfSaleHttpCommon):
    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.company.currency_id = cls.env.ref("base.HKD")
        cls.main_pos_config.use_pricelist = False
        cls.main_pos_config.write({
            "payment_method_ids": [
                Command.create({
                    "name": "QFPay",
                    'type': 'bank',
                    "qfpay_notification_key": "my_qfpay_notification_key",
                    "payment_provider": "qfpay",
                    "payment_method_type": "terminal",
                    "qfpay_payment_type": "card_payment",
                    "journal_id": cls.bank_journal.id,
                    "terminal_ids": [
                        Command.create({"name": "Terminal 1", "qfpay_terminal_ip_address": "192.168.1.10", "qfpay_pos_key": "my_qfpay_pos_key"}),
                        Command.create({"name": "Terminal 2", "qfpay_terminal_ip_address": "192.168.1.11", "qfpay_pos_key": "other_qfpay_key!"}),
                    ],
                }),
            ],
        })
        cls.qfpay_payment_method = cls.main_pos_config.payment_method_ids.filtered(lambda pm: pm.payment_provider == "qfpay")
        cls.terminal_1, cls.terminal_2 = cls.qfpay_payment_method.terminal_ids

    def _decrypt_signed_request(self, signed_request, key):
        cipher = Cipher(algorithms.AES(key.encode()), modes.CBC(b'qfpay202306_hjsh'))
        decryptor = cipher.decryptor()
        padded_data = decryptor.update(base64.b64decode(signed_request)) + decryptor.finalize()
        unpadder = padding.PKCS7(128).unpadder()
        return (unpadder.update(padded_data) + unpadder.finalize()).decode()

    def _expected_signed_content(self, key):
        content = "{amt=10,func_type=1001}"
        digest = hashlib.md5((content + key).encode()).hexdigest().upper()
        return "{content:" + content + ", digest:'" + digest + "'}"

    def test_sign_request_with_terminal_key(self):
        signed_request = self.qfpay_payment_method.qfpay_sign_request({"func_type": 1001, "amt": 10}, self.terminal_2.id)
        self.assertEqual(
            self._decrypt_signed_request(signed_request, "other_qfpay_key!"),
            self._expected_signed_content("other_qfpay_key!"),
        )

    def test_sign_request_without_terminal(self):
        # e.g. from the Self Order Kiosk, the first terminal is used
        signed_request = self.qfpay_payment_method.qfpay_sign_request({"func_type": 1001, "amt": 10})
        self.assertEqual(
            self._decrypt_signed_request(signed_request, "my_qfpay_pos_key"),
            self._expected_signed_content("my_qfpay_pos_key"),
        )

    def test_sign_request_with_unknown_terminal(self):
        other_terminal = self.env["pos.payment.terminal"].create({"payment_method_id": self.bank_payment_method.id})
        with self.assertRaises(ValidationError):
            self.qfpay_payment_method.qfpay_sign_request({"func_type": 1001, "amt": 10}, other_terminal.id)

    def test_terminal_required(self):
        with self.assertRaises(ValidationError):
            self.qfpay_payment_method.terminal_ids = [Command.clear()]

    def test_tour_qfpay_order_and_refund(self):
        # The tour selects the second terminal as default terminal of the device
        with patch('odoo.addons.pos_qfpay.controllers.main.consteq', lambda a, b: True):
            self.start_pos_tour('qfpay_order_and_refund')
