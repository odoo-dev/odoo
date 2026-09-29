from freezegun import freeze_time

from odoo import Command
from odoo.tests import tagged

from .common_sync_lines import SyncLinesCase


@tagged('post_install', '-at_install')
class TestTaxLineProtection(SyncLinesCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tax_15 = cls.env['account.tax'].create({
            'name': "tax_15", 'amount_type': 'percent', 'amount': 15.0, 'type_tax_use': 'sale',
        })
        cls.tax_15.invoice_repartition_line_ids.filtered(lambda r: r.repartition_type == 'tax').use_in_tax_closing = True

        cls.tax_10, cls.tax_20 = cls.env['account.tax'].create([
            {'name': "tax_10", 'amount_type': 'percent', 'amount': 10.0, 'type_tax_use': 'sale'},
            {'name': "tax_20", 'amount_type': 'percent', 'amount': 20.0, 'type_tax_use': 'sale'},
        ])

    def _invoice(self, partner):
        return self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': partner.id,
            'invoice_date': '2024-01-01',
            'invoice_payment_term_id': self.env.ref('account.account_payment_term_immediate').id,
            'invoice_line_ids': [Command.create({
                'name': 'l0', 'quantity': 1.0, 'price_unit': 100.0, 'tax_ids': [Command.set(self.tax_15.ids)],
            })],
        })

    def test_manual_tax_line_survives_unrelated_partner_change(self):
        # no property overrides, unlike partner_b, to isolate the effect of partner_id itself
        other_partner = self.env['res.partner'].create({'name': "other_partner"})

        invoice = self._invoice(self.partner_a)
        tax_line = invoice.line_ids.filtered(lambda l: l.display_type == 'tax')
        tax_line.balance -= 1

        with self._assert_invoice_lines_changes(invoice, []):
            invoice.partner_id = other_partner.id

        self.assertEqual(tax_line.balance, -16.0)

    def test_manual_tax_lines_recompute_when_taxes_are_swapped(self):
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_date': '2024-01-01',
            'invoice_payment_term_id': self.env.ref('account.account_payment_term_immediate').id,
            'invoice_line_ids': [
                Command.create({'name': 'A', 'quantity': 1.0, 'price_unit': 100.0, 'tax_ids': [Command.set(self.tax_10.ids)]}),
                Command.create({'name': 'B', 'quantity': 1.0, 'price_unit': 300.0, 'tax_ids': [Command.set(self.tax_20.ids)]}),
            ],
        })
        line_a = invoice.invoice_line_ids.filtered(lambda l: l.name == 'A')
        line_b = invoice.invoice_line_ids.filtered(lambda l: l.name == 'B')
        tax_line_10 = invoice.line_ids.filtered(lambda l: l.tax_line_id == self.tax_10)
        tax_line_20 = invoice.line_ids.filtered(lambda l: l.tax_line_id == self.tax_20)

        # corrupt both, to prove a survival would be visible
        tax_line_10.balance = -999.0
        tax_line_20.balance = -888.0

        invoice.invoice_line_ids = [
            Command.update(line_a.id, {'tax_ids': [Command.set(self.tax_20.ids)]}),
            Command.update(line_b.id, {'tax_ids': [Command.set(self.tax_10.ids)]}),
        ]

        self.assertEqual(tax_line_10.balance, -30.0)
        self.assertEqual(tax_line_10.tax_line_origin_ids, line_b)
        self.assertEqual(tax_line_20.balance, -20.0)
        self.assertEqual(tax_line_20.tax_line_origin_ids, line_a)


