from odoo.addons.base.tests.common import BaseCommon
from odoo.tests import HttpCase, tagged
from odoo.tools import urls


@tagged('post_install_l10n', '-at_install', 'post_install')
class TestL10nSaPortalAddress(BaseCommon, HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.saudi_arabia = cls.quick_ref('base.sa')
        cls.env.company.write({
            'country_id': cls.saudi_arabia.id,
            'account_fiscal_country_id': cls.saudi_arabia.id,
        })
        cls.portal_user = cls._create_new_portal_user()
        cls.submit_url = urls.urljoin(cls.base_url(), '/my/address/submit')
        cls.address_values = {
            'name': 'Saudi Buyer',
            'email': 'buyer@example.com',
            'phone': '+966556666666',
            'street': '4557 King Salman St',
            'city': 'Riyadh',
            'zip': '94538',
            'country_id': cls.saudi_arabia.id,
            'vat': '311111111111113',
            'l10n_sa_edi_building_number': '1230',
            'l10n_sa_edi_plot_identification': '2323',
        }

    def _submit_address_values(self, values):
        return self.url_open(self.submit_url, data={
            **values,
            'csrf_token': self.csrf_token(),
            'address_type': 'billing',
            'use_delivery_as_billing': True,
            'partner_id': self.portal_user.partner_id.id,
        }).json()

    def test_identification_schemes(self):
        schemes = dict(self.env['res.partner']._l10n_sa_get_identification_schemes())
        self.assertEqual(schemes['CRN'], 'Commercial Registration Number')
        self.assertIn('TIN', schemes)
        self.assertNotIn('GST', schemes, "The VAT number is not an identification scheme")

    def test_address_form_offers_identification_schemes(self):
        """The address form of an SA company lists the ZATCA identification schemes."""
        self.authenticate(self.portal_user.login, self.portal_user.login)
        response = self.url_open('/my/account')
        self.assertEqual(response.status_code, 200)
        self.assertIn('name="l10n_sa_edi_additional_identification_scheme"', response.text)
        self.assertIn('value="CRN"', response.text)
        self.assertIn('Commercial Registration Number', response.text)

    def test_submitted_scheme_is_stored_as_an_identifier(self):
        self.authenticate(self.portal_user.login, self.portal_user.login)
        result = self._submit_address_values({
            **self.address_values,
            'l10n_sa_edi_additional_identification_scheme': 'CRN',
            'l10n_sa_edi_additional_identification_number': '353535353535353',
        })
        self.assertFalse(result.get('invalid_fields'), result.get('messages'))

        partner = self.portal_user.partner_id
        partner.invalidate_recordset()
        self.assertEqual(partner.additional_identifiers, {'SA_CRN': '353535353535353'})
        self.assertEqual(partner.l10n_sa_edi_building_number, '1230')
        self.assertEqual(partner.l10n_sa_edi_plot_identification, '2323')

    def test_submitted_scheme_can_be_edited(self):
        """Re-submitting the form with another scheme replaces the previous identifier."""
        self.authenticate(self.portal_user.login, self.portal_user.login)
        self._submit_address_values({
            **self.address_values,
            'l10n_sa_edi_additional_identification_scheme': 'CRN',
            'l10n_sa_edi_additional_identification_number': '353535353535353',
        })
        result = self._submit_address_values({
            **self.address_values,
            'l10n_sa_edi_additional_identification_scheme': 'NAT',
            'l10n_sa_edi_additional_identification_number': '1076543210',
        })
        self.assertFalse(result.get('invalid_fields'), result.get('messages'))

        partner = self.portal_user.partner_id
        partner.invalidate_recordset()
        self.assertEqual(partner.additional_identifiers, {'SA_NAT': '1076543210'})
        self.assertEqual(partner.l10n_sa_edi_additional_identification_scheme, 'NAT')
        self.assertEqual(partner.l10n_sa_edi_additional_identification_number, '1076543210')

    def test_submitted_tin_scheme_needs_no_number(self):
        """The TIN is not asked for on the form, it is the VAT number."""
        self.authenticate(self.portal_user.login, self.portal_user.login)
        result = self._submit_address_values({
            **self.address_values,
            'l10n_sa_edi_additional_identification_scheme': 'TIN',
            'l10n_sa_edi_additional_identification_number': '',
        })
        self.assertFalse(result.get('invalid_fields'), result.get('messages'))

        partner = self.portal_user.partner_id
        partner.invalidate_recordset()
        self.assertEqual(partner.additional_identifiers, {'SA_TIN': '311111111111113'})
        self.assertEqual(partner.l10n_sa_edi_additional_identification_scheme, 'TIN')
        self.assertEqual(partner.l10n_sa_edi_additional_identification_number, partner.vat)
