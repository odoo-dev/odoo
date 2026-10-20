from unittest.mock import patch

from odoo import Command
from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged

from odoo.addons.pos_mercado_pago.models.mercado_pago_pos_request import (
    MercadoPagoPosRequest,
)
from odoo.addons.pos_mercado_pago.models.pos_payment_method import PosPaymentMethod


@tagged('post_install', '-at_install')
class TestMercadoPagoOrders(TransactionCase):
    """ Backend tests for the Mercado Pago Orders API integration.

    The HTTP layer (MercadoPagoPosRequest.call_mercado_pago) is mocked so the
    tests assert *what* the module sends to MP without hitting the network.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Creating the terminals triggers _find_terminal, which would hit MP
        # for real — short-circuit it.
        with cls._mock_find_terminal():
            cls.method = cls.env['pos.payment.method'].create({
                'name': 'Mercado Pago test',
                'type': 'bank',
                'payment_method_type': 'terminal',
                'payment_provider': 'mercado_pago',
                'mp_bearer_token': 'APP_USR-test',
                'mp_webhook_secret_key': 'secret-test',
                'terminal_ids': [
                    Command.create({'mp_id_point_smart': '0123456789'}),
                    Command.create({'mp_id_point_smart': '9876543210'}),
                ],
            })
        cls.terminal_1, cls.terminal_2 = cls.method.terminal_ids

    @classmethod
    def _mock_find_terminal(cls):
        return patch.object(
            PosPaymentMethod, '_find_terminal',
            side_effect=lambda token, point_smart: f'PAX_A910__SMARTPOS{point_smart}',
        )

    def test_create_order_payload(self):
        captured = {}

        def fake_call(self, method, endpoint, payload, idempotent=False):
            captured.update({
                'method': method, 'endpoint': endpoint,
                'payload': payload, 'idempotent': idempotent,
            })
            return {'id': 'ORD01TEST', 'status': 'created'}

        # Without terminal (e.g. from the Self Order Kiosk), the first terminal is used
        with patch.object(MercadoPagoPosRequest, 'call_mercado_pago', fake_call):
            resp = self.method.mp_order_create({
                'type': 'point',
                'external_reference': '1_2_aaaa-bbbb-cccc-dddd-eeeeffff0000',
                'transactions': {'payments': [{'amount': '12.50'}]},
            })

        self.assertEqual(resp['id'], 'ORD01TEST')
        self.assertEqual(captured['method'], 'post')
        self.assertEqual(captured['endpoint'], '/v1/orders')
        self.assertTrue(captured['idempotent'], "create order must send X-Idempotency-Key")
        # Terminal id must be injected server-side and not trusted from the
        # frontend.
        self.assertEqual(
            captured['payload']['config']['point']['terminal_id'],
            'PAX_A910__SMARTPOS0123456789',
        )
        self.assertEqual(captured['payload']['type'], 'point')
        self.assertEqual(captured['payload']['transactions']['payments'][0]['amount'], '12.50')
        # Orders must carry their own expiration and webhook target (Mercado
        # Pago certification requirements).
        self.assertIn('expiration_time', captured['payload'])
        # Integrator id goes in the body, not an X-platform-id header.
        self.assertEqual(
            captured['payload']['integration_data']['platform_id'],
            'dev_cdf1cfac242111ef9fdebe8d845d0987',
        )

    def test_get_order_endpoint(self):
        captured = {}

        def fake_call(self, method, endpoint, payload, idempotent=False):
            captured.update({'method': method, 'endpoint': endpoint, 'idempotent': idempotent})
            return {'id': 'ORD01TEST', 'status': 'processed',
                    'transactions': {'payments': [{'id': 'PAY1', 'status': 'processed'}]}}

        with patch.object(MercadoPagoPosRequest, 'call_mercado_pago', fake_call):
            resp = self.method.mp_order_get('ORD01TEST')

        self.assertEqual(captured['method'], 'get')
        self.assertEqual(captured['endpoint'], '/v1/orders/ORD01TEST')
        self.assertFalse(captured['idempotent'])
        self.assertEqual(resp['transactions']['payments'][0]['status'], 'processed')

    def test_refund_total_sends_empty_body(self):
        captured = {}

        def fake_call(self, method, endpoint, payload, idempotent=False):
            captured.update({
                'method': method, 'endpoint': endpoint,
                'payload': payload, 'idempotent': idempotent,
            })
            return {'id': 'ORD01TEST', 'status': 'refunded'}

        with patch.object(MercadoPagoPosRequest, 'call_mercado_pago', fake_call):
            self.method.mp_order_refund('ORD01TEST', amount=None)

        self.assertEqual(captured['method'], 'post')
        self.assertEqual(captured['endpoint'], '/v1/orders/ORD01TEST/refund')
        self.assertEqual(captured['payload'], {})
        self.assertTrue(captured['idempotent'])

    def test_refund_partial_fetches_payment_id_and_sends_body(self):
        calls = []

        def fake_call(self, method, endpoint, payload, idempotent=False):
            calls.append({
                'method': method, 'endpoint': endpoint,
                'payload': payload, 'idempotent': idempotent,
            })
            if method == 'get':
                return {'id': 'ORD01TEST', 'status': 'processed',
                        'transactions': {'payments': [{'id': 'PAY01ABC', 'amount': '50.00', 'status': 'processed'}]}}
            return {'id': 'ORD01TEST', 'status': 'refunded'}

        with patch.object(MercadoPagoPosRequest, 'call_mercado_pago', fake_call):
            self.method.mp_order_refund('ORD01TEST', amount='12.50')

        self.assertEqual(calls[0]['method'], 'get')
        self.assertEqual(calls[0]['endpoint'], '/v1/orders/ORD01TEST')
        self.assertEqual(calls[1]['method'], 'post')
        self.assertEqual(calls[1]['endpoint'], '/v1/orders/ORD01TEST/refund')
        self.assertEqual(calls[1]['payload'], {'transactions': [{'id': 'PAY01ABC', 'amount': '12.50'}]})
        self.assertTrue(calls[1]['idempotent'])

    def test_find_terminal_uses_orders_api_endpoint(self):
        captured = {}

        def fake_call(self, method, endpoint, payload, idempotent=False):
            captured.update({'method': method, 'endpoint': endpoint})
            return {
                'data': {'terminals': [
                    {'id': 'PAX_A910__SMARTPOS0123456789', 'operating_mode': 'PDV'},
                    {'id': 'PAX_A910__SMARTPOS9999999999', 'operating_mode': 'STANDALONE'},
                ]},
                'paging': {'total': 2, 'offset': 0, 'limit': 50},
            }

        with patch.object(MercadoPagoPosRequest, 'call_mercado_pago', fake_call):
            resolved = self.method._find_terminal('APP_USR-test', '0123456789')

        self.assertEqual(captured['method'], 'get')
        self.assertEqual(captured['endpoint'], '/terminals/v1/list')
        self.assertEqual(resolved, 'PAX_A910__SMARTPOS0123456789')

    def test_create_order_uses_terminal(self):
        captured = {}

        def fake_call(self, method, endpoint, payload, idempotent=False):
            captured.update({'payload': payload})
            return {'id': 'ORD01TEST', 'status': 'created'}

        with patch.object(MercadoPagoPosRequest, 'call_mercado_pago', fake_call):
            self.method.mp_order_create({'type': 'point'}, self.terminal_2.id)
        self.assertEqual(
            captured['payload']['config']['point']['terminal_id'],
            'PAX_A910__SMARTPOS9876543210',
        )

        with self._mock_find_terminal():
            other_terminal = self.method.copy().terminal_ids[0]
        with patch.object(MercadoPagoPosRequest, 'call_mercado_pago', fake_call), self.assertRaises(ValidationError):
            self.method.mp_order_create({'type': 'point'}, other_terminal.id)

    def test_find_terminal_on_terminal_and_token_change(self):
        with self._mock_find_terminal() as mock_find_terminal:
            self.terminal_2.mp_id_point_smart = '5555555555'
        mock_find_terminal.assert_called_once_with('APP_USR-test', '5555555555')
        self.assertEqual(self.terminal_2.mp_id_point_smart_complet, 'PAX_A910__SMARTPOS5555555555')

        with self._mock_find_terminal() as mock_find_terminal:
            self.method.mp_bearer_token = 'APP_USR-other'
        self.assertEqual(
            [call.args for call in mock_find_terminal.call_args_list],
            [('APP_USR-other', '0123456789'), ('APP_USR-other', '5555555555')],
        )

    def test_force_pdv_sets_all_terminals(self):
        captured = {}

        def fake_call(self, method, endpoint, payload, idempotent=False):
            captured.update({'method': method, 'endpoint': endpoint, 'payload': payload})
            return {'terminals': [{**terminal, 'operating_mode': 'PDV'} for terminal in payload['terminals']]}

        with patch.object(MercadoPagoPosRequest, 'call_mercado_pago', fake_call):
            self.method.force_pdv()

        self.assertEqual(captured['method'], 'patch')
        self.assertEqual(captured['endpoint'], '/terminals/v1/setup')
        self.assertEqual(captured['payload'], {'terminals': [
            {'id': 'PAX_A910__SMARTPOS0123456789', 'operating_mode': 'PDV'},
            {'id': 'PAX_A910__SMARTPOS9876543210', 'operating_mode': 'PDV'},
        ]})

    def test_terminal_required(self):
        with self.assertRaises(ValidationError):
            self.method.terminal_ids = [Command.clear()]