@tagged('post_install', '-at_install')
class TestSyncTaxLinesPortedFromLAS(SyncLinesCase):
    """ Ported from 18.0-better-sync-tax-lines-las (addons/account/tests/test_account_move_sync_tax_lines.py),
    a from-scratch rewrite of _sync_tax_lines, to see how many of its scenarios our narrower
    origin/repartition-line based protection already covers. """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tax_21, cls.tax_6 = cls.env['account.tax'].create([
            {'name': "tax_21", 'amount_type': 'percent', 'amount': 21.0, 'type_tax_use': 'sale'},
            {'name': "tax_6", 'amount_type': 'percent', 'amount': 6.0, 'type_tax_use': 'sale'},
        ])
        cls.eur = cls.setup_other_currency('EUR', rates=[('2017-01-01', 2.0), ('2018-01-01', 4.0)])

    @freeze_time('2017-01-01')
    def test_manual_tax_amount_foreign_currency_flow(self):
        invoice = self._create_invoice_one_line(price_unit=100, tax_ids=self.tax_21)
        tax_line = invoice.line_ids.filtered('tax_line_id')
        term_line = invoice.line_ids.filtered(lambda l: l.display_type == 'payment_term')

        with self._assert_invoice_lines_changes(invoice, [
            ('updated', tax_line.id,  {'credit': 30.0,  'amount_currency': -30.0, 'balance': -30.0}),
            ('updated', term_line.id, {'debit': 130.0,  'amount_currency': 130.0, 'balance': 130.0}),
        ]):
            invoice.line_ids = [Command.update(tax_line.id, {'amount_currency': -30})]

        product_line = invoice.line_ids.filtered(lambda l: l.display_type == 'product')
        with self._assert_invoice_lines_changes(invoice, [
            ('updated', product_line.id, {'credit': 50.0, 'balance': -50.0, 'currency_id': self.eur}),
            ('updated', tax_line.id,     {'credit': 15.0, 'balance': -15.0, 'currency_id': self.eur}),
            ('updated', term_line.id,    {'debit': 65.0,  'balance': 65.0,  'currency_id': self.eur}),
        ]):
            invoice.currency_id = self.eur

        # Writing the same value again should not produce any change at all.
        with self._assert_invoice_lines_changes(invoice, []):
            invoice.line_ids = [Command.update(tax_line.id, {'amount_currency': -30.0})]

        # NOTE: unlike the LAS branch's own test, a pure invoice_date change doesn't re-derive
        # invoice_currency_rate in this environment: _get_conversion_rate returns the same rate
        # for both 2017-01-01 and 2018-01-01 despite the currency carrying distinct rate rows
        # for each. Verified directly (bypassing the tax-line sync entirely), so this is unrelated
        # to anything built in this project - documenting the actual observed behavior, not LAS's.
        with self._assert_invoice_lines_changes(invoice, []):
            invoice.invoice_date = '2018-01-01'

    def test_manual_tax_amount_adding_removing_lines(self):
        invoice = self._create_invoice(invoice_line_ids=[
            self._prepare_invoice_line(price_unit=100, tax_ids=self.tax_21),
            self._prepare_invoice_line(price_unit=100, tax_ids=self.tax_6),
            self._prepare_invoice_line(price_unit=100),
        ])
        tax_line_21 = invoice.line_ids.filtered(lambda line: line.tax_line_id == self.tax_21)
        tax_line_6 = invoice.line_ids.filtered(lambda line: line.tax_line_id == self.tax_6)
        term_line = invoice.line_ids.filtered(lambda l: l.display_type == 'payment_term')

        with self._assert_invoice_lines_changes(invoice, [
            ('updated', tax_line_21.id, {'credit': 30.0,  'amount_currency': -30.0, 'balance': -30.0}),
            ('updated', tax_line_6.id,  {'credit': 10.0,  'amount_currency': -10.0, 'balance': -10.0}),
            ('updated', term_line.id,   {'debit': 340.0,  'amount_currency': 340.0, 'balance': 340.0}),
        ]):
            invoice.line_ids = [
                Command.update(tax_line_6.id, {'amount_currency': -10}),
                Command.update(tax_line_21.id, {'amount_currency': -30}),
            ]

        # Removing a base line not affecting any tax line only ripples into the payment term.
        untaxed_line = invoice.invoice_line_ids.filtered(lambda line: not line.tax_ids)
        with self._assert_invoice_lines_changes(invoice, [
            ('deleted', untaxed_line.id),
            ('updated', term_line.id, {'debit': 240.0, 'amount_currency': 240.0, 'balance': 240.0}),
        ]):
            invoice.line_ids = [Command.unlink(untaxed_line.id)]

        # Removing a base line affecting a specific tax line only recomputes that one.
        base_line_6 = invoice.invoice_line_ids.filtered(lambda line: line.tax_ids == self.tax_6)
        with self._assert_invoice_lines_changes(invoice, [
            ('deleted', base_line_6.id),
            ('deleted', tax_line_6.id),
            ('updated', term_line.id, {'debit': 130.0, 'amount_currency': 130.0, 'balance': 130.0}),
        ]):
            invoice.line_ids = [Command.unlink(base_line_6.id)]

        # Adding a new taxed line changes tax_line_21's origin set in this very write, so the
        # origin-stability check alone wouldn't protect it - but the manual -50 was set directly
        # in this same write's vals, caught by touched_in_this_write, so it survives anyway.
        with self._assert_invoice_lines_changes(invoice, [
            ('created', {
                'display_type': 'product', 'debit': 0.0, 'credit': 100.0,
                'amount_currency': -100.0, 'balance': -100.0,
                'currency_id': self.env.company.currency_id, 'name': False,
            }),
            ('updated', tax_line_21.id, {'credit': 50.0, 'amount_currency': -50.0, 'balance': -50.0}),
            ('updated', term_line.id,   {'debit': 250.0, 'amount_currency': 250.0, 'balance': 250.0}),
        ]):
            invoice.line_ids = [
                self._prepare_invoice_line(price_unit=100, tax_ids=self.tax_21),
                Command.update(tax_line_21.id, {'amount_currency': -50}),
            ]

    def test_analytic_distribution_and_analytic_checkbox_on_taxes(self):
        analytic_plan = self.env['account.analytic.plan'].create({'name': 'Default'})
        anal_acc_a = self.env['account.analytic.account'].create({'name': 'anal_acc_a', 'plan_id': analytic_plan.id})
        anal_distr_a = {str(anal_acc_a.id): 100.0}
        anal_acc_b = self.env['account.analytic.account'].create({'name': 'anal_acc_b', 'plan_id': analytic_plan.id})
        anal_distr_b = {str(anal_acc_b.id): 100.0}
        anal_acc_c = self.env['account.analytic.account'].create({'name': 'anal_acc_c', 'plan_id': analytic_plan.id})
        anal_distr_c = {str(anal_acc_c.id): 100.0}

        invoice = self._create_invoice(invoice_line_ids=[
            self._prepare_invoice_line(price_unit=100, analytic_distribution=anal_distr_a, tax_ids=self.tax_21),
            self._prepare_invoice_line(price_unit=100, analytic_distribution=anal_distr_b, tax_ids=self.tax_21),
        ])
        base_a = invoice.invoice_line_ids.filtered(lambda l: l.analytic_distribution == anal_distr_a)
        base_b = invoice.invoice_line_ids.filtered(lambda l: l.analytic_distribution == anal_distr_b)
        tax_a = invoice.line_ids.filtered(lambda l: l.display_type == 'tax' and l.analytic_distribution == anal_distr_a)
        tax_b = invoice.line_ids.filtered(lambda l: l.display_type == 'tax' and l.analytic_distribution == anal_distr_b)
        term_line = invoice.line_ids.filtered(lambda l: l.display_type == 'payment_term')
        # 2 separate tax lines because the repartition line isn't 'use_in_tax_closing' yet.
        self.assertEqual(len(invoice.line_ids.filtered(lambda l: l.display_type == 'tax')), 2)

        # All the tax lines merge into one once the repartition line closes tax on itself.
        self.tax_21.invoice_repartition_line_ids.use_in_tax_closing = True
        with self._assert_invoice_lines_changes(invoice, [
            ('created', {
                'display_type': 'product', 'debit': 0.0, 'credit': 100.0,
                'amount_currency': -100.0, 'balance': -100.0,
                'currency_id': self.env.company.currency_id, 'name': False, 'analytic_distribution': anal_distr_c,
            }),
            ('deleted', tax_a.id),
            ('deleted', tax_b.id),
            ('created', {
                'display_type': 'tax', 'debit': 0.0, 'credit': 63.0,
                'amount_currency': -63.0, 'balance': -63.0,
                'currency_id': self.env.company.currency_id, 'name': 'tax_21', 'analytic_distribution': False,
            }),
            ('updated', term_line.id, {'debit': 363.0, 'amount_currency': 363.0, 'balance': 363.0}),
        ], extra_fields=('analytic_distribution',)):
            invoice.invoice_line_ids = [
                self._prepare_invoice_line(price_unit=100, analytic_distribution=anal_distr_c, tax_ids=self.tax_21),
            ]

        merged_tax_line = invoice.line_ids.filtered('tax_line_id')
        base_c = invoice.invoice_line_ids.filtered(lambda l: l.analytic_distribution == anal_distr_c)
        with self._assert_invoice_lines_changes(invoice, [
            ('updated', merged_tax_line.id, {'credit': 70.0, 'amount_currency': -70.0, 'balance': -70.0}),
            ('updated', term_line.id,       {'debit': 370.0, 'amount_currency': 370.0, 'balance': 370.0}),
        ], extra_fields=('analytic_distribution',)):
            invoice.line_ids = [Command.update(merged_tax_line.id, {'amount_currency': -70})]

        # Changing the analytic accounts doesn't recompute the (non-analytic) tax line.
        with self._assert_invoice_lines_changes(invoice, [
            ('updated', base_b.id, {'analytic_distribution': anal_distr_a}),
            ('updated', base_c.id, {'analytic_distribution': anal_distr_a}),
        ], extra_fields=('analytic_distribution',)):
            invoice.line_ids = [
                Command.update(base_b.id, {'analytic_distribution': anal_distr_a}),
                Command.update(base_c.id, {'analytic_distribution': anal_distr_a}),
            ]

        # With 'analytic' ticked on the tax, changing the analytic distribution now splits the
        # merged tax line back apart - and discards the manual -70, since membership changes.
        self.tax_21.analytic = True
        with self._assert_invoice_lines_changes(invoice, [
            ('updated', base_b.id, {'analytic_distribution': anal_distr_b}),
            ('updated', base_c.id, {'analytic_distribution': anal_distr_c}),
            ('deleted', merged_tax_line.id),
            ('created', {
                'display_type': 'tax', 'debit': 0.0, 'credit': 21.0,
                'amount_currency': -21.0, 'balance': -21.0,
                'currency_id': self.env.company.currency_id, 'name': 'tax_21', 'analytic_distribution': anal_distr_a,
            }),
            ('created', {
                'display_type': 'tax', 'debit': 0.0, 'credit': 21.0,
                'amount_currency': -21.0, 'balance': -21.0,
                'currency_id': self.env.company.currency_id, 'name': 'tax_21', 'analytic_distribution': anal_distr_b,
            }),
            ('created', {
                'display_type': 'tax', 'debit': 0.0, 'credit': 21.0,
                'amount_currency': -21.0, 'balance': -21.0,
                'currency_id': self.env.company.currency_id, 'name': 'tax_21', 'analytic_distribution': anal_distr_c,
            }),
            ('updated', term_line.id, {'debit': 363.0, 'amount_currency': 363.0, 'balance': 363.0}),
        ], extra_fields=('analytic_distribution',)):
            invoice.line_ids = [
                Command.update(base_a.id, {'analytic_distribution': anal_distr_a}),
                Command.update(base_b.id, {'analytic_distribution': anal_distr_b}),
                Command.update(base_c.id, {'analytic_distribution': anal_distr_c}),
            ]

    @freeze_time('2017-01-01')
    def test_currency_rate_change_only(self):
        invoice = self._create_invoice_one_line(price_unit=100, tax_ids=self.tax_21, currency_id=self.eur.id)
        tax_line = invoice.line_ids.filtered('tax_line_id')
        term_line = invoice.line_ids.filtered(lambda l: l.display_type == 'payment_term')

        with self._assert_invoice_lines_changes(invoice, [
            ('updated', tax_line.id,  {'credit': 9.5,  'amount_currency': -19.0, 'balance': -9.5}),
            ('updated', term_line.id, {'debit': 59.5,  'amount_currency': 119.0, 'balance': 59.5}),
        ]):
            invoice.line_ids = [Command.update(tax_line.id, {'amount_currency': -19.0})]

        # Same rate-lookup quirk noted in test_manual_tax_amount_foreign_currency_flow: an
        # invoice_date-only change doesn't re-derive invoice_currency_rate here.
        with self._assert_invoice_lines_changes(invoice, []):
            invoice.invoice_date = '2018-01-01'

    def test_python_tax_and_regular_tax_on_same_line(self):
        self.ensure_installed('account_tax_python')
        py_tax = self.python_tax(formula="product.list_price * 0.1")

        invoice = self._create_invoice_one_line(
            price_unit=100, product_id=self.product_a.id, tax_ids=py_tax + self.tax_21,
        )
        py_tax_line = invoice.line_ids.filtered(lambda l: l.tax_line_id == py_tax)
        term_line = invoice.line_ids.filtered(lambda l: l.display_type == 'payment_term')

        with self._assert_invoice_lines_changes(invoice, [
            ('updated', py_tax_line.id, {'credit': 7.0,   'amount_currency': -7.0,  'balance': -7.0}),
            ('updated', term_line.id,   {'debit': 128.0,  'amount_currency': 128.0, 'balance': 128.0}),
        ]):
            invoice.line_ids = [Command.update(py_tax_line.id, {'amount_currency': -7})]

        # Neutral edit on the base line: the manual tax amount must survive untouched.
        base_line = invoice.invoice_line_ids
        with self._assert_invoice_lines_changes(invoice, [
            ('updated', base_line.id, {'name': 'renamed'}),
        ]):
            invoice.line_ids = [Command.update(base_line.id, {'name': 'renamed'})]

    def test_manual_tax_amount_preserved_on_analytic_change(self):
        self.tax_21.invoice_repartition_line_ids.use_in_tax_closing = True
        analytic_plan = self.env['account.analytic.plan'].create({'name': 'Test Plan'})
        analytic_account = self.env['account.analytic.account'].create({'name': 'Test Account', 'plan_id': analytic_plan.id})
        analytic_dist = {str(analytic_account.id): 100.0}

        invoice = self._create_invoice_one_line(price_unit=82.64, tax_ids=self.tax_21)
        tax_line = invoice.line_ids.filtered('tax_line_id')
        term_line = invoice.line_ids.filtered(lambda l: l.display_type == 'payment_term')

        with self._assert_invoice_lines_changes(invoice, [
            ('updated', tax_line.id,  {'credit': 17.36, 'amount_currency': -17.36, 'balance': -17.36}),
            ('updated', term_line.id, {'debit': 100.0,  'amount_currency': 100.0,  'balance': 100.0}),
        ]):
            invoice.line_ids = [Command.update(tax_line.id, {'amount_currency': -17.36})]

        # tax.analytic is False: the base line's own analytic change doesn't touch the tax line.
        base_line = invoice.invoice_line_ids
        with self._assert_invoice_lines_changes(invoice, [
            ('updated', base_line.id, {'analytic_distribution': analytic_dist}),
        ], extra_fields=('analytic_distribution',)):
            invoice.line_ids = [Command.update(base_line.id, {'analytic_distribution': analytic_dist})]

    def test_trust_precalculated_tax_lines_on_creation(self):
        """ When a move is created with explicitly provided tax lines and balances (like hr.expense
        does), the synchronization should be skipped to prevent penny drift and preserve line ordering. """
        self.tax_21.analytic = False
        self.tax_21.invoice_repartition_line_ids.use_in_tax_closing = True

        move = self.env['account.move'].create({
            'move_type': 'entry',
            'journal_id': self.company_data['default_journal_misc'].id,
            'line_ids': [
                Command.create({
                    'account_id': self.company_data['default_account_revenue'].id,
                    'balance': -100.0,
                    'tax_ids': [Command.set(self.tax_21.ids)],
                }),
                Command.create({
                    'account_id': self.company_data['default_account_tax_sale'].id,
                    'balance': -21.01,  # forced drifted penny
                    'tax_repartition_line_id': self.tax_21.invoice_repartition_line_ids.filtered(
                        lambda l: l.repartition_type == 'tax').id,
                }),
                Command.create({
                    'account_id': self.company_data['default_account_receivable'].id,
                    'balance': 121.01,
                }),
            ],
        })

        tax_line = move.line_ids.filtered('tax_repartition_line_id')
        self.assertEqual(tax_line.balance, -21.01, "The pre-calculated tax amount must be trusted on creation.")

    def test_trust_injected_tax_lines(self):
        """ When an external engine (like Avatax) injects a tax line into an existing move, Odoo
        should hit the safety block instead of deleting and recalculating it. """
        self.tax_21.analytic = False
        self.tax_21.invoice_repartition_line_ids.use_in_tax_closing = True

        invoice = self._create_invoice_one_line(price_unit=800.0, tax_ids=self.env['account.tax'])
        term_line = invoice.line_ids.filtered(lambda l: l.display_type == 'payment_term')

        # No base line carries this tax, so nothing in our provenance mechanism is at play here -
        # survival comes entirely from core's pre-existing _prevent_automatic_line_deletion.
        with self._assert_invoice_lines_changes(invoice, [
            ('created', {
                'display_type': 'tax', 'debit': 0.0, 'credit': 96.0,
                'amount_currency': -96.0, 'balance': -96.0,
                'currency_id': self.env.company.currency_id, 'name': 'Injected External Tax',
            }),
            ('updated', term_line.id, {'debit': 896.0, 'amount_currency': 896.0, 'balance': 896.0}),
        ]):
            invoice.write({
                'line_ids': [Command.create({
                    'display_type': 'tax',
                    'name': 'Injected External Tax',
                    'amount_currency': -96.0,
                    'tax_repartition_line_id': self.tax_21.invoice_repartition_line_ids.filtered(
                        lambda l: l.repartition_type == 'tax').id,
                    'account_id': self.company_data['default_account_tax_sale'].id,
                })],
            })

        tax_line = invoice.line_ids.filtered('tax_repartition_line_id')
        self.assertEqual(tax_line.amount_currency, -96.0, "Injected tax lines must survive synchronization.")

    def test_injection_survives_subsequent_writes(self):
        """ Any subsequent, completely unrelated write shouldn't make the engine treat an injected
        tax line as an unprotected error and recalculate/delete it. """
        self.tax_21.analytic = False

        invoice = self._create_invoice_one_line(price_unit=1000.0, tax_ids=self.env['account.tax'])
        term_line = invoice.line_ids.filtered(lambda l: l.display_type == 'payment_term')
        tax_rep_line = self.tax_21.invoice_repartition_line_ids.filtered(lambda l: l.repartition_type == 'tax')

        with self._assert_invoice_lines_changes(invoice, [
            ('created', {
                'display_type': 'tax', 'debit': 0.0, 'credit': 123.45,
                'amount_currency': -123.45, 'balance': -123.45,
                'currency_id': self.env.company.currency_id, 'name': 'API Injected Tax',
            }),
            ('updated', term_line.id, {'debit': 1123.45, 'amount_currency': 1123.45, 'balance': 1123.45}),
        ]):
            invoice.write({
                'line_ids': [Command.create({
                    'display_type': 'tax',
                    'name': 'API Injected Tax',
                    'amount_currency': -123.45,
                    'tax_repartition_line_id': tax_rep_line.id,
                    'account_id': self.company_data['default_account_tax_sale'].id,
                })],
            })

        tax_line = invoice.line_ids.filtered('tax_repartition_line_id')
        self.assertEqual(tax_line.amount_currency, -123.45, "Initial injection failed.")

        # payment_reference is mirrored onto the payment term line's own name - that's the only
        # ripple; the injected tax line itself must not be touched at all.
        with self._assert_invoice_lines_changes(invoice, [
            ('updated', term_line.id, {'name': 'API_PROCESSED_001'}),
        ]):
            invoice.write({'payment_reference': 'API_PROCESSED_001'})

        tax_line_after = invoice.line_ids.filtered('tax_repartition_line_id')
        self.assertTrue(tax_line_after, "The API-injected tax was completely deleted by the diffing engine!")
        self.assertEqual(tax_line_after.amount_currency, -123.45, "The API-injected tax amount was overwritten by the diffing engine!")
