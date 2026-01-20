import json
import logging
from base64 import b64encode

from requests import PreparedRequest, Response, Session

from odoo.tests.common import tagged
from odoo.tools.misc import file_open

from odoo.addons.account_peppol.tests.test_peppol_messages import TestPeppolMessage

_logger = logging.getLogger(__name__)

FILE_PATH = 'l10n_sg_sale_peppol/tests/assets'
FAKE_UUID = ['yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy',
             'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz']


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestPeppolOrderImportFlow(TestPeppolMessage):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.test_product_a = cls.env["product.product"].create(
            {
                "name": "Needle 4mm",
                "default_code": "121212",
                "type": "consu",
                "list_price": 50,
            },
        )

    @classmethod
    def _request_handler(cls, s: Session, r: PreparedRequest, /, **kw):
        response = Response()
        response.status_code = 200
        url = r.path_url.lower()

        if url == '/api/peppol/1/get_document':
            body = json.loads(r.body)
            uuid = body['params']['message_uuids'][0]
            if uuid == FAKE_UUID[0]:
                response_content = {
                    'accounting_supplier_party': False,
                    'filename': 'test_outgoing.xml',
                    'enc_key': '',
                    'document': '',
                    'state': 'done' if not cls.env.context.get('error') else 'error',
                    'direction': 'outgoing',
                    'document_type': 'Invoice',
                }
            elif uuid == FAKE_UUID[1]:
                response_content = {
                    'accounting_supplier_party': '0198:dk16356706',
                    'filename': 'test_incoming',
                    'enc_key': file_open(f'{FILE_PATH}/enc_key', mode='rb').read(),
                    'document': b64encode(file_open(f'{FILE_PATH}/{cls.mocked_incoming_invoice_fname}', mode='rb').read()),
                    'state': 'done' if not cls.env.context.get('error') else 'error',
                    'direction': 'incoming',
                    'document_type': 'Invoice',
                    'origin_message_uuid': 'not_used_on_advanced_order',
                }
            response.json = lambda: {'result': {uuid: response_content}}
            return response

        return super()._request_handler(s, r, **kw)

    def test_end_to_end_basic_order_processing(self):
        """Test complete workflow from XML document to sale order creation - basic order"""
        cls = self.__class__
        cls.mocked_incoming_invoice_fname = 'order_encrypted'

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        order_tx = order.l10n_sg_peppol_order_tx_ids[0]
        self.assertRecordValues(
            order_tx,
            [{
                'document_type': 'order',
                'state': 'to_reply',
            }],
        )
        order.action_accept_peppol_order()
        self.assertRecordValues(order_tx, [{
            'state': 'accepted',
        }])

    def test_order_change_processing(self):
        """ Test complete workflow from XML document to sale order creation and follow up receipt
            of order change request.
        """
        cls = self.__class__

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        cls.mocked_incoming_invoice_fname = 'order_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        # Test order amount total
        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        self.assertEqual(order.amount_total, 840.0)

        cls.mocked_incoming_invoice_fname = 'order_change_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        # Test log notes
        messages = order.message_ids.filtered(lambda m: 'Line changed: Item 1' in m.body)
        self.assertTrue(messages)

        order.action_apply_peppol_order_change()
        self.assertEqual(order.amount_total, 600.0)

    def test_order_cancel_processing(self):
        """ Test complete workflow from XML document to sale order creation and follow up receipt
            of order cancellation request.
        """
        cls = self.__class__

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        cls.mocked_incoming_invoice_fname = 'order_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        cls.mocked_incoming_invoice_fname = 'order_cancel_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        order.action_apply_peppol_order_cancel()
        self.assertEqual(order.state, 'cancel')

    def test_order_rejection_processing(self):
        """Test complete workflow from XML document to sale order creation - order rejection"""
        cls = self.__class__
        cls.mocked_incoming_invoice_fname = 'order_encrypted'

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        order_tx = order.l10n_sg_peppol_order_tx_ids[0]
        self.assertRecordValues(
            order_tx,
            [{
                'document_type': 'order',
                'state': 'to_reply',
            }],
        )
        order.action_reject_peppol_order()
        self.assertRecordValues(order_tx, [{
            'state': 'rejected',
        }])

    def test_order_change_rejection_processing(self):
        """ Test complete workflow from XML document to sale order creation and follow up receipt
            of order change request rejection.
        """
        cls = self.__class__

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        cls.mocked_incoming_invoice_fname = 'order_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        # Test order amount total
        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        original_amount = order.amount_total
        self.assertEqual(original_amount, 840.0)

        cls.mocked_incoming_invoice_fname = 'order_change_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        # Test log notes
        messages = order.message_ids.filtered(lambda m: 'Line changed: Item 1' in m.body)
        self.assertTrue(messages)

        order_change_tx = order.l10n_sg_peppol_order_tx_ids.filtered_domain([
            ('document_type', '=', 'order_change'),
        ])[0]
        order.action_reject_peppol_order_change()
        self.assertRecordValues(order_change_tx, [{
            'state': 'rejected',
        }])
        # Verify order amount remains unchanged after rejection
        self.assertEqual(order.amount_total, original_amount)

    def test_order_cancel_rejection_processing(self):
        """ Test complete workflow from XML document to sale order creation and follow up receipt
            of order cancellation request rejection.
        """
        cls = self.__class__

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        cls.mocked_incoming_invoice_fname = 'order_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        cls.mocked_incoming_invoice_fname = 'order_cancel_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        order_cancel_tx = order.l10n_sg_peppol_order_tx_ids.filtered_domain([
            ('document_type', '=', 'order_cancel'),
        ])[0]
        # Verify order is not cancelled before rejection
        self.assertNotEqual(order.state, 'cancel')
        order.action_reject_peppol_order_cancel()
        self.assertRecordValues(order_cancel_tx, [{
            'state': 'rejected',
        }])
        # Verify order remains active (not cancelled) after rejecting the cancellation
        self.assertNotEqual(order.state, 'cancel')
