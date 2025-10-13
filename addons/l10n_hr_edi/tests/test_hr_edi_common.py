from odoo import Command
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged
from odoo.tools import misc


@tagged('post_install_l10n', 'post_install', '-at_install', 'l10n_hr_edi')
class TestL10nHrEdiCommon(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['ir.config_parameter'].sudo().set_param('account_edi_ubl_cii.use_new_dict_to_xml_helpers', True)
        cls.env.company.tax_calculation_rounding_method = 'round_globally'
        cls.partner_a.invoice_edi_format = 'ubl_bis3'

        cls.pay_term_epd_mixed = cls.env['account.payment.term'].create({
            'name': "2/7 Net 30",
            'note': "Payment terms: 30 Days, 2% Early Payment Discount under 7 days",
            'early_discount': True,
            'discount_percentage': 2,
            'discount_days': 7,
            'early_pay_discount_computation': 'mixed',
            'line_ids': [Command.create({'value': 'percent', 'value_amount': 100.0, 'nb_days': 30})],
        })

    @classmethod
    def _create_company(cls, **create_values):
        # EXTENDS 'account'
        create_values['currency_id'] = cls.env.ref('base.EUR').id
        create_values['country_id'] = cls.env.ref('base.hr').id
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
        })