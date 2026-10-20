from odoo import Command
from odoo.exceptions import ValidationError
from odoo.tests import tagged

from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install', '-at_install')
class TestPosStripeTerminals(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.user.group_ids |= cls.env.ref('point_of_sale.group_pos_manager')
        cls.stripe_payment_method = cls.env['pos.payment.method'].create({
            'name': 'Stripe',
            'type': 'bank',
            'journal_id': cls.company_data['default_journal_bank'].id,
            'payment_method_type': 'terminal',
            'payment_provider': 'stripe',
            'terminal_ids': [
                Command.create({'stripe_serial_number': 'WSC-1'}),
                Command.create({'stripe_serial_number': 'WSC-2'}),
            ],
        })
        cls.terminal_1, cls.terminal_2 = cls.stripe_payment_method.terminal_ids

    def test_serial_number_loaded_per_terminal(self):
        self.assertIn('stripe_serial_number', self.env['pos.payment.terminal']._load_pos_data_fields(False))
        self.assertNotIn('stripe_serial_number', self.env['pos.payment.method']._load_pos_data_fields(False))

    def test_serial_number_unique(self):
        with self.assertRaises(ValidationError):
            self.terminal_2.stripe_serial_number = 'WSC-1'
        other_payment_method = self.stripe_payment_method.copy()
        # The serial numbers are not copied with the terminals
        self.assertEqual(other_payment_method.terminal_ids.mapped('stripe_serial_number'), [False, False])
        with self.assertRaises(ValidationError):
            other_payment_method.terminal_ids[0].stripe_serial_number = 'WSC-2'

    def test_terminal_required(self):
        with self.assertRaises(ValidationError):
            self.stripe_payment_method.terminal_ids = [Command.clear()]
