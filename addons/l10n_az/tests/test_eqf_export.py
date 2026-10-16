from lxml import etree

from odoo import Command
from odoo.exceptions import ValidationError
from odoo.tests import tagged
from odoo.tools import file_open

from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestAzEqfExport(AccountTestInvoicingCommon):
    chart_template = 'az'
    country_code = 'AZ'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.ref('base.AZN').active = True
        country_az = cls.env.ref('base.az')
        cls.company_data['company'].write({
            'vat': '1234567890',
            'street': 'Nizami küç. 10',
            'city': 'Bakı',
            'zip': 'AZ1000',
        })
        cls.partner_az = cls.env['res.partner'].create({
            'name': 'Azeri Customer',
            'is_company': True,
            'vat': '0987654321',
            'street': 'Füzuli küç. 5',
            'city': 'Bakı',
            'country_id': country_az.id,
        })
        chart = cls.env['account.chart.template'].with_company(cls.env.company)
        cls.tax_18 = chart.ref('az_tax_sale_vat_18_group')
        cls.tax_0 = chart.ref('az_tax_sale_vat_0_group')
        cls.product_a.write({'l10n_az_eqf_product_code': '2921430000', 'barcode': '4600000000017'})
        cls.product_b.write({'l10n_az_eqf_product_code': '2921440000'})

    def _create_az_invoice(self, partner=None, post=True):
        return self._create_invoice(
            partner_id=partner or self.partner_az,
            invoice_line_ids=[
                Command.create({'product_id': self.product_a.id, 'quantity': 3, 'price_unit': 33.33, 'discount': 10, 'tax_ids': self.tax_18.ids}),
                Command.create({'product_id': self.product_b.id, 'quantity': 1.5, 'price_unit': 200, 'tax_ids': self.tax_0.ids}),
                Command.create({'product_id': self.product_b.id, 'quantity': 2, 'price_unit': 50, 'tax_ids': []}),
            ],
            post=post,
        )

    def _get_eqf_attachments(self, invoices):
        return self.env['ir.attachment'].search([
            ('res_model', '=', 'account.move'),
            ('res_id', 'in', invoices.ids),
            ('name', '=like', 'EQF_%'),
        ])

    def test_product_code_constraint(self):
        for wrong_code in ('292143000', '29214300.0'):
            with self.assertRaises(ValidationError):
                self.product_a.l10n_az_eqf_product_code = wrong_code

    def test_generate_xml_content(self):
        invoice = self._create_az_invoice()
        xml_content = invoice._l10n_az_eqf_generate_xml()
        self.assertEqual(invoice._l10n_az_eqf_validate_xml(xml_content), [])

        root = etree.fromstring(xml_content)
        self.assertEqual(
            [child.tag for child in root],
            ['{http://www.w3.org/1999/XSL/Transform}stylesheet', 'qaimeKime', 'qaimeKimden', 'ds', 'dn', 'des', 'des2', 'ma', 'product', 'qaimeKimeAd'],
        )
        self.assertEqual(root.findtext('qaimeKime'), '0987654321')
        self.assertEqual(root.findtext('qaimeKimden'), '1234567890')
        self.assertEqual(root.findtext('ma'), 'Nizami küç. 10, Bakı, AZ1000, Azerbaijan')

        rows = root.findall('product/qaimeTable/row')
        self.assertEqual(
            [[row.findtext(f'c{i}') for i in (1, 4, 5, 6, 9, 10, 11, 12, 13, 14, 16, 17)] for row in rows],
            [
                ['2921430000', '3.0000', '29.996666667', '89.9900', '89.9900', '89.9900', '0.0000', '0.0000', '0.0000', '16.2000', '106.1900', '4600000000017'],
                ['2921440000', '1.5000', '200.000000000', '300.0000', '300.0000', '0.0000', '0.0000', '0.0000', '300.0000', '0.0000', '300.0000', '0'],
                ['2921440000', '2.0000', '50.000000000', '100.0000', '100.0000', '0.0000', '100.0000', '0.0000', '0.0000', '0.0000', '100.0000', '0'],
            ],
        )
        totals = root.find('product/qaimeYekunTable/row')
        self.assertEqual(
            [child.text for child in totals],
            ['489.99', '0.00', '489.99', '89.99', '100.00', '0.00', '300.00', '16.20', '506.19', '0.00'],
        )
        self.assertEqual(totals.findtext('c9'), f'{invoice.amount_total:.2f}')

    def test_embedded_stylesheet(self):
        invoice = self._create_az_invoice()
        parser = etree.XMLParser(remove_blank_text=True)
        root = etree.fromstring(invoice._l10n_az_eqf_generate_xml(), parser)
        with file_open('l10n_az/tests/data/EQF_MT.xml', 'rb') as sample:
            sample_root = etree.fromstring(sample.read(), parser)
        stylesheet = root[0]
        self.assertEqual(etree.tostring(stylesheet, method='c14n'), etree.tostring(sample_root[0], method='c14n'))
        html = str(etree.XSLT(stylesheet)(root))
        self.assertIn('0987654321', html)
        self.assertIn('506.19', html)

    def test_reference_sample_validation(self):
        with file_open('l10n_az/tests/data/EQF_MT.xml', 'rb') as sample:
            errors = self.env['account.move']._l10n_az_eqf_validate_xml(sample.read())
        self.assertTrue(errors)
        self.assertIn('row 0', errors[0])
        self.assertIn('c6', errors[0])

    def test_action_generate(self):
        invoice_1 = self._create_az_invoice()
        invoice_2 = self._create_az_invoice()

        action = invoice_1.action_l10n_az_eqf_generate()
        attachment = self._get_eqf_attachments(invoice_1)
        self.assertEqual(attachment.name, f"EQF_{invoice_1.name.replace('/', '_')}.xml")
        self.assertEqual(action['url'], f'/web/content/{attachment.id}?download=true')
        self.assertEqual(invoice_1.message_ids[0].attachment_ids, attachment)
        self.assertNotEqual(invoice_1.message_main_attachment_id, attachment)

        action = (invoice_1 + invoice_2).action_l10n_az_eqf_generate()
        attachments_1 = self._get_eqf_attachments(invoice_1)
        attachments_2 = self._get_eqf_attachments(invoice_2)
        self.assertEqual(len(attachments_1), 2)
        self.assertEqual(len(attachments_2), 1)
        self.assertEqual(
            action['url'],
            f'/account/download_invoice_attachments/{(attachments_1 - attachment).id},{attachments_2.id}',
        )

    def test_action_generate_blocked(self):
        partner_no_vat = self.partner_az.copy({'name': 'Customer Without VÖEN', 'vat': False})
        valid_invoice = self._create_az_invoice()
        invalid_invoice = self._create_az_invoice(partner=partner_no_vat, post=False)
        invalid_invoice.invoice_line_ids[0].tax_ids = self.tax_18 + self.tax_0
        # 344,966.65 / 300,001 rounded to 9 decimals, times 300,001, misses the subtotal by 0.000115.
        invalid_invoice.invoice_line_ids = [Command.create({
            'product_id': self.product_a.id, 'quantity': 300001, 'price_unit': 1.15, 'discount': 0.01, 'tax_ids': self.tax_18.ids,
        })]
        invalid_invoice.action_post()
        self.product_b.l10n_az_eqf_product_code = False

        with self.assertRaisesRegex(ValidationError, r'^Unable to generate EQF for the following reason\(s\):') as error:
            (valid_invoice + invalid_invoice).action_l10n_az_eqf_generate()
        message = str(error.exception)
        self.assertIn('Customer Without VÖEN', message)
        self.assertIn('National Goods/Services Code', message)
        self.assertIn('different EQF VAT Treatments', message)
        self.assertIn('too large for the precision of the EQF unit price', message)
        self.assertFalse(self._get_eqf_attachments(valid_invoice + invalid_invoice))
