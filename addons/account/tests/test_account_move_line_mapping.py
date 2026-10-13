from odoo.tests.common import TransactionCase
from odoo.tests import tagged
from odoo import Command


@tagged('post_install', '-at_install')
class TestAccountMoveLineMapping(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.company = cls.env.company

        # 1. Create Base and Target Accounts (using TEST_ prefix to avoid collisions)
        cls.acc_sale_dom = cls.env['account.account'].create({
            'code': 'TEST7000', 'name': 'Domestic Sales', 'account_type': 'income'})
        cls.acc_sale_exp = cls.env['account.account'].create({
            'code': 'TEST7007', 'name': 'Export Sales', 'account_type': 'income'})

        cls.acc_disc_dom = cls.env['account.account'].create({
            'code': 'TEST6570', 'name': 'Discount Loss', 'account_type': 'expense'})
        cls.acc_disc_exp = cls.env['account.account'].create({
            'code': 'TEST6571', 'name': 'Export Discount Loss', 'account_type': 'expense'})

        cls.acc_down_dom = cls.env['account.account'].create({
            'code': 'TEST4600', 'name': 'Downpayment', 'account_type': 'liability_current'})
        cls.acc_down_exp = cls.env['account.account'].create({
            'code': 'TEST4601', 'name': 'Export Downpayment', 'account_type': 'liability_current'})

        cls.acc_manual = cls.env['account.account'].create({
            'code': 'TEST6000', 'name': 'Office Supplies (Manual)', 'account_type': 'expense'})

        # 2. Configure Company System Defaults (The Allowlist targets)
        cls.company.write({
            'account_journal_early_pay_discount_loss_account_id': cls.acc_disc_dom.id,
            'downpayment_account_id': cls.acc_down_dom.id,
        })

        # 3. Create a Sales Journal with a default income account
        cls.journal = cls.env['account.journal'].create({
            'name': 'Test Sales',
            'code': 'TSAL',
            'type': 'sale',
            'default_account_id': cls.acc_sale_dom.id,
        })

        # 4. Set up the Fiscal Position with Mapping Rules
        cls.fiscal_position = cls.env['account.fiscal.position'].create({
            'name': 'Export Mapping',
            'account_ids': [
                Command.create({'account_src_id': cls.acc_sale_dom.id, 'account_dest_id': cls.acc_sale_exp.id}),
                Command.create({'account_src_id': cls.acc_disc_dom.id, 'account_dest_id': cls.acc_disc_exp.id}),
                Command.create({'account_src_id': cls.acc_down_dom.id, 'account_dest_id': cls.acc_down_exp.id}),
            ]
        })

        # 5. Set up Customer and Product
        cls.partner = cls.env['res.partner'].create({
            'name': 'Export Customer',
            'property_account_position_id': cls.fiscal_position.id,
        })

        cls.product = cls.env['product.product'].create({
            'name': 'Test Desk',
            'property_account_income_id': cls.acc_sale_dom.id,
        })

        cls.downpayment_product = cls.env['product.product'].create({
            'name': 'Downpayment',
            'property_account_income_id': cls.acc_down_dom.id,
        })

    def _create_test_move(self, line_vals):
        """Helper to quickly generate a test invoice with specific line values."""
        return self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner.id,
            'journal_id': self.journal.id,
            'invoice_line_ids': [Command.create(line_vals)]
        })

    # --- DO apply fiscal position mapping ---

    def test_01_journal_defaults_do_apply(self):
        """Invoice with line with no product and no account forces compute fallback mapping."""
        move = self._create_test_move({
            'name': 'Empty line testing journal fallback',
            'price_unit': 100.0,
        })
        self.assertEqual(move.invoice_line_ids.account_id, self.acc_sale_exp)

    def test_02_system_default_downpayment_do_apply(self):
        """Invoice generated for downpayment from a product-less Sales Order line maps account correctly."""
        sale_order = self.env['sale.order'].create({
            'partner_id': self.partner.id,
            'fiscal_position_id': self.fiscal_position.id,
            'order_line': [
                Command.create({
                    'name': 'test',
                    'price_unit': 1000.0,
                    'product_uom_qty': 1.0,
                })
            ]
        })
        sale_order.action_confirm()

        context = {
            'active_model': 'sale.order',
            'active_ids': sale_order.ids,
            'active_id': sale_order.id,
        }
        downpayment_wizard = self.env['sale.advance.payment.inv'].with_context(**context).create({
            'advance_payment_method': 'percentage',
            'amount': 10.0,
        })
        downpayment_wizard.create_invoices()

        # 3. Fetch the newly generated invoice
        invoice = sale_order.invoice_ids
        self.assertTrue(invoice, "The downpayment invoice was not created.")

        # 4. Locate the invoice line
        dp_line = invoice.invoice_line_ids.filtered(lambda l: l.display_type == 'product')
        self.assertTrue(dp_line, "The invoice line is missing.")

        # 5. Verify the Fiscal Position mapped the account correctly
        self.assertEqual(dp_line.account_id, self.acc_down_exp)

    def test_03_product_fallback_do_apply(self):
        """Product line maps account correctly."""
        move = self._create_test_move({
            'product_id': self.product.id,
            'price_unit': 100.0,
        })
        self.assertEqual(move.invoice_line_ids.account_id, self.acc_sale_exp)

    def test_04_system_default_discount_do_apply(self):
        # TODO: fix this / figure out what is the best way to do the system defaults
        """Test: Create interceptor catches system early payment discount injection."""
        move = self._create_test_move({
            'name': 'System Early Payment Discount',
            'account_id': self.acc_disc_dom.id,
            'price_unit': 2.0,
        })
        self.assertEqual(move.invoice_line_ids.account_id, self.acc_disc_exp)

    # --- DO NOT apply fiscal position mapping ---

    def test_05_manual_override_do_not_apply(self):
        """User manually setting an account does not apply fiscal position mapping"""
        # Create a trap mapping rule to strictly prove manual entries ignore it
        self.fiscal_position.write({
            'account_ids': [
                Command.create({'account_src_id': self.acc_manual.id, 'account_dest_id': self.acc_sale_exp.id})
            ]
        })

        move = self._create_test_move({
            'name': 'Random Manual Account',
            'account_id': self.acc_manual.id,
            'price_unit': 15.0,
        })
        self.assertEqual(move.invoice_line_ids.account_id, self.acc_manual)

    def test_06_ai_prediction_do_not_apply(self):
        """Account set by predictive algorithm does not apply fiscal position mapping"""
        predicted_acc = self.env['account.account'].create({
            'code': 'TEST6001', 'name': 'AI Predicted Account', 'account_type': 'expense'
        })

        move = self._create_test_move({
            'name': 'AI OCR Prediction',
            'account_id': predicted_acc.id,
            'price_unit': 42.0,
            'display_type': 'product',
        })
        self.assertEqual(move.invoice_line_ids.account_id, predicted_acc)
