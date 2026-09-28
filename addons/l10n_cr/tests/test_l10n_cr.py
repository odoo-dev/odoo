# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.fields import Command
from odoo.tests import Form, tagged

from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nCr(AccountTestInvoicingCommon):

    @classmethod
    @AccountTestInvoicingCommon.setup_country('cr')
    def setUpClass(cls):
        super().setUpClass()
        cls.partner_a.country_id = cls.env.ref('base.cr')
        cls.sale_13 = cls.env['account.chart.template'].ref('account_tax_template_iva_venta_13')
        cls.purchase_13 = cls.env['account.chart.template'].ref('account_tax_template_iva_compra_13')

    def _tax_line_account_code(self, move_type):
        move = self._create_invoice(
            move_type=move_type,
            partner_id=self.partner_a,
            invoice_line_ids=[Command.create({'name': 'line', 'price_unit': 100.0})],
        )
        return move.line_ids.filtered(lambda line: line.display_type == 'tax').account_id.code

    def test_default_taxes_post_to_split_vat_accounts(self):
        self.assertEqual(self.env.company.account_sale_tax_id, self.sale_13)
        self.assertEqual(self.env.company.account_purchase_tax_id, self.purchase_13)
        self.assertEqual(self._tax_line_account_code('out_invoice'), '212101')
        self.assertEqual(self._tax_line_account_code('in_invoice'), '114001')

    def test_export_fiscal_position_maps_sales_only(self):
        ChartTemplate = self.env['account.chart.template']
        export = ChartTemplate.ref('fiscal_position_cr_exterior')
        state = ChartTemplate.ref('fiscal_position_cr_estado')
        exempt_export = ChartTemplate.ref('account_tax_template_iva_venta_exento_export')
        exempt = ChartTemplate.ref('account_tax_template_iva_venta_exento')
        self.assertEqual(export.map_tax(self.sale_13), exempt_export)
        self.assertEqual(export.map_tax(exempt), exempt_export)
        self.assertEqual(export.map_tax(self.purchase_13), self.purchase_13)
        self.assertEqual(state.map_tax(exempt), exempt)

    def test_document_types_number_independently(self):
        invoice = self.init_invoice('out_invoice', partner=self.partner_a, amounts=[100.0], post=True)
        context = {'active_model': 'account.move', 'active_ids': invoice.ids}
        reversal = self.env['account.move.reversal'].with_context(context).create({'journal_id': invoice.journal_id.id})
        credit_note = self.env['account.move'].browse(reversal.refund_moves()['res_id'])
        debit_note = self.env['account.move'].browse(
            self.env['account.debit.note'].with_context(context).create({'copy_lines': True}).create_debit()['res_id'],
        )
        (credit_note | debit_note).action_post()
        self.assertEqual(
            (invoice | credit_note | debit_note).mapped('name'),
            ['FE 00000001', 'NC 00000001', 'ND 00000001'],
        )

    def test_district_onchange_fills_canton_and_province(self):
        san_rafael = self.env.ref('l10n_cr.district_cr_20108')
        with Form(self.env['res.partner']) as partner_form:
            partner_form.name = 'Coyol'
            partner_form.country_id = self.env.ref('base.cr')
            partner_form.l10n_cr_district_id = san_rafael
            self.assertEqual(partner_form.city_id, self.env.ref('l10n_cr.city_cr_201'))
            self.assertEqual(partner_form.state_id, self.env.ref('base.state_A'))
            partner_form.city_id = self.env.ref('l10n_cr.city_cr_101')
            self.assertFalse(partner_form.l10n_cr_district_id)
        self.assertEqual(san_rafael.display_name, 'San Rafael (Alajuela)')
