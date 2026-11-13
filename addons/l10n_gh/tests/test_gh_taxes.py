# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import Command, fields
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged

# Source: Value Added Tax Act, 2025 (Act 1151) s.3; GRA VAT page / Notice / Guidelines (NHIL 2.5%,
# GETFund 2.5%, same taxable value); GRA withholding tax page.


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestGhTaxes(AccountTestInvoicingCommon):

    @classmethod
    @AccountTestInvoicingCommon.setup_chart_template('gh')
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env.company
        cls.partner_gh = cls.env['res.partner'].create({'name': 'GH Partner', 'country_id': cls.env.ref('base.gh').id})
        cls.partner_ng = cls.env['res.partner'].create({'name': 'NG Partner', 'country_id': cls.env.ref('base.ng').id})
        cls.product = cls.env['product.product'].create({'name': 'GH product', 'list_price': 1000.0})

    def _tax(self, name):
        return self.env['account.tax'].with_context(active_test=False).search([
            ('company_id', '=', self.company.id), ('name', '=', name)], limit=1)

    def _fp(self, name):
        return self.env['account.fiscal.position'].search([('company_id', '=', self.company.id), ('name', '=', name)])

    def _move(self, move_type, partner, price=1000.0, taxes=None, extra_taxes=None, fp=None):
        move = self.env['account.move'].create({
            'move_type': move_type,
            'partner_id': partner.id,
            'invoice_date': fields.Date.today(),
            **({'fiscal_position_id': fp.id} if fp else {}),
            'invoice_line_ids': [Command.create({'product_id': self.product.id, 'quantity': 1, 'price_unit': price})],
        })
        if taxes is not None:
            move.invoice_line_ids.tax_ids = [Command.set(taxes.ids)]
        if extra_taxes:
            move.invoice_line_ids.tax_ids |= extra_taxes
        return move

    def _tax_lines(self, move):
        return {line.name: (line.account_id.code, line.balance, line.tax_tag_ids.mapped('name'))
                for line in move.line_ids.filtered('tax_line_id')}

    def test_company_defaults(self):
        self.assertEqual(self.company.chart_template, 'gh')
        self.assertEqual(self.company.account_fiscal_country_id.code, 'GH')
        self.assertEqual(self.company.account_sale_tax_id.name, '20%')
        self.assertEqual(self.company.account_sale_tax_id.amount_type, 'group')
        self.assertEqual(self.company.account_purchase_tax_id.name, '20%')
        self.assertEqual(self.company.account_purchase_tax_id.amount_type, 'group')
        self.assertEqual(self.company.income_account_id.code, '411100')
        self.assertEqual(self.company.expense_account_id.code, '511100')
        for account in self.env['account.account'].search([('code', '=like', '1%')], limit=20):
            self.assertEqual(len(account.code), 6)

    def test_chart_default_taxes(self):
        account = self.env['account.account'].search([('company_ids', '=', self.company.id), ('code', '=', '612200')])
        self.assertEqual(account.tax_ids.name, '20%')
        account = self.env['account.account'].search([('company_ids', '=', self.company.id), ('code', '=', '411100')])
        self.assertEqual(account.tax_ids.name, '20%')
        self.assertEqual(account.tax_ids.type_tax_use, 'sale')

    def test_standard_sale_no_cascade(self):
        """VAT 15%, NHIL 2.5% and GETFund 2.5% are all computed on the same 1000 taxable value."""
        move = self._move('out_invoice', self.partner_gh)
        self.assertEqual(move.fiscal_position_id.name, 'Domestic')
        self.assertEqual(move.amount_untaxed, 1000.0)
        self.assertEqual(move.amount_total, 1200.0)
        self.assertEqual(self._tax_lines(move), {
            '15% VAT (S)': ('221100', -150.0, ['Output VAT']),
            '2.5% NHIL (S)': ('221200', -25.0, ['Output NHIL']),
            '2.5% GETFund (S)': ('221300', -25.0, ['Output GETFund Levy']),
        })
        base_line = move.line_ids.filtered(lambda l: l.display_type == 'product')
        self.assertEqual(base_line.tax_tag_ids.mapped('name'), ['Standard Rated Sales Base'])
        groups = {g['group_name']: g['tax_amount'] for s in move.tax_totals['subtotals'] for g in s['tax_groups']}
        self.assertEqual(groups, {'VAT 15%': 150.0, 'NHIL 2.5%': 25.0, 'GETFund Levy 2.5%': 25.0})

    def test_credit_note_mirrors_invoice(self):
        move = self._move('out_invoice', self.partner_gh)
        move.action_post()
        credit_note = move._reverse_moves()
        credit_note.action_post()
        self.assertEqual(credit_note.amount_total, 1200.0)
        self.assertEqual(sorted(credit_note.line_ids.mapped('balance')), sorted(-b for b in move.line_ids.mapped('balance')))
        self.assertEqual(
            sorted(credit_note.line_ids.tax_tag_ids.mapped('name')),
            sorted(move.line_ids.tax_tag_ids.mapped('name')),
        )

    def test_price_included_fractions(self):
        """Guidelines (Act 1151 s.68): tax fraction VAT 1/8, NHIL 1/48, GETFund 1/48 of a tax-inclusive price."""
        group = self.company.account_sale_tax_id
        for child in group.children_tax_ids:
            child.price_include_override = 'tax_included'
        res = group._get_tax_details(1200.0, 1.0, precision_rounding=0.01)
        self.assertAlmostEqual(res['total_excluded'], 1000.0)
        self.assertEqual(sorted(t['tax_amount'] for t in res['taxes_data']), [25.0, 25.0, 150.0])

    def test_zero_rated_export(self):
        export = self._move('out_invoice', self.partner_ng)
        self.assertEqual(export.fiscal_position_id.name, 'Foreign')
        self.assertEqual(export.invoice_line_ids.tax_ids.name, '0% EX')
        self.assertEqual(export.amount_total, 1000.0)
        self.assertEqual(export.invoice_line_ids.tax_tag_ids.mapped('name'), ['Export Sales Base'])

    def test_exempt_sale(self):
        move = self._move('out_invoice', self.partner_gh, taxes=self._tax('0% E'))
        self.assertEqual(move.amount_total, 1000.0)
        self.assertEqual(move.invoice_line_ids.tax_tag_ids.mapped('name'), ['Exempt Sales Base'])

    def test_vat_withholding_agent(self):
        """The 7% VAT withheld by the customer does not change the amount due until payment."""
        move = self._move('out_invoice', self.partner_gh, fp=self._fp('VAT Withholding Agent'))
        move.invoice_line_ids._compute_tax_ids()
        self.assertEqual(move.invoice_line_ids.tax_ids.name, '20% VAT WTH')
        self.assertEqual(move.amount_total, 1200.0)
        vat_wth = self._tax('7% VAT WTH')
        self.assertEqual(vat_wth.amount, -7.0)
        self.assertTrue(vat_wth.is_withholding_tax)

    def test_import_of_goods(self):
        bill = self._move('in_invoice', self.partner_ng)
        # Import VAT is paid at customs on a separate bill: the foreign supplier's bill is 0%.
        self.assertEqual(bill.invoice_line_ids.tax_ids.name, '0% EX')
        customs = self._move('in_invoice', self.partner_gh, taxes=self._tax('20% IMP'))
        self.assertEqual(customs.amount_total, 1200.0)
        self.assertEqual(self._tax_lines(customs), {
            '15% VAT (IMP)': ('124100', 150.0, ['Import VAT']),
            '2.5% NHIL (IMP)': ('124200', 25.0, ['Import NHIL']),
            '2.5% GETFund (IMP)': ('124300', 25.0, ['Import GETFund Levy']),
        })

    def test_reverse_charge_nets_to_zero(self):
        # Services from a foreign supplier: the reverse charge tax is selected manually and kept by the Foreign position.
        bill = self._move('in_invoice', self.partner_ng, taxes=self._tax('20% RC'))
        self.assertEqual(bill.fiscal_position_id.name, 'Foreign')
        self.assertEqual(bill.invoice_line_ids.tax_ids.name, '20% RC')
        self.assertEqual(bill.amount_total, 1000.0)  # the supplier is paid the base only
        tax_lines = bill.line_ids.filtered('tax_line_id')
        self.assertEqual(len(tax_lines), 6)
        self.assertAlmostEqual(sum(tax_lines.mapped('balance')), 0.0)
        by_account = {}
        for line in tax_lines:
            by_account[line.account_id.code] = by_account.get(line.account_id.code, 0.0) + line.balance
        self.assertEqual(by_account, {
            '124100': 150.0, '124200': 25.0, '124300': 25.0,
            '221100': -150.0, '221200': -25.0, '221300': -25.0,
        })

    def test_withholding_rates(self):
        """Rates from the GRA withholding tax page; withholding applies on payment only."""
        expected = {
            ('3% WTH G', 'purchase'): (-3.0, '221500'),
            ('5% WTH W', 'purchase'): (-5.0, '221500'),
            ('7.5% WTH S', 'purchase'): (-7.5, '221500'),
            ('20% WTH NR', 'purchase'): (-20.0, '221600'),
            ('3% WTH G', 'sale'): (-3.0, '124500'),
            ('5% WTH W', 'sale'): (-5.0, '124500'),
            ('7.5% WTH S', 'sale'): (-7.5, '124500'),
        }
        for (name, use), (rate, account) in expected.items():
            tax = self.env['account.tax'].search([
                ('company_id', '=', self.company.id), ('name', '=', name), ('type_tax_use', '=', use)])
            self.assertEqual(tax.amount, rate, name)
            self.assertTrue(tax.is_withholding_tax, name)
            self.assertEqual(tax.invoice_repartition_line_ids.filtered(lambda l: l.repartition_type == 'tax').account_id.code, account)

        bill = self._move('in_invoice', self.partner_gh, price=10000.0, extra_taxes=self.env['account.tax'].search([
            ('company_id', '=', self.company.id), ('name', '=', '3% WTH G'), ('type_tax_use', '=', 'purchase')]))
        self.assertEqual(bill.amount_total, 12000.0)  # the 3% withholding is only applied when paying
