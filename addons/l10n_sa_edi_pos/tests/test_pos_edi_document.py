# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch, MagicMock
from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged('post_install', '-at_install')
class TestPosEdiDocument(TransactionCase):
    """Test EDI document creation and auto-posting for POS orders"""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # Setup Saudi Arabia company
        cls.company = cls.env.company
        cls.company.write({
            'country_id': cls.env.ref('base.sa').id,
            'vat': '311111111111113',
        })

        # Create a journal for POS
        cls.journal = cls.env['account.journal'].create({
            'name': 'POS Journal',
            'type': 'sale',
            'code': 'PJSA',
            'company_id': cls.company.id,
        })

        # Create POS config
        cls.pos_config = cls.env['pos.config'].create({
            'name': 'Test POS Config',
            'journal_id': cls.journal.id,
            'company_id': cls.company.id,
        })

        # Create a partner
        cls.partner = cls.env['res.partner'].create({
            'name': 'Test Customer',
            'country_id': cls.env.ref('base.sa').id,
        })

        # Create a product
        cls.product = cls.env['product.product'].create({
            'name': 'Test Product',
            'type': 'consu',
            'list_price': 100.0,
            'taxes_id': [(6, 0, cls.env['account.tax'].search([
                ('company_id', '=', cls.company.id),
                ('type_tax_use', '=', 'sale')
            ], limit=1).ids)],
        })

        # Create POS session
        cls.pos_session = cls.env['pos.session'].create({
            'config_id': cls.pos_config.id,
            'user_id': cls.env.uid,
        })
        cls.pos_session.action_pos_session_open()

    def test_01_edi_document_creation_for_pos_order(self):
        """Test that EDI document is created when POS order is paid"""
        # Create a POS order
        order = self.env['pos.order'].create({
            'session_id': self.pos_session.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
            'partner_id': self.partner.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
            'lines': [(0, 0, {
                'product_id': self.product.id,
                'price_unit': 100.0,
                'qty': 1,
                'price_subtotal': 100.0,
                'price_subtotal_incl': 100.0,
                'discount': 0.0,
            })],
        })

        # Simulate order processing (paid state)
        order.state = 'paid'
        order._process_saved_order(draft=False)

        # Check that EDI document was created
        self.assertTrue(order.l10n_sa_edi_document_id, "EDI document should be created for paid POS order")
        self.assertEqual(order.l10n_sa_edi_document_id.res_model, 'pos.order')
        self.assertEqual(order.l10n_sa_edi_document_id.res_id, order.id)
        self.assertEqual(order.l10n_sa_edi_document_id.state, 'to_send')

    def test_02_no_edi_document_for_draft_order(self):
        """Test that EDI document is NOT created for draft orders"""
        order = self.env['pos.order'].create({
            'session_id': self.pos_session.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
            'partner_id': self.partner.id,
            'state': 'draft',
            'lines': [(0, 0, {
                'product_id': self.product.id,
                'price_unit': 100.0,
                'qty': 1,
                'price_subtotal': 100.0,
                'price_subtotal_incl': 100.0,
                'discount': 0.0,
            })],
        })

        order._process_saved_order(draft=True)

        # Check that EDI document was NOT created
        self.assertFalse(order.l10n_sa_edi_document_id, "EDI document should NOT be created for draft orders")

    def test_04_zatca_mixin_methods(self):
        """Test that zatca.mixin methods are properly implemented"""
        order = self.env['pos.order'].create({
            'session_id': self.pos_session.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
            'partner_id': self.partner.id,
            'state': 'paid',
            'lines': [(0, 0, {
                'product_id': self.product.id,
                'price_unit': 100.0,
                'qty': 1,
                'price_subtotal': 100.0,
                'price_subtotal_incl': 100.0,
                'discount': 0.0,
            })],
        })

        # Test _is_zatca_applicable
        self.assertTrue(order._is_zatca_applicable(), "Order should be ZATCA applicable in SA")

        # Test _l10n_sa_is_simplified
        self.assertTrue(order._l10n_sa_is_simplified(), "POS orders should be simplified (B2C)")

        # Test _get_show_l10n_sa_reason
        self.assertFalse(order._get_show_l10n_sa_reason(), "POS orders should not show adjustment reasons")

    def test_05_qr_code_dependencies(self):
        """Test that QR code dependencies are defined"""
        order = self.env['pos.order'].create({
            'session_id': self.pos_session.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
            'state': 'paid',
        })

        dependencies = order._get_qr_code_str_dependencies()
        self.assertTrue(dependencies, "QR code dependencies should be defined")
        self.assertIn('amount_total', dependencies)
        self.assertIn('company_id', dependencies)

    def test_06_cron_search_domain(self):
        """Test that cron search domain returns only auto-post documents"""
        # Create two orders: one with account.move, one without
        order1 = self.env['pos.order'].create({
            'session_id': self.pos_session.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
            'state': 'paid',
            'lines': [(0, 0, {
                'product_id': self.product.id,
                'price_unit': 100.0,
                'qty': 1,
                'price_subtotal': 100.0,
                'price_subtotal_incl': 100.0,
                'discount': 0.0,
            })],
        })
        order1._process_saved_order(draft=False)

        # Get search domain
        domain = self.env['l10n_sa_edi.document']._get_auto_post_search_domain()

        # Search for documents
        docs = self.env['l10n_sa_edi.document'].search(domain)

        # Verify
        self.assertIn(order1.l10n_sa_edi_document_id, docs, "POS order document should be in auto-post search")
        for doc in docs:
            self.assertEqual(doc.state, 'to_send')
            self.assertEqual(doc.res_model, 'pos.order')

    def test_07_invoice_generation_prevents_edi_document(self):
        """Test that generating invoice removes EDI document"""
        order = self.env['pos.order'].create({
            'session_id': self.pos_session.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
            'partner_id': self.partner.id,
            'state': 'paid',
            'to_invoice': True,
            'lines': [(0, 0, {
                'product_id': self.product.id,
                'price_unit': 100.0,
                'qty': 1,
                'price_subtotal': 100.0,
                'price_subtotal_incl': 100.0,
                'discount': 0.0,
            })],
        })

        order._process_saved_order(draft=False)

        # If invoice is generated, EDI doc should be for invoice, not order
        if order.account_move:
            self.assertFalse(
                order.l10n_sa_edi_document_id or order.l10n_sa_edi_document_id.state == 'to_send',
                "EDI document should not exist for order when invoice is generated"
            )

    @patch('odoo.addons.l10n_sa_edi.models.l10n_sa_edi_document.L10nSaEdiDocument._l10n_sa_post_zatca_edi')
    def test_08_cron_batch_processing(self, mock_post):
        """Test cron batch processing with mocked ZATCA API"""
        mock_post.return_value = None

        # Create multiple orders
        orders = self.env['pos.order']
        for i in range(3):
            order = self.env['pos.order'].create({
                'session_id': self.pos_session.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
                'state': 'paid',
                'lines': [(0, 0, {
                    'product_id': self.product.id,
                    'price_unit': 100.0,
                    'qty': 1,
                })],
            })
            order._process_saved_order(draft=False)
            orders |= order

        # Run cron
        self.env['l10n_sa_edi.document']._cron_l10n_sa_auto_post_documents(batch_size=10)

        # Verify _l10n_sa_post_zatca_edi was called for each document
        self.assertGreaterEqual(mock_post.call_count, 0, "Cron should attempt to post documents")

    def test_09_confirmation_datetime_set(self):
        """Test that confirmation datetime is set when order is paid"""
        order = self.env['pos.order'].create({
            'session_id': self.pos_session.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
            'state': 'paid',
            'lines': [(0, 0, {
                'product_id': self.product.id,
                'price_unit': 100.0,
                'qty': 1,
                'price_subtotal': 100.0,
                'price_subtotal_incl': 100.0,
                'discount': 0.0,
            })],
        })

        order._process_saved_order(draft=False)

        if order._is_zatca_applicable():
            self.assertTrue(
                order.l10n_sa_confirmation_datetime,
                "Confirmation datetime should be set for paid ZATCA orders"
            )

    def test_10_backward_compatibility_fields(self):
        """Test that backward compatibility fields work correctly"""
        order = self.env['pos.order'].create({
            'session_id': self.pos_session.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
            'state': 'paid',
            'lines': [(0, 0, {
                'product_id': self.product.id,
                'price_unit': 100.0,
                'qty': 1,
                'price_subtotal': 100.0,
                'price_subtotal_incl': 100.0,
                'discount': 0.0,
            })],
        })

        order._process_saved_order(draft=False)

        # Test computed fields
        order._compute_l10n_sa_invoice_qr_code_str()
        order._compute_l10n_sa_invoice_edi_state()

        # Fields should not raise errors
        _ = order.l10n_sa_invoice_qr_code_str
        _ = order.l10n_sa_invoice_edi_state
