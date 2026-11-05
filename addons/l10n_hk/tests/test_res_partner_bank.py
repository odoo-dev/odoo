# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.exceptions import ValidationError
from odoo.tests import Form, tagged

from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nHKResPartnerBank(AccountTestInvoicingCommon):

    @classmethod
    def setup_armageddon_tax(cls, tax_name, company_data):
        # Hong Kong doesn't have any tax
        return None

    @classmethod
    @AccountTestInvoicingCommon.setup_country('hk')
    def setUpClass(cls):
        super().setUpClass()
        cls.vendor = cls.env['res.partner'].create({'name': 'HK Vendor', 'country_id': cls.env.ref('base.hk').id})

    def test_account_number_from_fps_proxy(self):
        with Form(self.env['res.partner.bank'].with_context(default_partner_id=self.vendor.id)) as bank_form:
            bank_form.proxy_type = 'mobile'
            bank_form.proxy_value = '+852-61234567'
        self.assertEqual(bank_form.record.account_number, '+852-61234567')

        # An account number already set is kept
        with Form(self.env['res.partner.bank'].with_context(default_partner_id=self.vendor.id)) as bank_form:
            bank_form.account_number = '004123456789'
            bank_form.proxy_type = 'id'
            bank_form.proxy_value = '1234567'
        self.assertEqual(bank_form.record.account_number, '004123456789')

    def test_branch_code(self):
        bank_account = self.env['res.partner.bank'].create({
            'account_number': '456789',
            'partner_id': self.vendor.id,
            'clearing_number': '004',
            'l10n_hk_branch_code': '123',
        })
        for invalid_code in ('12A', '１２３'):
            with self.subTest(code=invalid_code), self.assertRaisesRegex(ValidationError, "Branch Code must consist of 3 digits."):
                bank_account.l10n_hk_branch_code = invalid_code
