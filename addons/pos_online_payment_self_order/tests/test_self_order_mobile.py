
import odoo.tests
from odoo import Command
from odoo.addons.pos_online_payment.tests.online_payment_common import OnlinePaymentCommon
from odoo.addons.pos_self_order.tests.self_order_common_test import SelfOrderCommonTest

@odoo.tests.tagged("post_install", "-at_install")
class TestSelfOrderMobile(SelfOrderCommonTest, OnlinePaymentCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.payment_provider = cls.provider

        cls.payment_provider_old_company_id = cls.payment_provider.company_id.id
        cls.payment_provider_old_journal_id = cls.payment_provider.journal_id.id
        cls.payment_provider.write({
            'company_id': cls.company.id,
        })
        cls.online_payment_method = cls.env['pos.payment.method'].create({
            'name': 'Online payment',
            'is_online_payment': True,
            'online_payment_provider_ids': [Command.set([cls.payment_provider.id])],
        })
        # Needed to test online payments through the portal
        cls.env['account.payment.method'].sudo().create({
            'name': 'Dummy method',
            'code': 'none',
            'payment_type': 'inbound'
        })

    def test_online_payment_self_pay_after_meal_table(self):
        """
        Verify that we can make multiple orders with online payment in self ordering mode
        with pay after meal and service mode table.
        """
        self.pos_config.write({
            'self_ordering_mode': 'mobile',
            'self_ordering_pay_after': 'meal',
            'self_ordering_service_mode': 'table',
            'self_order_online_payment_method_id': self.online_payment_method.id,
        })
        self.pos_config.write({
            'self_ordering_pay_after': 'meal',
        })
        self.pos_config.with_user(self.pos_user).open_ui()
        self.pos_config.current_session_id.set_opening_control(0, "")
        self_route = self.pos_config._get_self_order_route()
        self.start_tour(self_route, "self_mobile_online_payment_meal_table")

    def test_online_payment_kiosk_qr_code(self):
        """
        Verify that when making an order from kiosk with online payment, a QR code is generated
        """
        self_route = self.pos_config._get_self_order_route()
        self.pos_config.write({
            'self_ordering_mode': 'kiosk',
            'self_ordering_service_mode': 'counter',
            'payment_method_ids': [Command.set(self.online_payment_method.ids)],
            'use_presets': False,
        })
        self.pos_config.with_user(self.pos_user).open_ui()
        self.pos_config.current_session_id.set_opening_control(0, "")
        self.start_tour(self_route, "test_online_payment_kiosk_qr_code")

    def test_kiosk_order_with_online_payment(self):
        """Verify that self ordering works when only an online payment method is configured."""

        self.pos_config.write({
            'self_ordering_mode': 'kiosk',
            'self_ordering_pay_after': 'each',
            'payment_method_ids': [Command.set(self.online_payment_method.ids)],
            'use_presets': False,
        })

        self.pos_config.with_user(self.pos_user).open_ui()
        self.pos_config.current_session_id.set_opening_control(0, "")
        self_route = self.pos_config._get_self_order_route()
        self.start_tour(self_route, "tour_kiosk_online_payment_cart_check")

        # Ensure a POS order was created after the tour
        kiosk_order = self.env['pos.order'].search([('config_id', '=', self.pos_config.id)], order="id desc", limit=1)
        self.assertEqual(len(kiosk_order), 1, "No POS order was created")

        # Collect order lines in a dict by product name
        order_lines = {line.product_id.name: line for line in kiosk_order.lines}
        self.assertEqual(len(order_lines), 2, "There should be exactly 2 order lines")

        coca_line = order_lines.get("Coca-Cola")
        self.assertIsNotNone(coca_line, "Expected order line not found")
        self.assertEqual(coca_line.qty, 1, "Order line quantity mismatch")

        fanta_line = order_lines.get("Fanta")
        self.assertIsNotNone(fanta_line, "Expected order line not found")
        self.assertEqual(fanta_line.qty, 1, "Order line quantity mismatch")
