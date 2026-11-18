# Part of Odoo. See LICENSE file for full copyright and licensing details.
from io import BytesIO
from lxml import etree
from zipfile import ZipFile
from odoo import fields, Command
from odoo.tests import HttpCase, tagged

from odoo.addons.account_edi_cii.tests.common import TestAccountEdiUblCiiCommon


@tagged('post_install', '-at_install')
class TestAccountEdiUbl(TestAccountEdiUblCiiCommon, HttpCase):

    def test_ubl_bis3_keeps_xml_attachment(self):
        """ Unlike Factur-X/ZUGFeRD, Peppol UBL formats don't embed an identical XML in the PDF,
        so the standalone XML attachment must still be sent alongside the PDF. """
        company = self._configure_seller_for_cii_export()
        self.partner_be.invoice_edi_format = 'ubl_bis3'
        invoice = self._create_invoice_one_line(
            partner_id=self.partner_be,
            price_unit=100.0,
            name='test line',
            tax_ids=self.company_data['default_tax_sale'],
            partner_bank_id=company.partner_id.bank_ids[:1].id,
            post=True,
        )

        wizard = self._create_account_move_send_wizard_single(invoice, sending_methods=['manual'])
        wizard.action_send_and_print()

        extra_attachments = self.env['account.move.send']._get_invoice_extra_attachments(invoice)
        self.assertIn(invoice.ubl_cii_xml_file.attachment_id, extra_attachments.ids)
        self.assertIn(invoice.invoice_pdf_report_file.attachment_id, extra_attachments.ids)

    def test_import_partner_peppol_fields(self):
        """ Check that the peppol fields are used to retrieve the partner when importing a Bis 3 xml. """
        invoice = self.env['account.move'].create({
            'partner_id': self.partner_be.id,
            'move_type': 'out_invoice',
            'invoice_line_ids': [Command.create({'product_id': self.product_a.id})]
        })
        invoice.action_post()
        xml_attachment = self.env['ir.attachment'].create({
            'raw': self.env['account.edi.xml.ubl_bis3']._export_invoice(invoice)[0],
            'name': 'test_invoice.xml',
        })

        # There is a duplicated partner (with the same name and email)
        self.env['res.partner'].create({
            'name': "My Belgian Partner",
            'email': "mypartner@email.com",
        })
        # Change the fields of the partner, keep the peppol fields
        self.partner_be.update({
            'name': "Turlututu",
            'email': False,
            'vat': False,
        })
        # The partner should be retrieved based on the peppol fields
        imported_invoice = self._import_invoice_as_attachment_on(attachment=xml_attachment, journal=self.company_data["default_journal_sale"])
        self.assertEqual(imported_invoice.partner_id, self.partner_be)

    def test_import_partner_peppol_fields_2(self):
        """ Test that UBL files missing the <cac:Contact> wrapper still correctly map partner info """
        xml_content = b'''<?xml version="1.0" encoding="UTF-8"?>
            <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2 http://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd">
                <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
                <cbc:CustomizationID>urn:www.cenbii.eu:transaction:biitrns010:ver2.0:extended:urn:www.peppol.eu:bis:peppol4a:ver2.0</cbc:CustomizationID>
                <cbc:ProfileID>urn:www.cenbii.eu:profile:bii04:ver2.0</cbc:ProfileID>
                <cbc:ID>INV-1234</cbc:ID>
                <cbc:IssueDate>2023-01-01</cbc:IssueDate>
                <cac:AccountingCustomerParty>
                    <cac:Party>
                        <cac:PartyName>
                            <cbc:Name>My Test Partner</cbc:Name>
                        </cac:PartyName>
                    </cac:Party>
                </cac:AccountingCustomerParty>
                <cac:LegalMonetaryTotal>
                    <cbc:PayableAmount currencyID="USD">100.00</cbc:PayableAmount>
                </cac:LegalMonetaryTotal>
            </Invoice>
        '''

        xml_attachment = self.env['ir.attachment'].create({
            'mimetype': 'application/xml',
            'raw': xml_content,
            'name': 'test_invoice.xml',
        })
        partner = self.env['res.partner'].create({
            'name': "My Test Partner",
            'email': "test@example.com",
        })
        # The partner should be retrieved based on the peppol fields
        imported_invoice = self._import_invoice_as_attachment_on(attachment=xml_attachment, journal=self.company_data["default_journal_sale"])
        self.assertEqual(imported_invoice.partner_id, partner)

    def test_import_partner_retrieval_bank_account_number(self):
        """Check that the bank account number is used to retrieve the partner when importing a non-BIS3 UBL XML.
        The payee financial account (BT-84) belongs to the seller: the XML is a self-billed invoice issued for partner_a
        and imported as a vendor bill of partner_a.
        """
        partner_bank = self.env['res.partner.bank'].create({
            'account_number': 'BE43200112345678',
            'partner_id': self.partner_a.id,
            'allow_out_payment': True,
        })
        # Update partner_a and link it with the bank account we created
        self.partner_a.update({
            'name': "Test Partner Bank Retrieval",
            'street': "42 Maze street",
            'city': "Berlin",
            'zip': "6534",
            'vat': 'BE0727720427',
            'country_id': self.env.ref('base.be').id,
            'bank_ids': partner_bank.ids,
        })

        invoice = self.env['account.move'].create({
            'partner_id': self.partner_a.id,
            'move_type': 'in_invoice',
            'invoice_date': '2024-01-01',
            'invoice_line_ids': [Command.create({'product_id': self.product_a.id})],
            'partner_bank_id': partner_bank.id,
        })
        invoice.action_post()

        xml_attachment = self.env['ir.attachment'].create({
            'raw': self.env['account.edi.ubl']._export_invoice(invoice)[0],
            'name': 'test_invoice.xml',
        })

        # Change the partner details so it can only be retrieved through the bank account
        self.partner_a.update({
            'name': "Different Partner",
            'vat': False,
            'email': False,
            'phone': False,
        })
        # partner_a should be matched through the bank account number and its VAT should be filled in from the XML
        imported_invoice = self._import_invoice_as_attachment_on(attachment=xml_attachment, journal=self.company_data['default_journal_purchase'])
        self.assertEqual(imported_invoice.partner_id, self.partner_a)
        self.assertEqual(imported_invoice.partner_id.vat, 'BE0727720427')

        # Change the VAT to trigger the VAT mismatch logic
        self.partner_a.vat = 'BE0403170701'
        # A new partner should be created
        imported_invoice = self._import_invoice_as_attachment_on(attachment=xml_attachment, journal=self.company_data["default_journal_purchase"])
        self.assertNotEqual(imported_invoice.partner_id, self.partner_a)
        self.assertRecordValues(imported_invoice.partner_id, [{
            'name': "Test Partner Bank Retrieval",
            'street': "42 Maze street",
            'city': "Berlin",
            'zip': "6534",
            'vat': 'BE0727720427',
            'country_id': self.env.ref('base.be').id,
        }])

    def test_get_invoice_legal_documents_fallback(self):
        company = self.company_data['company']
        company.phone = '11111111111'
        company.email = 'test@test.odoo.com'
        german_partner = self.env['res.partner'].create({
            'name': 'German partner',
            'country_id': self.env.ref('base.de').id,
        })
        us_partner = self.env['res.partner'].create({
            'name': 'US partner',
            'country_id': self.env.ref('base.us').id,
        })
        belgian_partner = self.env['res.partner'].create({
            'name': 'Belgian partner',
            'country_id': self.env.ref('base.be').id,
        })
        invoice_de = self.init_invoice('out_invoice', partner=german_partner, amounts=[100], taxes=[self.tax_sale_a], post=True)
        invoice_be = self.init_invoice('out_invoice', partner=belgian_partner, amounts=[100], taxes=[self.tax_sale_a], post=True)
        invoice_us = self.init_invoice('out_invoice', partner=us_partner, amounts=[100], taxes=[self.tax_sale_a], post=True)
        res = [document for invoice in (invoice_de + invoice_be + invoice_us) for document in invoice._get_invoice_legal_documents('ubl', allow_fallback=True)]
        self.assertEqual(len(res), 2)
        self.assertEqual(res[0].get('filename'), 'INV_2019_00001_zugferd.xml')
        self.assertEqual(res[1].get('filename'), 'INV_2019_00002_ubl_bis3.xml')
        invoice_be_failing = self.init_invoice('out_invoice', partner=belgian_partner, amounts=[100], post=True)
        legal_documents = invoice_be_failing._get_invoice_legal_documents('ubl', allow_fallback=True)
        self.assertEqual(len(legal_documents), 1)
        res_errors = legal_documents[0]
        self.assertIn("Each invoice line should have at least one tax.", res_errors.get('errors'))

    def test_import_bill(self):
        self.env['res.partner.bank'].sudo().create({
            'account_number': 'Test account',
            'partner_id': self.company_data['company'].partner_id.id,
            'allow_out_payment': True,
        })
        partner = self.env['res.partner'].create({
            'name': "My Belgian Partner",
            'vat': "BE0477472701",
            'email': "mypartner@email.com",
        })
        invoice = self.env['account.move'].create({
            'partner_id': partner.id,
            'move_type': 'out_invoice',
            'invoice_line_ids': [Command.create({'product_id': self.product_a.id})]
        })
        invoice.action_post()
        my_invoice_raw = self.env['account.edi.xml.ubl_bis3']._export_invoice(invoice)[0]
        my_invoice_root = etree.fromstring(my_invoice_raw)
        modifying_xpath = """<xpath expr="(//*[local-name()='LegalMonetaryTotal']/*[local-name()='TaxExclusiveAmount'])" position="replace">
        <TaxExclusiveAmount currencyID="EUR"><!--Some valid XML
comment-->1000.0</TaxExclusiveAmount></xpath>"""
        xml_attachment = self.env['ir.attachment'].create({
            'raw': etree.tostring(self.with_applied_xpath(my_invoice_root, modifying_xpath)),
            'name': 'test_invoice.xml',
        })
        imported_invoice = self._import_invoice_as_attachment_on(attachment=xml_attachment, journal=self.company_data["default_journal_purchase"])
        self.assertRecordValues(imported_invoice.invoice_line_ids, [{
            'amount_currency': 1000.00,
            'quantity': 1.0}])

    def test_importing_bill_shouldnt_set_current_company_bank_account(self):
        partner = self.env['res.partner'].create({
            'name': "My Belgian Partner",
        })
        invoice = self.env['account.move'].create({
            'partner_id': partner.id,
            'move_type': 'out_invoice',
            'invoice_line_ids': [Command.create({'product_id': self.product_a.id})]
        })
        invoice.action_post()
        my_invoice_raw = self.env['account.edi.xml.ubl_bis3']._export_invoice(invoice)[0]
        my_invoice_root = etree.fromstring(my_invoice_raw)
        modifying_xpath = """
            <xpath expr="(//*[local-name()='PaymentMeans']/*[local-name()='PaymentID'])" position="after">
                <PayeeFinancialAccount><ID>Test account</ID></PayeeFinancialAccount>
            </xpath>"""
        xml_attachment = self.env['ir.attachment'].create({
            'raw': etree.tostring(self.with_applied_xpath(my_invoice_root, modifying_xpath)),
            'name': 'test_invoice.xml',
        })
        move = self.env['account.journal']\
            .with_context(default_journal_id=self.company_data['default_journal_sale'].id)\
            ._create_document_from_attachment(xml_attachment.id)
        self.assertTrue(any('add your own bank account manually' in message.body for message in move.message_ids))

    def test_export_zip_includes_ubl_xml(self):
        partner = self._create_partner_be(invoice_edi_format='ubl_bis3')
        self.company_data['company'].partner_id.write({
            'routing_identifier': '0230:C2584563200',
        })
        invoices = self.env['account.move'].create([
            {
                'partner_id': partner.id,
                'move_type': 'out_invoice',
                'invoice_line_ids': [
                    Command.create({
                        'product_id': self.product_a.id,
                        'quantity': qty,
                        'price_unit': price,
                    }),
                ],
            }
            for qty, price in [(1, 100), (2, 200), (3, 300)]
        ])
        invoices[:2].action_post()
        invoices[:2]._generate_and_send()
        self.assertEqual(len(invoices), 3, "Setup precondition")
        self.authenticate(self.env.user.login, self.env.user.login)
        url = f'/account/download_move_attachments/{",".join(map(str, invoices.ids))}'
        res = self.url_open(url)
        self.assertEqual(res.status_code, 200)
        with ZipFile(BytesIO(res.content)) as zip_file:
            files = zip_file.namelist()
            xml_files = [f for f in files if f.endswith('.xml')]
            pdf_files = [f for f in files if f.endswith('.pdf')]
            self.assertEqual(
                len(xml_files), len(invoices[:2]),
                "Each posted invoice with UBL XML must contribute its XML to the ZIP",
            )
            self.assertEqual(
                len(pdf_files), len(invoices[:2]),
                "Each posted invoice must contribute its PDF to the ZIP",
            )

    def test_partner_edi_format_detection(self):
        partners = self.env['res.partner'].create([{
            'name': 'Partner',
            'country_id': country_id,
            'invoice_edi_format': edi_format,
        } for edi_format, country_id in [
            ('ubl_bis3', self.env.ref('base.hu').id),
            (False, self.env.ref('base.hu').id),  # HU has no default format
            (False, self.env.ref('base.nl').id),  # NL should have 'nlcius' as suggested format
        ]])
        formats = [p.with_company(self.env.company)._get_ubl_cii_edi_format() for p in partners]
        self.assertListEqual(formats, ['ubl_bis3', False, 'nlcius'])

        invoice = self.env['account.move'].create({
            'partner_id': partners[0].id,
            'move_type': 'out_invoice',
            'invoice_line_ids': [Command.create({
                'product_id': self.product_a.id,
                'price_unit': 100,
            })],
        })
        invoice.action_post()
        xml_content = invoice._get_invoice_legal_documents('ubl', allow_fallback=True)[0]
        xml_etree = self.get_xml_tree_from_string(xml_content['content'].decode()[39:])
        self.assertEqual(
            xml_etree.find('{*}CustomizationID').text,
            'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
        )

    def test_tax_subtotal(self):
        ubl_taxes = (self.reverse_charge_tax + self.zero_rated_tax + self.prod_tax + self.free_export_tax)
        # test tax by tax then with multiple taxes
        tax_list = list(ubl_taxes) + [ubl_taxes]
        for taxes in tax_list:
            invoice = self.env["account.move"].create({
                "partner_id": self.partner_a.id,
                "move_type": "out_invoice",
                "invoice_line_ids": [Command.create({"name": "Test product", "price_unit": 100, "tax_ids": [Command.set(taxes.ids)]})],
            })
            invoice.action_post()
            xml = self.env['account.edi.xml.ubl_bis3']._export_invoice(invoice)[0]
            root = etree.fromstring(xml)
            for tax, node in zip(taxes, root.findall('.//{*}TaxTotal/{*}TaxSubtotal/{*}TaxCategory')):
                self.assertEqual(node.findtext('.//{*}ID') or False, tax.ubl_cii_tax_category_code)
                self.assertEqual(node.findtext('.//{*}TaxExemptionReasonCode') or False, tax.ubl_cii_tax_exemption_reason_code)

    def test_custom_tax_exemption_reason(self):
        taxes = self.company_data['default_tax_sale'].copy({
            'name': 'Custom Exemtion Reason Tax',
            'ubl_cii_tax_category_code': 'AE',
            'ubl_cii_tax_exemption_reason': 'Just because',
            'ubl_cii_tax_exemption_reason_code': 'VATEX-EU-AE',
        })
        invoice = self.env["account.move"].create({
            "partner_id": self.partner_a.id,
            "move_type": "out_invoice",
            "invoice_line_ids": [Command.create({"name": "Test product", "price_unit": 10, "tax_ids": [Command.set(taxes.ids)]})],
        })
        invoice.action_post()
        xml = self.env['account.edi.xml.ubl_bis3']._export_invoice(invoice)[0]
        root = etree.fromstring(xml)
        for tax, node in zip(taxes, root.findall('.//{*}TaxTotal/{*}TaxSubtotal/{*}TaxCategory')):
            self.assertEqual(node.findtext('.//{*}ID') or False, tax.ubl_cii_tax_category_code)
            self.assertEqual(node.findtext('.//{*}TaxExemptionReason') or False, tax.ubl_cii_tax_exemption_reason)
            self.assertEqual(node.findtext('.//{*}TaxExemptionReasonCode') or False, tax.ubl_cii_tax_exemption_reason_code)

    def test_oin_code(self):
        partner = self.partner_a
        partner.country_id = self.env.ref('base.nl').id
        partner.additional_identifiers = {'NL_OIN': '00000000001020304050'}
        partner.bank_ids = [Command.create({'account_number': "0123456789", 'allow_out_payment': True})]
        invoice = self.env['account.move'].create({
            'partner_id': partner.id,
            'move_type': 'out_invoice',
            'invoice_date': "2024-12-01",
            'invoice_date_due': "2024-12-31",
            'invoice_line_ids': [Command.create({'product_id': self.product_a.id})],
        })

        invoice.partner_id.commercial_partner_id.invoice_edi_format = 'ubl_bis3'
        invoice.action_post()
        invoice.invoice_date_due = fields.Date.from_string('2024-12-31')
        builder = invoice.partner_id.commercial_partner_id._get_edi_builder('ubl_bis3')
        xml_content = builder._export_invoice(invoice)[0]
        xml_tree = etree.fromstring(xml_content)
        scheme_ID = xml_tree.find('.//cac:PartyLegalEntity/cbc:CompanyID[@schemeID]', self.ubl_namespaces)
        self.assertEqual(scheme_ID.attrib.get("schemeID"), "0190")

    def test_invoice_optional_fields(self):
        """Test that optional invoice and invoice lines custom fields added by the user are exported correctly"""
        model_id = self.env["ir.model"]._get_id("account.move")
        invoice_fields = [
            ("x_studio_peppol_tax_point_date", "date"),
            ("x_studio_peppol_contract_document_reference_id", "char"),
            ("x_studio_peppol_despatch_document_reference_id", "char"),
            ("x_studio_peppol_accounting_cost", "char"),
            ("x_studio_peppol_project_reference_id", "char"),
            ("x_studio_peppol_order_reference_id", "char"),
        ]

        self.env["ir.model.fields"].create([{
                "name": name,
                "model": "account.move",
                "model_id": model_id,
                "ttype": ttype,
                "state": "manual",
            }
            for name, ttype in invoice_fields
        ])

        model_id = self.env["ir.model"]._get_id("account.move.line")
        invoice_line_fields = [
            ("x_studio_peppol_order_line_reference_id", "char"),
            ("x_studio_peppol_buyers_item_id", "char"),
        ]

        self.env["ir.model.fields"].create([{
                "name": name,
                "model": "account.move.line",
                "model_id": model_id,
                "ttype": ttype,
                "state": "manual",
            }
            for name, ttype in invoice_line_fields
        ])

        invoice = self.env['account.move'].create({
            'partner_id': self.partner_a.id,
            'move_type': 'out_invoice',
            'invoice_line_ids': [
                Command.create({
                    'product_id': self.product_a.id,
                    'x_studio_peppol_order_line_reference_id': "order_line1-1234",
                    'x_studio_peppol_buyers_item_id': "item1-1234",
                }),
                Command.create({
                    'product_id': self.product_a.id,
                    'x_studio_peppol_order_line_reference_id': "order_line2-1234",
                    'x_studio_peppol_buyers_item_id': "item2-1234",
                })
            ],
            'x_studio_peppol_tax_point_date': "2028-01-01",
            'x_studio_peppol_contract_document_reference_id': "contract-1234",
            'x_studio_peppol_despatch_document_reference_id': "despatch-1234",
            'x_studio_peppol_accounting_cost': "88.5",
            'x_studio_peppol_project_reference_id': "project-1234",
            'x_studio_peppol_order_reference_id': "order-1234",
        })

        invoice.action_post()

        xml_content = self.env['account.edi.xml.ubl_bis3']._export_invoice(invoice)[0]
        xml_tree = etree.fromstring(xml_content)

        tax_point_date = xml_tree.find('.//cbc:TaxPointDate', self.ubl_namespaces)
        self.assertEqual(tax_point_date.text, '2028-01-01')

        contract_document_reference_id = xml_tree.find('.//cac:ContractDocumentReference/cbc:ID', self.ubl_namespaces)
        self.assertEqual(contract_document_reference_id.text, 'contract-1234')

        despatch_document_reference_id = xml_tree.find('.//cac:DespatchDocumentReference/cbc:ID', self.ubl_namespaces)
        self.assertEqual(despatch_document_reference_id.text, 'despatch-1234')

        accounting_cost = xml_tree.find('.//cbc:AccountingCost', self.ubl_namespaces)
        self.assertEqual(accounting_cost.text, '88.5')

        project_reference_id = xml_tree.find('.//cac:ProjectReference/cbc:ID', self.ubl_namespaces)
        self.assertEqual(project_reference_id.text, 'project-1234')

        order_reference_id = xml_tree.find('.//cac:OrderReference/cbc:ID', self.ubl_namespaces)
        self.assertEqual(order_reference_id.text, 'order-1234')

        order_line_reference_id = xml_tree.findall('.//cac:InvoiceLine/cac:OrderLineReference/cbc:LineID', self.ubl_namespaces)
        self.assertEqual(order_line_reference_id[0].text, 'order_line1-1234')
        self.assertEqual(order_line_reference_id[1].text, 'order_line2-1234')

        buyers_item_id = xml_tree.findall('.//cac:InvoiceLine/cac:Item/cac:BuyersItemIdentification/cbc:ID', self.ubl_namespaces)
        self.assertEqual(buyers_item_id[0].text, 'item1-1234')
        self.assertEqual(buyers_item_id[1].text, 'item2-1234')

    def test_credit_note_optional_fields(self):
        """Test that optional credit note and credit note lines custom fields added by the user are exported correctly"""
        model_id = self.env["ir.model"]._get_id("account.move")

        credit_note_fields = [
            ("x_studio_peppol_tax_point_date", "date"),
            ("x_studio_peppol_contract_document_reference_id", "char"),
            ("x_studio_peppol_despatch_document_reference_id", "char"),
            ("x_studio_peppol_accounting_cost", "char"),
            ("x_studio_peppol_order_reference_id", "char"),
        ]

        self.env["ir.model.fields"].create([{
                "name": name,
                "model": "account.move",
                "model_id": model_id,
                "ttype": ttype,
                "state": "manual",
            }
            for name, ttype in credit_note_fields
        ])

        model_id = self.env["ir.model"]._get_id("account.move.line")
        credit_note_line_fields = [
            ("x_studio_peppol_order_line_reference_id", "char"),
            ("x_studio_peppol_buyers_item_id", "char"),
        ]

        self.env["ir.model.fields"].create([{
                "name": name,
                "model": "account.move.line",
                "model_id": model_id,
                "ttype": ttype,
                "state": "manual",
            }
            for name, ttype in credit_note_line_fields
        ])

        credit_note = self.env['account.move'].create({
            'partner_id': self.partner_a.id,
            'move_type': 'out_refund',
            'invoice_line_ids': [Command.create({
                'product_id': self.product_a.id,
                'x_studio_peppol_order_line_reference_id': "order_line1-1234",
                'x_studio_peppol_buyers_item_id': "item1-1234",
            }),
                Command.create({
                    'product_id': self.product_a.id,
                    'x_studio_peppol_order_line_reference_id': "order_line2-1234",
                    'x_studio_peppol_buyers_item_id': "item2-1234",
                })
            ],
            'x_studio_peppol_tax_point_date': "2028-01-01",
            'x_studio_peppol_contract_document_reference_id': "contract-1234",
            'x_studio_peppol_despatch_document_reference_id': "despatch-1234",
            'x_studio_peppol_accounting_cost': "88.5",
            'x_studio_peppol_order_reference_id': "order-1234",
        })

        credit_note.action_post()

        xml_content = self.env['account.edi.xml.ubl_bis3']._export_invoice(credit_note)[0]
        xml_tree = etree.fromstring(xml_content)

        tax_point_date = xml_tree.find('.//cbc:TaxPointDate', self.ubl_namespaces)
        self.assertEqual(tax_point_date.text, '2028-01-01')

        contract_document_reference_id = xml_tree.find('.//cac:ContractDocumentReference/cbc:ID', self.ubl_namespaces)
        self.assertEqual(contract_document_reference_id.text, 'contract-1234')

        despatch_document_reference_id = xml_tree.find('.//cac:DespatchDocumentReference/cbc:ID', self.ubl_namespaces)
        self.assertEqual(despatch_document_reference_id.text, 'despatch-1234')

        accounting_cost = xml_tree.find('.//cbc:AccountingCost', self.ubl_namespaces)
        self.assertEqual(accounting_cost.text, '88.5')

        order_reference_id = xml_tree.find('.//cac:OrderReference/cbc:ID', self.ubl_namespaces)
        self.assertEqual(order_reference_id.text, 'order-1234')

        order_line_reference_id = xml_tree.findall('.//cac:CreditNoteLine/cac:OrderLineReference/cbc:LineID', self.ubl_namespaces)
        self.assertEqual(order_line_reference_id[0].text, 'order_line1-1234')
        self.assertEqual(order_line_reference_id[1].text, 'order_line2-1234')

        buyers_item_id = xml_tree.findall('.//cac:CreditNoteLine/cac:Item/cac:BuyersItemIdentification/cbc:ID', self.ubl_namespaces)
        self.assertEqual(buyers_item_id[0].text, 'item1-1234')
        self.assertEqual(buyers_item_id[1].text, 'item2-1234')

    def test_import_ubl_21_line_description(self):
        self.place_prdct.write({'default_code': 'PLC', 'description_purchase': "Purchase description"})
        line_template = '''
            <cac:InvoiceLine>
                <cbc:ID>{id}</cbc:ID>
                <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
                <cbc:LineExtensionAmount currencyID="USD">100.00</cbc:LineExtensionAmount>
                <cac:Item>
                    {description}
                    <cbc:Name>Placement</cbc:Name>
                    <cac:SellersItemIdentification>
                        <cbc:ID>PLC</cbc:ID>
                    </cac:SellersItemIdentification>
                    <cac:ClassifiedTaxCategory>
                        <cbc:ID>S</cbc:ID>
                        <cbc:Percent>17.3</cbc:Percent>
                        <cac:TaxScheme>
                            <cbc:ID>VAT</cbc:ID>
                        </cac:TaxScheme>
                    </cac:ClassifiedTaxCategory>
                </cac:Item>
                <cac:Price>
                    <cbc:PriceAmount currencyID="USD">100.00</cbc:PriceAmount>
                </cac:Price>
            </cac:InvoiceLine>
        '''
        lines = ''.join(
            line_template.format(id=index, description=description)
            for index, description in enumerate([
                '',
                '<cbc:Description>Custom description</cbc:Description>',
                '<cbc:Description>Placement\nExtra description</cbc:Description>',
            ], start=1)
        )
        xml_content = f'''<?xml version="1.0" encoding="UTF-8"?>
            <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
                <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
                <cbc:ID>INV-1234</cbc:ID>
                <cbc:IssueDate>2023-01-01</cbc:IssueDate>
                <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
                <cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>
                <cac:AccountingSupplierParty>
                    <cac:Party>
                        <cac:PartyName>
                            <cbc:Name>My Test Partner</cbc:Name>
                        </cac:PartyName>
                    </cac:Party>
                </cac:AccountingSupplierParty>
                <cac:LegalMonetaryTotal>
                    <cbc:LineExtensionAmount currencyID="USD">300.00</cbc:LineExtensionAmount>
                    <cbc:PayableAmount currencyID="USD">300.00</cbc:PayableAmount>
                </cac:LegalMonetaryTotal>
                {lines}
            </Invoice>
        '''
        xml_attachment = self.env['ir.attachment'].create({
            'mimetype': 'application/xml',
            'raw': xml_content.encode(),
            'name': 'test_invoice.xml',
        })

        bill = self._import_invoice_as_attachment_on(attachment=xml_attachment)
        self.assertRecordValues(bill.invoice_line_ids, [
            {'product_id': self.place_prdct.id, 'name': "Purchase description", 'tax_ids': []},
            {'product_id': self.place_prdct.id, 'name': "Custom description", 'tax_ids': []},
            {'product_id': self.place_prdct.id, 'name': "Extra description", 'tax_ids': []},
        ])

