# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
from unittest.mock import patch

import odoo.tests
from odoo import Command
from odoo.tools import mute_logger

from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon
from odoo.addons.pos_viva_com.models.pos_payment_method import PosPaymentMethod


@odoo.tests.tagged('post_install', '-at_install')
class TestVivaComHttpCommon(TestPointOfSaleHttpCommon):

    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # Create Viva.com payment method
        viva_payment_method = cls.env['pos.payment.method'].create({
            'name': 'Viva',
            'type': 'bank',
            'journal_id': cls.bank_journal.id,
            'payment_provider': 'viva_com',
            'viva_com_merchant_id': 'test-merchant-id',
            'viva_com_api_key': 'test-api-key',
            'viva_com_client_id': 'test-client-id',
            'viva_com_client_secret': 'test-client-secret',
            'terminal_ids': [Command.create({'viva_com_terminal_id': '01234543210'})],
        })
        payment_methods = cls.main_pos_config.payment_method_ids | viva_payment_method
        cls.main_pos_config.write({'payment_method_ids': [Command.set(payment_methods.ids)]})

    def test_viva_payment_and_refund(self):
        viva_session_id = ''

        def mocked_call_viva_com_check_post_data(self, endpoint, action, data=None, should_retry=True):
            nonlocal viva_session_id
            if endpoint == 'transactions:sale' and action == 'post':
                if not isinstance(data['amount'], int):
                    raise TypeError(f"Expected 'amount' to be an integer, but got {data['amount']}.")
                if not data['terminalId'] == '01234543210':
                    raise Exception(f"Expected 'terminalId' to be 01234543210, but got {data['terminalId']}")
                if not data.get('sessionId'):
                    raise Exception("Expected 'sessionId' to be present")
                viva_session_id = data['sessionId']
            elif endpoint == 'transactions:refund' and action == 'post':
                if not data['parentSessionId'] == viva_session_id:
                    raise Exception(f"Expected 'parentSessionId' to be {viva_session_id}, but got {data['parentSessionId']}")
                if not data.get('sessionId'):
                    raise Exception("Expected 'sessionId' to be present")
                viva_session_id = data['sessionId']
            elif endpoint == 'sessions/123' and action == 'get':
                return {"success": True, "sessionId": viva_session_id}
            else:
                raise Exception(f"Unexpected Viva request: endpoint='{endpoint}', method='{action}'")
            return {}

        with patch.object(PosPaymentMethod, '_call_viva_com', mocked_call_viva_com_check_post_data):
            self.main_pos_config.open_ui()
            self.start_tour("/pos/ui/%d" % self.main_pos_config.id, 'VivaComTour', login="accountman")

    def test_viva_com_kiosk_request_data(self):
        """Kiosk: ``cashRegisterId`` must fall back to ``pos.config.name``."""
        config_name = self.main_pos_config.name

        def mocked_call_viva_com_kiosk(self, endpoint, action, data=None):
            if action == 'post' and data is not None:
                cash_register_id = data.get('cashRegisterId')
                if cash_register_id != config_name:
                    raise AssertionError(
                        "Without a cashier, Viva payload must use pos.config.name as cashRegisterId "
                        f"(expected {config_name!r}, got {cash_register_id!r})",
                    )
            return {}

        with patch.object(PosPaymentMethod, '_call_viva_com', mocked_call_viva_com_kiosk):
            self.main_pos_config.open_ui()
            self.start_tour(
                "/pos/ui?config_id=%d" % self.main_pos_config.id,
                'VivaComKioskTour',
                login="accountman",
            )

    def _post_viva_notification(self, company, terminal_id):
        return self.url_open(
            f'/pos_viva_com/notification?company_id={company.id}&token=viva_com_test',
            data=json.dumps({'EventTypeId': 1796, 'EventData': {'TerminalId': terminal_id, 'MerchantTrns': '123/1'}}),
            headers={'Content-Type': 'application/json'},
        )

    def test_viva_com_webhook_resolves_terminal(self):
        other_viva_payment_method = self.env['pos.payment.method'].create({
            'name': 'Viva 2',
            'type': 'bank',
            'journal_id': self.bank_journal.id,
            'payment_provider': 'viva_com',
            'viva_com_merchant_id': 'test-merchant-id',
            'viva_com_api_key': 'test-api-key',
            'viva_com_client_id': 'test-client-id',
            'viva_com_client_secret': 'test-client-secret',
            'terminal_ids': [
                Command.create({'viva_com_terminal_id': '11111111'}),
                Command.create({'viva_com_terminal_id': '22222222'}),
            ],
        })
        company = other_viva_payment_method.company_id

        with patch.object(PosPaymentMethod, '_retrieve_session_id', autospec=True) as mock_retrieve:
            response = self._post_viva_notification(company, '22222222')
        self.assertEqual(response.json(), {'Key': 'viva_com_test'})
        self.assertEqual(mock_retrieve.call_count, 1)
        self.assertEqual(mock_retrieve.call_args.args[0], other_viva_payment_method)
        self.assertEqual(mock_retrieve.call_args.args[1]['TerminalId'], '22222222')

        with patch.object(PosPaymentMethod, '_retrieve_session_id', autospec=True) as mock_retrieve, \
                mute_logger('odoo.addons.pos_viva_com.controllers.main'):
            response = self._post_viva_notification(company, '33333333')
        self.assertEqual(response.json(), {'Key': 'viva_com_test'})
        mock_retrieve.assert_not_called()
