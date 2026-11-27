from unittest.mock import patch
from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon
from odoo.exceptions import ValidationError
from odoo.tests import Command
from odoo.tests.common import tagged


@tagged('post_install', '-at_install')
class TestQFPayPoS(TestPointOfSaleHttpCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.company.currency_id = cls.env.ref("base.HKD")
        cls.main_pos_config.use_pricelist = False
        cls.main_pos_config.write({
            "payment_method_ids": [
                Command.create({
                    "name": "QFPay",
                    "qfpay_pos_key": "my_qfpay_pos_key",
                    "qfpay_notification_key": "my_qfpay_notification_key",
                    "use_payment_terminal": "qfpay",
                    "payment_method_type": "terminal",
                    "qfpay_payment_type": "card_payment",
                    "journal_id": cls.bank_journal.id,
                }),
            ],
        })

    def test_tour_qfpay_order_and_refund(self):
        with patch('odoo.addons.pos_qfpay.controllers.main.consteq', lambda a, b: True):
            self.start_pos_tour('qfpay_order_and_refund')

    def test_qfpay_sign_request_invalid_pos_key(self):
        qfpay_payment_method = self.main_pos_config.payment_method_ids.filtered(
            lambda pm: pm.use_payment_terminal == 'qfpay'
        )
        with self.assertRaisesRegex(
            ValidationError,
            "QFPay POS Key must be 16, 24 or 32 characters long."
        ):
            qfpay_payment_method.qfpay_pos_key = 'dummy'
            # Payload sent by the PoS when paying with a QFPay terminal
            qfpay_payment_method.qfpay_sign_request({
                'func_type': 1001,
                'amt': 32,
                'channel': 'card_payment',
                'out_trade_no': 'test',
            })
