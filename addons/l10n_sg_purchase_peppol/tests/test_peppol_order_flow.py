from base64 import b64encode

from odoo.exceptions import ValidationError
from odoo.tests import tagged
from odoo.tools.misc import file_open

from odoo.addons.account_peppol.tests.common import PeppolConnectorCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestPeppolPurchaseOrderFlow(PeppolConnectorCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Programmatic PEPPOL setup so tests run on a fresh DB (no manual registration).
        cls.env.company.write({
            'peppol_eas': '0208',
            'peppol_endpoint': '0477472701',
            'account_peppol_proxy_state': 'sender',
        })
        edi_identification = cls.env['account_edi_proxy_client.user']._get_proxy_identification(
            cls.env.company, 'peppol'
        )
        cls.private_key = cls.env['certificate.key'].create({
            'name': 'Test key PEPPOL',
            'content': b64encode(file_open('account_peppol/tests/assets/private_key.pem', 'rb').read()),
        })
        cls.env['account_edi_proxy_client.user'].create({
            'id_client': 'test-peppol-purchase-order-flow',
            'company_id': cls.env.company.id,
            'proxy_type': 'peppol',
            'edi_mode': 'test',
            'edi_identification': edi_identification,
            'private_key_id': cls.private_key.id,
            'refresh_token': 'test-refresh-token',
        })

        # Vendor (receiver of the order) must have Peppol identifier for sending.
        cls.partner_a.vat = 'NL123456782B90'
        cls.partner_a.peppol_eas = '0208'
        cls.partner_a.peppol_endpoint = '0239843189'  # Valid format for EAS 0208 (Belgium)

        cls.env.company.vat = 'BE0477472701'
        cls.po = cls.env['purchase.order'].create({
            'name': 'Test PO',
            'partner_id': cls.partner_a.id,
            'order_line': [(0, 0, {
                'product_id': cls.product_a.id,
                'name': 'Product A',
                'product_qty': 10.0,
                'price_unit': 50.0,
            })],
        })

    def test_send_initial_order(self):
        """Test sending initial order creates a transaction."""
        po = self.po
        self.assertEqual(po.state, 'draft')
        self.assertTrue(po.l10n_sg_peppol_can_send_order)
        self.assertEqual(len(po.l10n_sg_peppol_order_tx_ids), 0)

        po.action_send_advanced_order()
        self.assertFalse(po.l10n_sg_peppol_can_send_order)
        self.assertEqual(len(po.l10n_sg_peppol_order_tx_ids), 1)

        tx = po.l10n_sg_peppol_order_tx_ids[:1]
        self.assertEqual(tx.state, 'sent')
        self.assertEqual(tx.document_type, 'order')
        self.assertEqual(tx.sequence, 0)

    def test_receive_order_accept(self):
        """Test receiving order accept confirms the order and marks tx accepted."""
        po = self.po
        po.action_send_advanced_order()

        po.handle_order_response_advanced(False, 'AP')
        self.assertEqual(po.state, 'purchase')

        tx = po.l10n_sg_peppol_order_tx_ids.filtered(lambda t: t.document_type == 'order')[:1]
        self.assertEqual(tx.state, 'accepted')

        messages = po.message_ids.filtered(lambda m: 'Order is accepted by the seller' in m.body)
        self.assertTrue(messages)

    def test_receive_order_reject(self):
        """Test receiving order reject cancels the order and marks tx rejected."""
        po = self.po
        po.action_send_advanced_order()

        po.handle_order_response_advanced(False, 'RE')
        self.assertEqual(po.state, 'cancel')

        tx = po.l10n_sg_peppol_order_tx_ids.filtered(lambda t: t.document_type == 'order')[:1]
        self.assertEqual(tx.state, 'rejected')

        messages = po.message_ids.filtered(lambda m: 'Order is rejected by the seller' in m.body)
        self.assertTrue(messages)

    def test_send_order_change(self):
        """Test sending order change creates a new order_change transaction."""
        po = self.po
        po.action_send_advanced_order()
        po.handle_order_response_advanced(False, 'AP')
        self.assertTrue(po.l10n_sg_peppol_can_send_order_change)

        initial_tx_count = len(po.l10n_sg_peppol_order_tx_ids)
        po.action_send_order_change()
        self.assertEqual(len(po.l10n_sg_peppol_order_tx_ids), initial_tx_count + 1)
        self.assertFalse(po.l10n_sg_peppol_can_send_order_change)

        change_tx = po.l10n_sg_peppol_order_tx_ids.filtered(lambda t: t.document_type == 'order_change')[:1]
        self.assertEqual(change_tx.state, 'sent')
        self.assertEqual(change_tx.sequence, 1)
        self.assertTrue(change_tx.order_change_ref)

    def test_receive_change_accept(self):
        """Test receiving order change accept marks change tx accepted."""
        po = self.po
        po.action_send_advanced_order()
        po.handle_order_response_advanced(False, 'AP')
        po.action_send_order_change()

        change_tx = po.l10n_sg_peppol_order_tx_ids.filtered(lambda t: t.document_type == 'order_change')[:1]
        po.handle_order_response_advanced(change_tx.order_change_ref, 'AP')

        self.assertEqual(change_tx.state, 'accepted')
        self.assertTrue(po.l10n_sg_peppol_can_send_order_change)
        messages = po.message_ids.filtered(lambda m: 'Order change request is accepted by the seller' in m.body)
        self.assertTrue(messages)

    def test_receive_change_reject(self):
        """Test receiving order change reject reverts the order to last accepted tx."""
        po = self.po
        po.action_send_advanced_order()
        po.handle_order_response_advanced(False, 'AP')

        po.order_line[:1].product_qty = 12.0
        po.action_send_order_change()
        change_tx = po.l10n_sg_peppol_order_tx_ids.filtered(lambda t: t.document_type == 'order_change')[:1]
        po.handle_order_response_advanced(change_tx.order_change_ref, 'RE')

        self.assertEqual(change_tx.state, 'rejected')
        self.assertEqual(po.order_line[:1].product_qty, 10.0)
        messages = po.message_ids.filtered(lambda m: 'Order change request is rejected by the seller' in m.body)
        self.assertTrue(messages)

    def test_send_order_cancel(self):
        """Test sending order cancel creates an order_cancel transaction."""
        po = self.po
        po.action_send_advanced_order()
        po.handle_order_response_advanced(False, 'AP')
        self.assertTrue(po.l10n_sg_peppol_can_send_order_cancel)
        initial_tx_count = len(po.l10n_sg_peppol_order_tx_ids)

        po.action_send_order_cancel()

        self.assertEqual(len(po.l10n_sg_peppol_order_tx_ids), initial_tx_count + 1)
        self.assertFalse(po.l10n_sg_peppol_can_send_order_cancel)
        cancel_tx = po.l10n_sg_peppol_order_tx_ids.filtered(
            lambda t: t.document_type == 'order_cancel'
        ).sorted()[:1]
        self.assertEqual(cancel_tx.state, 'sent')

    def test_receive_cancel_accept(self):
        """Test receiving cancellation accept c  ancels the order."""
        po = self.po
        po.action_send_advanced_order()
        po.handle_order_response_advanced(False, 'AP')
        po.action_send_order_cancel()
        po.handle_order_response_advanced(False, 'RE')

        cancel_tx = po.l10n_sg_peppol_order_tx_ids.filtered(
            lambda t: t.document_type == 'order_cancel'
        ).sorted()[:1]
        self.assertEqual(po.state, 'cancel')
        self.assertEqual(cancel_tx.state, 'accepted')

    def test_receive_cancel_reject(self):
        """Test receiving cancellation reject keeps the order confirmed."""
        po = self.po
        po.action_send_advanced_order()
        po.handle_order_response_advanced(False, 'AP')
        po.action_send_order_cancel()
        po.handle_order_response_advanced(False, 'AP')

        cancel_tx = po.l10n_sg_peppol_order_tx_ids.filtered(
            lambda t: t.document_type == 'order_cancel'
        ).sorted()[:1]
        self.assertEqual(po.state, 'purchase')
        self.assertEqual(cancel_tx.state, 'rejected')

    def test_invalid_event(self):
        """Test invalid response code raises ValidationError."""
        po = self.po
        po.action_send_advanced_order()
        with self.assertRaises(ValidationError):
            po.handle_order_response_advanced(False, 'XX')

    def test_edi_tracker_computation(self):
        """Test transaction creation."""
        po = self.po
        po.action_send_advanced_order()
        self.assertEqual(len(po.l10n_sg_peppol_order_tx_ids), 1)
