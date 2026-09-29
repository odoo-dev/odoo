# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import os
from xml.etree import ElementTree as ET

from odoo.exceptions import UserError
from odoo.tests import tagged
from odoo.addons.l10n_pt_certification.tests.common import TestL10nPtCommon
from odoo.addons.l10n_pt_certification.models.account_tax import L10N_PT_TAX_EXEMPTIONS

try:
    import xmlschema
except ImportError:
    xmlschema = None


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nPtSaft(TestL10nPtCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Ensure company has complete Portuguese address
        cls.company_data['company'].write({
            'street': 'Avenida da Liberdade 100',
            'city': 'Lisboa',
            'zip': '1250-145',
            'vat': 'PT500000000',
            'company_registry': '500000000',
        })
        cls.partner_pt = cls.env['res.partner'].create({
            'name': 'Cliente Nacional PT',
            'street': 'Rua do Ouro 1',
            'city': 'Lisboa',
            'zip': '1100-060',
            'country_id': cls.env.ref('base.pt').id,
            'vat': 'PT501234567',
        })
        cls.partner_es = cls.env['res.partner'].create({
            'name': 'Cliente Espanha ES',
            'street': 'Gran Via 1',
            'city': 'Madrid',
            'zip': '28013',
            'country_id': cls.env.ref('base.es').id,
            'vat': 'ESB12345678',
        })

    def test_saft_wizard_validation_and_export(self):
        """Test SAF-T wizard export with exemptions, credit notes, foreign partners, and product codes."""
        # 1. Create duplicate default_code products
        prod_a = self.env['product.product'].create({
            'name': 'Serviço A',
            'default_code': 'PROD_DUP',
            'type': 'service',
        })
        prod_b = self.env['product.product'].create({
            'name': 'Artigo B',
            'default_code': 'PROD_DUP',
            'type': 'consu',
        })

        # 2. Create invoice with regular tax and exemption
        tax_exempt = self.env['account.tax'].search([
            ('company_id', '=', self.company_data['company'].id),
            ('type_tax_use', '=', 'sale'),
            ('amount', '=', 0.0),
        ], limit=1)
        if not tax_exempt:
            tax_exempt = self.env['account.tax'].create({
                'name': 'IVA Isento (M01)',
                'amount': 0.0,
                'type_tax_use': 'sale',
                'company_id': self.company_data['company'].id,
                'l10n_pt_tax_exemption_reason': 'M01',
            })
        else:
            tax_exempt.write({'l10n_pt_tax_exemption_reason': 'M01'})

        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_pt.id,
            'invoice_date': '2026-01-15',
            'date': '2026-01-15',
            'invoice_line_ids': [
                (0, 0, {
                    'product_id': prod_a.id,
                    'quantity': 1,
                    'price_unit': 100.0,
                    'tax_ids': [(6, 0, self.tax_23.ids)],
                }),
                (0, 0, {
                    'product_id': prod_b.id,
                    'quantity': 2,
                    'price_unit': 50.0,
                    'tax_ids': [(6, 0, tax_exempt.ids)],
                }),
            ],
        })
        invoice.action_post()

        # 3. Create credit note reversing the invoice
        reversal = self.env['account.move.reversal'].with_context(
            active_model='account.move',
            active_ids=invoice.ids,
        ).create({
            'reason': 'Devolução de mercadoria',
            'date': '2026-01-16',
        })
        res = reversal.reverse_moves()
        credit_note = self.env['account.move'].browse(res['res_id'])
        credit_note.action_post()

        # 4. Create invoice for foreign customer
        inv_foreign = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_es.id,
            'invoice_date': '2026-01-20',
            'date': '2026-01-20',
            'invoice_line_ids': [
                (0, 0, {
                    'product_id': prod_a.id,
                    'quantity': 5,
                    'price_unit': 80.0,
                    'tax_ids': [(6, 0, tax_exempt.ids)],
                }),
            ],
        })
        inv_foreign.action_post()

        # 5. Run SAF-T Export Wizard
        wizard = self.env['l10n_pt.saft.export.wizard'].create({
            'company_id': self.company_data['company'].id,
            'date_from': '2026-01-01',
            'date_to': '2026-01-31',
            'type': 'F',
        })
        wizard.action_export_saft()

        self.assertTrue(wizard.export_file, "SAF-T file binary must be generated.")
        xml_content = base64.b64decode(wizard.export_file)
        root = ET.fromstring(xml_content)

        # Check Header
        header = root.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}Header')
        self.assertIsNotNone(header)
        self.assertEqual(header.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}AuditFileVersion').text, '1.04_01')
        self.assertEqual(header.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}ProductCompanyTaxID').text, '510825442')
        self.assertEqual(header.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}ProductID').text, 'Odoo/19.0')

        # Check MasterFiles - Customers
        customers = root.findall('.//{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}Customer')
        pt_cust = next((c for c in customers if c.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}CustomerID').text == str(self.partner_pt.id)), None)
        self.assertIsNotNone(pt_cust)
        # Domestic PT VAT stripped of 'PT' prefix
        self.assertEqual(pt_cust.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}CustomerTaxID').text, '501234567')

        es_cust = next((c for c in customers if c.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}CustomerID').text == str(self.partner_es.id)), None)
        self.assertIsNotNone(es_cust)
        # Foreign ES VAT retains prefix
        self.assertEqual(es_cust.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}CustomerTaxID').text, 'ESB12345678')

        # Check MasterFiles - Products (Unique ProductCode)
        products = root.findall('.//{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}Product')
        product_codes = [p.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}ProductCode').text for p in products]
        self.assertEqual(len(product_codes), len(set(product_codes)), "All ProductCodes must be strictly unique.")

        # Check SourceDocuments - SalesInvoices
        lines = root.findall('.//{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}Line')
        for line in lines:
            reason = line.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}TaxExemptionReason')
            if reason is not None and reason.text:
                self.assertLessEqual(len(reason.text), 60, f"TaxExemptionReason '{reason.text}' exceeds 60 characters.")

        # Check Credit Note References
        cn_elem = next(
            inv for inv in root.findall('.//{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}Invoice')
            if inv.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}InvoiceType').text == 'NC'
        )
        self.assertIsNotNone(cn_elem)
        cn_lines = cn_elem.findall('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}Line')
        for cl in cn_lines:
            ref = cl.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}References')
            self.assertIsNotNone(ref, "Credit note line must have <References> element.")
            self.assertTrue(ref.find('{urn:OECD:StandardAuditFile-Tax:PT_1.04_01}Reference').text)

        # Validate with official schema if xmlschema is present
        schema_path = '/home/vvro/.gemini/antigravity/brain/04a02f2f-fdf8-45a2-9f63-96a00d7fb18f/scratch/SAF-T_PT_1.04_01.xsd'
        if xmlschema and os.path.exists(schema_path):
            schema = xmlschema.XMLSchema(schema_path)
            self.assertTrue(schema.is_valid(xml_content), f"SAF-T XML validation failed: {schema.validate(xml_content)}")

    def test_saft_missing_address_validation(self):
        """Test that missing partner or company address raises UserError rather than injecting dummy data."""
        incomplete_partner = self.env['res.partner'].create({
            'name': 'Cliente Incompleto',
            'street': False,  # Missing street
            'city': 'Porto',
            'zip': '4000-001',
            'country_id': self.env.ref('base.pt').id,
        })
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': incomplete_partner.id,
            'invoice_date': '2026-01-25',
            'date': '2026-01-25',
            'invoice_line_ids': [
                (0, 0, {
                    'name': 'Item',
                    'quantity': 1,
                    'price_unit': 10.0,
                    'tax_ids': [(6, 0, self.tax_23.ids)],
                }),
            ],
        })
        invoice.action_post()

        wizard = self.env['l10n_pt.saft.export.wizard'].create({
            'company_id': self.company_data['company'].id,
            'date_from': '2026-01-01',
            'date_to': '2026-01-31',
            'type': 'F',
        })
        with self.assertRaises(UserError) as cm:
            wizard.action_export_saft()
        self.assertIn("incomplete addresses", str(cm.exception))
