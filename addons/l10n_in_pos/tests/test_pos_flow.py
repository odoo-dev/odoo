from odoo.tests import tagged
from .common import TestInPosBase


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestPosFlow(TestInPosBase):
    """
    Test class for GSTR-related POS functionality.
    """
    _test_user_groups = None  # FIXME list needed groups

    def test_missing_hsn_after_resolving_draft_orders(self):
        session = self.open_new_session(0.0)
        self.product_a.l10n_in_hsn_code = False
        draft_order = self._create_order({
            'pos_order_lines_ui_args': [(self.product_a, 1.0)],
            'pos_order_ui_args': {'state': 'draft'},
            'payments': [],
        })
        self.assertFalse(session.set_missing_hsn_codes_in_pos_orders())
        self.assertEqual(session.close_session_from_ui()['type'], 'draft_orders')

        paid_order = self._create_order({
            'pos_order_lines_ui_args': [(self.product_a, 1.0)],
            'payments': [(self.bank_pm1, 105.0)],
        })
        self.assertEqual(session.set_missing_hsn_codes_in_pos_orders(), paid_order.lines)
        self.assertEqual(session.close_session_from_ui()['type'], 'draft_orders')

        draft_order.cancel_order_from_pos()
        self.assertEqual(session.close_session_from_ui()['type'], 'missing_hsn_codes')
        self.product_a.l10n_in_hsn_code = '1111'
        self.assertTrue(session.close_session_from_ui()['status'])
        self.assertEqual(paid_order.lines.l10n_in_hsn_code, '1111')
        self.assertFalse(draft_order.lines.l10n_in_hsn_code)

    def test_missing_hsn_draft_order_processed(self):
        session = self.open_new_session(0.0)
        self.product_a.l10n_in_hsn_code = False
        order = self._create_order({
            'pos_order_lines_ui_args': [(self.product_a, 1.0)],
            'pos_order_ui_args': {'state': 'draft'},
            'payments': [],
        })
        self.assertEqual(session.close_session_from_ui()['type'], 'draft_orders')
        order.add_payment({
            'pos_order_id': order.id,
            'payment_method_id': self.bank_pm1.id,
            'amount': 105.0,
        })
        order.action_pos_order_paid()
        self.assertEqual(session.close_session_from_ui()['type'], 'missing_hsn_codes')

    def test_missing_hsn_only_cancelled_orders(self):
        session = self.open_new_session(0.0)
        self.product_a.l10n_in_hsn_code = False
        order = self._create_order({
            'pos_order_lines_ui_args': [(self.product_a, 1.0)],
            'pos_order_ui_args': {'state': 'draft'},
            'payments': [],
        })
        self.assertEqual(session.close_session_from_ui()['type'], 'draft_orders')
        order.cancel_order_from_pos()
        self.assertTrue(session.close_session_from_ui()['status'])

    def test_invoice_order_after_session_closed(self):
        """Test that an order can be invoiced after its session is closed.
        Scenario:
            1. Create a POS session and two orders:
            - Order A: Not to be invoiced immediately.
            - Order B: To be invoiced immediately.
            2. Close the POS session.
            3. Ensure:
            - Both orders have `reversed_move_ids` unset.
            4. Assign a partner to Order A and invoice it AFTER the session is closed.
            - Confirm that `reversed_move_ids` is set accordingly.
        """

        with self.with_pos_session():
            # Create a POS order without an invoice, simulating basic sale and payment
            pos_order_going_to_invoice = self._create_order({
                'pos_order_lines_ui_args': [
                    (self.product_a, 2.0),  # 2 units of product A
                    (self.product_b, 2.0),  # 2 units of product B
                ],
                'payments': [(self.bank_pm1, 630.0)],  # Payment of 630 through bank payment method
            })
            # Create a POS order with an invoice and a linked customer
            pos_order_with_invoice = self._create_order({
                'pos_order_lines_ui_args': [
                    (self.product_a, 3.0),  # 3 units of product A
                    (self.product_b, 3.0),  # 3 units of product B
                ],
                'payments': [(self.bank_pm1, 945.0)],  # Payment of 945 through bank payment method
                'customer': self.partner_a,
            })

        # Initial state: no reversal moves for both orders
        self.assertFalse(pos_order_going_to_invoice.reversed_move_ids,
                        "Order with 'to_invoice' = False should have no reversal moves after session is closed.")
        self.assertFalse(pos_order_with_invoice.reversed_move_ids,
                        "Immediate invoiced order should have no reversal moves after session is closed.")

        # Now, set a partner and invoice the order after the session is closed
        # with self.with_pos_session() as session2:
        pos_order_going_to_invoice.partner_id = self.partner_a
        pos_order_going_to_invoice.action_pos_order_invoice()

        # Confirm that reversal move(s) are now set
        reversal_moves = self.env['account.move'].search([('reversed_pos_order_id', '=', pos_order_going_to_invoice.id)])
        self.assertEqual(pos_order_going_to_invoice.reversed_move_ids, reversal_moves,
                        "Reversal move should be set for the order invoiced after the session is closed.")
        self.assertInvoiceValues(reversal_moves, [
            # Same grouping as the closing entry it reverses: no product unless closing by product
            {'product_id': False, 'l10n_in_hsn_code': '1111', 'product_uom_id': self.product_a.uom_id.id, 'debit': 200.0, 'credit': 0.0},
            {'product_id': False, 'l10n_in_hsn_code': '2222', 'product_uom_id': self.product_b.uom_id.id, 'debit': 400.0, 'credit': 0.0},
            {'product_id': False, 'l10n_in_hsn_code': False, 'product_uom_id': False, 'debit': 15.0, 'credit': 0.0},
            {'product_id': False, 'l10n_in_hsn_code': False, 'product_uom_id': False, 'debit': 15.0, 'credit': 0.0},
            {'product_id': False, 'l10n_in_hsn_code': False, 'product_uom_id': False, 'debit': 0.0, 'credit': 630.0},
        ], {
            'amount_untaxed': 0.0,
            'amount_tax': 0.0,
            'amount_total': 630.0,
        })
        self.assertEqual(pos_order_going_to_invoice.amount_total, 630.0,
                        "The total amount of the order should match the reversal move total.")
