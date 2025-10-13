from odoo import Command
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged
from odoo.tools import misc
from odoo.addons.account_edi_proxy_client.models.account_edi_proxy_user import AccountEdiProxyError


@tagged('external', 'external_l10n', 'post_install', '-post_install_l10n', '-at_install', '-standard', 'l10n_hr_edi')
class TestL10nHrEdiMerApi(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['ir.config_parameter'].sudo().set_param('account_edi_ubl_cii.use_new_dict_to_xml_helpers', True)
        cls.env.company.tax_calculation_rounding_method = 'round_globally'
        cls.partner_a.invoice_edi_format = 'ubl_hr'

        cls.pay_term_epd_mixed = cls.env['account.payment.term'].create({
            'name': "2/7 Net 30",
            'note': "Payment terms: 30 Days, 2% Early Payment Discount under 7 days",
            'early_discount': True,
            'discount_percentage': 2,
            'discount_days': 7,
            'early_pay_discount_computation': 'mixed',
            'line_ids': [Command.create({'value': 'percent', 'value_amount': 100.0, 'nb_days': 30})],
        })
        
        cls.proxy_user = cls.env['account_edi_mojerakun_proxy_client.user']._mer_register_proxy_user(
            cls.env.company,
            'mojeracun',
            'test',
            '12513',
            'AeXLoJf9Ld',
            'BE0477472701',
            None,
            'Test-002',
        )
        
    @classmethod
    def _create_company(cls, **create_values):
        # EXTENDS 'account'
        create_values['currency_id'] = cls.env.ref('base.EUR').id
        create_values['country_id'] = cls.env.ref('base.hr').id
        create_values['vat'] = 'BE0477472701'
        return super()._create_company(**create_values)

    def setup_partner_as_hr(self, partner):
        partner.write({
            'street': "Croatian Street 1",
            'zip': "1234",
            'city': "Croatian City",
            'vat': 'HR01234567896',
            'company_registry': '0000000001',
            'country_id': self.env.ref('base.hr').id,
            'bank_ids': [Command.create({'acc_number': 'HR10000000000000'})],
            'email': 'test1@test.test',
            'invoice_sending_method': 'mojeracun',
        })

    def setup_partner_as_be(self, partner):
        partner.write({
            'street': "Rue des Bourlottes 9",
            'zip': "1367",
            'city': "Ramillies",
            'vat': 'BE0477472701',
            'company_registry': '0477472701',
            'country_id': self.env.ref('base.be').id,
            'bank_ids': [Command.create({'acc_number': 'BE90735788866632'})],
            'email': 'test2@test.test',            
            'invoice_sending_method': 'mojeracun',
        })

    def test_mer_api_send(self):
        """
        Test sending generated invoice through MER. Server end DOES NOT RESET.
        """
        self.setup_partner_as_hr(self.env.company.partner_id)
        self.setup_partner_as_be(self.partner_a)
        tax = self.env['account.chart.template'].ref('VAT_S_IN_ROC_25')

        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_date': '2017-01-01',
            'invoice_line_ids': [
                Command.create({
                    'product_id': self.product_a.id,
                    'price_unit': 100.0,
                    'tax_ids': [Command.set(tax.ids)],
                }),
            ],
        })
        invoice.action_post()

        moves_data = {
            move.sudo(): {
                **self.env['account.move.send']._get_default_sending_settings(move),
            }
            for move in [invoice]
        }
        self.env['account.move.send']._generate_invoice_documents(moves_data, allow_fallback_pdf=False)

        print("--- DEBUG: test_mer_api_send(): invoice eID:", invoice.l10n_hr_mer_document_id, "status:", invoice.l10n_hr_mer_document_status, "---")

    def test_mer_api_ping(self):
        response = self.proxy_user._mer_api_ping()
        self.assertEqual(response.status_code, 200)

    def test_mer_api_query_inbox(self):
        response = self.proxy_user._mer_api_query_inbox(filter=None, electronic_id=None, status_id=None, date_from=None, date_to=None)
        self.assertEqual(response.status_code, 200)
        # This cannot be checked properly without there being an option to reset inbox/outbox on the MER server
        #self.assertEqual(response._content, b'[]')
        print("--- DEBUG: inbox API:", response.json(), "---")

    def test_mer_api_query_outbox(self):
        response = self.proxy_user._mer_api_query_outbox(filter=None, electronic_id=None, status_id=None, invoice_year=None, invoice_number=None, date_from=None, date_to=None)
        self.assertEqual(response.status_code, 200)
        # This cannot be checked properly without there being an option to reset inbox/outbox on the MER server
        #self.assertEqual(response._content, b'[]')
        print("--- DEBUG: outbox API:", response.json(), "---")

    def test_mer_check_identifier(self):
        response = self.proxy_user._mer_api_check_id(id_type='1', id_value=self.env.company.l10n_hr_mer_company_id)
        # Currently doesn't work, only getting 500 as response
        #print("--- DEBUG: check ID API:", response, "---")

    def test_mer_receive(self):
        # The first uploaded (sent to self) document in the system: 3082259
        response = self.proxy_user._mer_api_recieve_document(electronic_id='3082259')
        self.assertEqual(response.status_code, 200)
        print("--- DEBUG: receive API:", response._content[:100], "---")

    def test_mer_flow_get_new_documents(self):
        # Document 3082259 has a 'fake' tax, so it won't be imported
        imported_documents = self.proxy_user._mer_get_new_documents(undelivered=False, notify=False)[self.proxy_user.id]
        for i in range(len(imported_documents)):
            move = self.env['account.move'].search([('l10n_hr_mer_document_id', '=', str(imported_documents[i]))])
            imported_documents[i] = {'MER id': str(imported_documents[i]), 'move': move}
            print("--- DEBUG: move readout: ---",
                  "\n> move.invoice_date:", move.invoice_date,
                  "\n> move.invoice_line_ids:", move.invoice_line_ids)
            for line in move.invoice_line_ids:
                print("-> line.product_id:", line.product_id,
                      "\n-> line.price_unit:", line.price_unit,
                      "\n-> line.tax_ids:", line.tax_ids)
        print("--- DEBUG: get 'new' documents FLOW:", imported_documents, "---")
