# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command
from odoo.addons.account.tests.common import TestTaxCommon
from odoo.tests import tagged


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nAccountWithholdingTaxesAmounts(TestTaxCommon):
    """ This test file focuses solely on testing taxes amounts in various use cases (vat, wth, base affected,...). """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Set the withholding account
        cls.company_data['company'].withholding_tax_base_account_id = cls.env['account.account'].create({
            'code': 'WITHB',
            'name': 'Withholding Tax Base Account',
            'reconcile': True,
            'account_type': 'asset_current',
        })
        # We'll share a sequence between all taxes, so that we can avoid the need to set them.
        cls.withholding_sequence = cls.env['ir.sequence'].create({
            'implementation': 'no_gap',
            'name': 'Withholding Sequence',
            'padding': 4,
            'number_increment': 1,
        })
        # Outstanding account
        cls.outstanding_account = cls.env['account.account'].create({
            'name': "Outstanding Payments",
            'code': 'OSTP420',
            'reconcile': False,  # On purpose for testing.
            'account_type': 'asset_current'
        })
        # Prepare the test taxes.
        cls.vat_tax_a = cls.percent_tax(cls, 15, price_include_override='tax_included', include_base_amount=True)
        cls.vat_tax_b = cls.percent_tax(cls, 15, price_include_override='tax_included')
        cls.vat_tax_c = cls.percent_tax(cls, 15, include_base_amount=True)
        cls.vat_tax_d = cls.percent_tax(cls, 15)
        cls.vat_tax_e = cls.percent_tax(cls, 15, include_base_amount=True, is_base_affected=False)
        cls.vat_tax_f = cls.percent_tax(cls, 15, is_base_affected=False)

        cls.wth_tax_g = cls.percent_tax(cls, 10, include_base_amount=True, is_withholding_tax_on_payment=True)
        cls.wth_tax_h = cls.percent_tax(cls, 10, is_withholding_tax_on_payment=True)
        cls.wth_tax_i = cls.percent_tax(cls, 10, is_withholding_tax_on_payment=True, is_base_affected=False)

    def test_case_a(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_a | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1000.0,
            'base_amount': 1000.0,
            'amount': 100.0,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 900.0}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 900.0,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 900.0,     'tax_ids': []},
            {'balance': -1000.0,   'tax_ids': []},
            {'balance': 100.0,     'tax_ids': []},
            {'balance': 1000.0,    'tax_ids': self.wth_tax_g.ids},
            {'balance': -1000.0,   'tax_ids': []},
        ])

    def test_case_b(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_b | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 869.57,
            'base_amount': 869.57,
            'amount': 86.96,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 913.04}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 913.04,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 913.04,    'tax_ids': []},
            {'balance': -1000.0,   'tax_ids': []},
            {'balance': 86.96,     'tax_ids': []},
            {'balance': 869.57,    'tax_ids': self.wth_tax_g.ids},
            {'balance': -869.57,   'tax_ids': []},
        ])

    def test_case_c(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_c | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1150.0,
            'base_amount': 1150.0,
            'amount': 115.0,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 1035.0}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 1035.0,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 1035.0,    'tax_ids': []},
            {'balance': -1150.0,   'tax_ids': []},
            {'balance': 115.0,     'tax_ids': []},
            {'balance': 1150.0,    'tax_ids': self.wth_tax_g.ids},
            {'balance': -1150.0,   'tax_ids': []},
        ])

    def test_case_d(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_d | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1000.0,
            'base_amount': 1000.0,
            'amount': 100.0,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 1050.0}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 1050.0,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 1050.0,    'tax_ids': []},
            {'balance': -1150.0,   'tax_ids': []},
            {'balance': 100.0,     'tax_ids': []},
            {'balance': 1000.0,    'tax_ids': self.wth_tax_g.ids},
            {'balance': -1000.0,   'tax_ids': []},
        ])

    def test_case_e(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_a | self.vat_tax_c | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1150.0,
            'base_amount': 1150.0,
            'amount': 115.0,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 1035.0}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 1035.0,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 1035.0,    'tax_ids': []},
            {'balance': -1150.0,   'tax_ids': []},
            {'balance': 115.0,     'tax_ids': []},
            {'balance': 1150.0,    'tax_ids': self.wth_tax_g.ids},
            {'balance': -1150.0,   'tax_ids': []},
        ])

    def test_case_f(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_a | self.vat_tax_d | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1000.0,
            'base_amount': 1000.0,
            'amount': 100.0,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 1050.0}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 1050.0,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 1050.0,    'tax_ids': []},
            {'balance': -1150.0,   'tax_ids': []},
            {'balance': 100.0,     'tax_ids': []},
            {'balance': 1000.0,    'tax_ids': self.wth_tax_g.ids},
            {'balance': -1000.0,   'tax_ids': []},
        ])

    def test_case_g(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_a | self.vat_tax_e | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1130.44,
            'base_amount': 1130.44,
            'amount': 113.04,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 1017.4}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 1017.4,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 1017.4,    'tax_ids': []},
            {'balance': -1130.44,   'tax_ids': []},
            {'balance': 113.04,     'tax_ids': []},
            {'balance': 1130.44,    'tax_ids': self.wth_tax_g.ids},
            {'balance': -1130.44,   'tax_ids': []},
        ])

    def test_case_h(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_a | self.vat_tax_f | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1000.00,
            'base_amount': 1000.00,
            'amount': 100.00,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 1030.44}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 1030.44,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 1030.44,    'tax_ids': []},
            {'balance': -1130.44,   'tax_ids': []},
            {'balance': 100.00,     'tax_ids': []},
            {'balance': 1000.00,    'tax_ids': self.wth_tax_g.ids},
            {'balance': -1000.00,   'tax_ids': []},
        ])

    def test_case_i(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_b | self.vat_tax_c | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1000.01,
            'base_amount': 1000.01,
            'amount': 100.00,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 1030.44}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 1030.44,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 1030.44,    'tax_ids': []},
            {'balance': -1130.44,   'tax_ids': []},
            {'balance': 100.00,     'tax_ids': []},
            {'balance': 1000.01,    'tax_ids': self.wth_tax_g.ids},
            {'balance': -1000.01,   'tax_ids': []},
        ])

    def test_case_j(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_b | self.vat_tax_d | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 869.57,
            'base_amount': 869.57,
            'amount': 86.96,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 1043.48}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 1043.48,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 1043.48,    'tax_ids': []},
            {'balance': -1130.44,   'tax_ids': []},
            {'balance': 86.96,      'tax_ids': []},
            {'balance': 869.57,     'tax_ids': self.wth_tax_g.ids},
            {'balance': -869.57,    'tax_ids': []},
        ])

    # Note, test case names are following a spreadsheet for now and the K test in the spreadsheet is wrong and thus skipped.

    def test_case_l(self):
        self.vat_tax_a.sequence = 1
        self.wth_tax_g.sequence = 2
        self.vat_tax_c.sequence = 3

        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_a | self.wth_tax_g | self.vat_tax_c).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1000.00,
            'base_amount': 1000.00,
            'amount': 100.00,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 1050.00}])

        wizard.withholding_line_ids[0].name = '123'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 1050.00,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 1050.00,    'tax_ids': []},
            {'balance': -1150.00,   'tax_ids': []},
            {'balance': 100.00,      'tax_ids': []},
            {'balance': 1000.00,     'tax_ids': self.wth_tax_g.ids},
            {'balance': -1000.00,    'tax_ids': []},
        ])

    def test_case_m(self):
        self.vat_tax_c.sequence = 1
        self.wth_tax_g.sequence = 2
        self.wth_tax_h.sequence = 3

        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_c | self.wth_tax_g | self.wth_tax_h).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1150.00,
            'base_amount': 1150.00,
            'amount': 115.00,
        }, {
            'original_base_amount': 1035.00,
            'base_amount': 1035.00,
            'amount': 103.50,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 931.50}])

        wizard.withholding_line_ids[0].name = '123'
        wizard.withholding_line_ids[1].name = '456'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 931.50,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 931.50,     'tax_ids': []},
            {'balance': -1150.00,   'tax_ids': []},
            {'balance': 115.00,     'tax_ids': []},
            {'balance': 103.50,     'tax_ids': []},
            {'balance': 1150.00,    'tax_ids': self.wth_tax_g.ids},
            {'balance': -1150.00,   'tax_ids': []},
            {'balance': 1035.00,    'tax_ids': self.wth_tax_h.ids},
            {'balance': -1035.00,   'tax_ids': []},
        ])

    def test_case_n(self):
        self.vat_tax_c.sequence = 1
        self.wth_tax_g.sequence = 2
        self.wth_tax_i.sequence = 3

        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_c | self.wth_tax_g | self.wth_tax_i).ids)],
            })],
        })
        invoice.action_post()
        wizard = self.env['account.payment.register']\
            .with_context(active_model='account.move', active_ids=invoice.ids)\
            .create({})
        self.assertRecordValues(wizard.withholding_line_ids, [{
            'original_base_amount': 1150.00,
            'base_amount': 1150.00,
            'amount': 115.00,
        }, {
            'original_base_amount': 1000.00,
            'base_amount': 1000.00,
            'amount': 100.00,
        }])
        self.assertRecordValues(wizard, [{'withholding_net_amount': 935.00}])

        wizard.withholding_line_ids[0].name = '123'
        wizard.withholding_line_ids[1].name = '456'
        payment = wizard._create_payments()
        self.assertRecordValues(payment, [{
            'amount': 935.00,
        }])
        self.assertRecordValues(payment.move_id.line_ids, [
            {'balance': 935.00,      'tax_ids': []},
            {'balance': -1150.00,    'tax_ids': []},
            {'balance': 115.00,      'tax_ids': []},
            {'balance': 100.00,      'tax_ids': []},
            {'balance': 1150.00,     'tax_ids': self.wth_tax_g.ids},
            {'balance': -1150.00,    'tax_ids': []},
            {'balance': 1000.00,     'tax_ids': self.wth_tax_i.ids},
            {'balance': -1000.00,    'tax_ids': []},
        ])

    def test_invoice_total_unaffected(self):
        """ Ensure that the invoice total is not affected by a withholding tax set on the line. """
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'Product Line',
                'price_unit': 1000.0,
                'tax_ids': [Command.set((self.vat_tax_d | self.wth_tax_g).ids)],
            })],
        })
        invoice.action_post()
        # Simply check the total, we should see a base of 1000, affected by tax d, but not tax g
        self.assertRecordValues(invoice, [{
            'amount_untaxed': 1000.00,
            'amount_tax': 150.00,
            'amount_total': 1150.00,
        }])
        self.assert_invoice_tax_totals_summary(
            invoice,
            {
                'base_amount_currency': 1000.00,
                'tax_amount_currency': 150.00,
                'total_amount_currency': 1150.00,
            },
            soft_checking=True,
        )

    # -------
    # Helpers
    # -------

    def _register_payment(self, create_vals=None):
        """Simply post the invoice, and then return a payment register wizard.
        Can optionally take create_vals if some specific fields are required on the wizard at creation, or allows to
        enable withholding tax right away.
        Also allows to create a default withholding tax line on the way.

        These options are useful to avoid repeating some basic setting up each time we don't care about the specificities
        but only about what happens after.
        """
        if self.invoice.state != "posted":
            self.invoice.action_post()
        return (
            self.env["account.payment.register"]
            .with_context(active_model="account.move.line", active_ids=self.invoice.line_ids.ids)
            .create(create_vals or {})
        )

    def _get_tax_tag(self, tax):
        return {
            "tax": tax.invoice_repartition_line_ids.filtered(lambda x: x.repartition_type == "tax").tag_ids.ids,
            "base": tax.invoice_repartition_line_ids.filtered(lambda x: x.repartition_type == "base").tag_ids.ids,
        }
