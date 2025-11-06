from odoo import Command
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tools import file_open


class TestUblBis3Common(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.company.tax_calculation_rounding_method = 'round_globally'

    @classmethod
    def _import_as_attachment(cls, file_path):
        filename = file_path.split('/')[-1]
        full_file_path = f"{cls.test_module}/tests/test_files/{file_path}"
        with file_open(full_file_path, 'rb') as file:
            return cls.env['ir.attachment'].create({
                'mimetype': 'application/xml',
                'name': filename,
                'raw': file.read(),
            })

    @classmethod
    def _import_as_attachment_on(cls, file_path=None, attachment=None, journal=None):
        assert file_path or attachment
        assert not file_path or not attachment
        journal = journal or cls.company_data["default_journal_purchase"]
        if file_path:
            attachment = cls._import_as_attachment(file_path)
        return journal._create_document_from_attachment(attachment.id)

    @classmethod
    def _create_company(cls, **create_values):
        # EXTENDS 'account'
        create_values.setdefault('currency_id', cls.env.ref('base.EUR').id)
        company = super()._create_company(**create_values)
        company.tax_calculation_rounding_method = 'round_globally'
        return company

    @classmethod
    def _create_partner_be(cls, **kwargs):
        return cls.env['res.partner'].create({
            'name': 'partner_be_2',
            'street': "Rue des Bourlottes 9",
            'zip': "1367",
            'city': "Ramillies",
            'vat': 'BE0477472701',
            'company_registry': '0477472701',
            'invoice_sending_method': 'manual',
            'invoice_edi_format': 'ubl_bis3',
            'property_account_receivable_id': cls.company_data['default_account_receivable'].id,
            'property_account_payable_id': cls.company_data['default_account_payable'].id,
            'company_id': cls.company_data['company'].id,
            'bank_ids': [Command.create({'acc_number': 'BE90735788866632'})],
            'country_id': cls.env.ref('base.be').id,
            **kwargs,
        })

class TestUblBis3BECommon(TestUblBis3Common):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner_be = cls._create_partner_be()

    @classmethod
    def _create_company(cls, **create_values):
        # EXTENDS 'TestUblBis3Common'
        company = super()._create_company(**create_values)

        company.partner_id.write({
            'street': "Chaussée de Namur 40",
            'zip': "1367",
            'city': "Ramillies",
            'vat': 'BE0202239951',
            'company_registry': '0202239951',
            'country_id': cls.env.ref('base.be').id,
            'bank_ids': [Command.create({'acc_number': 'BE15001559627230'})],
        })

        return company
