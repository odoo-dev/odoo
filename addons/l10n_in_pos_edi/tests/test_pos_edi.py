# Part of Odoo. See LICENSE file for full copyright and licensing details.
from unittest.mock import patch

from odoo.tests import tagged

from odoo.addons.l10n_in_pos.tests.common import TestInPosBase


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestInPosEdi(TestInPosBase):
    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.company.l10n_in_edi_feature = True
        cls.env.company.point_of_sale_use_ticket_qr_code = True
        cls.partner_a.l10n_in_gst_treatment = 'regular'

    def test_irn_on_receipt(self):
        response_data = {
            'Irn': 'faac3ca0aa4978cf9196a92f6d277d26a85ac2988b428254c22fc15fcac544a7',
            'AckNo': '112010036563310',
            'AckDt': '2026-10-28 15:56:00',
            'SignedQRCode': 'signed-qr-code',
        }
        with (
            self.with_pos_session(),
            patch.object(self.env.registry['account.move'], '_l10n_in_edi_connect_to_server', return_value={'data': response_data}) as connect,
        ):
            order = self._create_order({
                'pos_order_lines_ui_args': [(self.product_a, 1.0)],
                'payments': [(self.bank_pm1, 105.0)],
                'customer': self.partner_a,
                'is_invoiced': True,
            })
            data = order.order_receipt_generate_data()
            html = order.order_receipt_generate_html()

        connect.assert_called_once()
        self.assertEqual(order.account_move.l10n_in_edi_status, 'sent')
        self.assertEqual(order.l10n_in_irn, response_data['Irn'])
        self.assertEqual(data['extra_data']['l10n_in_irn'], response_data['Irn'])
        self.assertTrue(data['image']['l10n_in_irn_qr_code'])
        self.assertIn(response_data['Irn'], html)
        self.assertIn(order.account_move.name, html)
        self.assertNotIn("Need an invoice?", html)

    def test_no_irn_for_b2c_order(self):
        with (
            self.with_pos_session(),
            patch.object(self.env.registry['account.move'], '_l10n_in_edi_connect_to_server') as connect,
        ):
            order = self._create_order({
                'pos_order_lines_ui_args': [(self.product_a, 1.0)],
                'payments': [(self.bank_pm1, 105.0)],
            })
            data = order.order_receipt_generate_data()

        connect.assert_not_called()
        self.assertFalse(data['extra_data']['l10n_in_irn'])
        self.assertFalse(data['image']['l10n_in_irn_qr_code'])
