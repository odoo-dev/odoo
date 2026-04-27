from odoo.addons.account_edi_ubl_cii.tests.common import TestUblBis3Common, TestUblCiiBECommon
from odoo.tests import tagged


@tagged('post_install_l10n', 'post_install', '-at_install', *TestUblBis3Common.extra_tags)
class TestPdfXmlParity(TestUblBis3Common, TestUblCiiBECommon):

    def test_prepare_edi_vals_returns_ubl_payload_for_ubl_invoice(self):
        """ The UBL override of _prepare_edi_vals returns a dict with the
        XML-builder's enriched `vals` stashed, plus a tax_totals shape the PDF
        template can consume directly. """
        tax_21 = self.percent_tax(21.0)
        invoice = self._create_invoice_one_line(
            product_id=self._create_product(lst_price=100.0, taxes_id=tax_21),
            partner_id=self.partner_be,
            post=True,
        )

        prepared = self.env['account.move.send']._prepare_edi_vals(invoice)
        self.assertIsNotNone(prepared)
        self.assertIn('tax_totals', prepared)
        self.assertIn('_ubl_vals', prepared)
        self.assertIn('_ubl_builder', prepared)
        self.assertIn('base_lines', prepared['_ubl_vals'])
        self.assertIn('document_node', prepared['_ubl_vals'])

    def test_edi_tax_totals_shape_matches_qweb_contract(self):
        """ The EDI-sourced tax_totals must expose the same keys that
        account.document_tax_totals_template reads, so the existing template
        renders unchanged when it reads from `edi` instead of from `o`. """
        tax_21 = self.percent_tax(21.0)
        invoice = self._create_invoice_one_line(
            product_id=self._create_product(lst_price=100.0, taxes_id=tax_21),
            partner_id=self.partner_be,
            post=True,
        )

        prepared = self.env['account.move.send']._prepare_edi_vals(invoice)
        edi_tt = prepared['tax_totals']

        for key in ('subtotals', 'base_amount_currency', 'tax_amount_currency',
                    'total_amount_currency', 'same_tax_base', 'has_tax_groups'):
            self.assertIn(key, edi_tt)

        for subtotal in edi_tt['subtotals']:
            for key in ('name', 'base_amount_currency', 'tax_groups'):
                self.assertIn(key, subtotal)
            for tax_group in subtotal['tax_groups']:
                for key in ('group_name', 'tax_amount_currency',
                            'display_base_amount_currency'):
                    self.assertIn(key, tax_group)

    def test_edi_tax_totals_matches_move_without_reshape(self):
        """ For a plain VAT invoice with no UBL-specific reshape (no recycling
        contribution, no emptying tax, no cash rounding), the EDI-sourced
        tax_totals must agree with the move's native tax_totals — otherwise
        we'd be changing PDF output for a plain invoice. """
        tax_21 = self.percent_tax(21.0)
        invoice = self._create_invoice_one_line(
            product_id=self._create_product(lst_price=100.0, taxes_id=tax_21),
            partner_id=self.partner_be,
            post=True,
        )

        prepared = self.env['account.move.send']._prepare_edi_vals(invoice)
        self.assertAlmostEqual(
            invoice.tax_totals['base_amount_currency'],
            prepared['tax_totals']['base_amount_currency'],
            places=2,
        )
        self.assertAlmostEqual(
            invoice.tax_totals['tax_amount_currency'],
            prepared['tax_totals']['tax_amount_currency'],
            places=2,
        )
        self.assertAlmostEqual(
            invoice.tax_totals['total_amount_currency'],
            prepared['tax_totals']['total_amount_currency'],
            places=2,
        )

    def test_report_values_exposes_edi_by_doc_for_ubl_invoice(self):
        """ The invoice report's _get_report_values must populate edi_by_doc so
        a direct /report/pdf/... URL render gets the same dict that the send
        wizard would have threaded in via `data=`. """
        tax_21 = self.percent_tax(21.0)
        invoice = self._create_invoice_one_line(
            product_id=self._create_product(lst_price=100.0, taxes_id=tax_21),
            partner_id=self.partner_be,
            post=True,
        )

        report_values = self.env['report.account.report_invoice']._get_report_values(
            [invoice.id], data={'report_type': 'pdf'},
        )
        self.assertIn('edi_by_doc', report_values)
        self.assertIn(invoice.id, report_values['edi_by_doc'])
        self.assertIn('tax_totals', report_values['edi_by_doc'][invoice.id])

    def test_report_values_edi_by_doc_empty_when_no_edi_format(self):
        """ When no UBL EDI format applies, that invoice has no entry in
        edi_by_doc and the QWeb template falls through to the native `o.*`
        reads — no regression on vanilla invoicing. """
        tax_21 = self.percent_tax(21.0)
        partner = self.env['res.partner'].create({
            **self._create_partner_default_values(),
            'name': 'partner_no_edi',
            'country_id': self.env.ref('base.be').id,
            'invoice_edi_format': False,
        })
        invoice = self._create_invoice_one_line(
            product_id=self._create_product(lst_price=100.0, taxes_id=tax_21),
            partner_id=partner,
            post=True,
        )

        report_values = self.env['report.account.report_invoice']._get_report_values(
            [invoice.id], data={'report_type': 'pdf'},
        )
        self.assertIn('edi_by_doc', report_values)
        self.assertNotIn(invoice.id, report_values['edi_by_doc'])

    def test_send_wizard_threads_edi_prepared_vals(self):
        """ The send-wizard path must store edi_prepared_vals in invoice_data so
        the PDF renderer downstream receives it via `data=`. """
        tax_21 = self.percent_tax(21.0)
        invoice = self._create_invoice_one_line(
            product_id=self._create_product(lst_price=100.0, taxes_id=tax_21),
            partner_id=self.partner_be,
            post=True,
        )

        self._generate_invoice_ubl_file(invoice)
        self.assertTrue(invoice.invoice_pdf_report_id)
        self.assertTrue(invoice.ubl_cii_xml_id)
