# -*- coding: utf-8 -*-

from odoo.tests import tagged
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install', '-at_install')
class TestAccountUblCii(AccountTestInvoicingCommon):

    def test_get_eas_endpoint(self):
        bis3 = self.env['account.edi.xml.ubl_bis3']
        partner = self.env['res.partner'].create({
            'name': 'BE partner',
            'country_id': self.env.ref('base.be').id,
            'additional_identifiers': {'BE_EN': '0477472701'},
        })
        # EN identifier takes priority
        self.assertEqual(bis3._get_eas_endpoint(partner), ('0208', '0477472701'))

        # With VAT but no EN → falls back to VAT
        partner_vat = self.env['res.partner'].create({
            'name': 'BE partner VAT only',
            'country_id': self.env.ref('base.be').id,
            'vat': 'BE0477472701',
        })
        self.assertEqual(bis3._get_eas_endpoint(partner_vat), ('9925', 'BE0477472701'))

        # No identifiers at all → (None, None)
        partner_empty = self.env['res.partner'].create({
            'name': 'Empty partner',
            'country_id': self.env.ref('base.be').id,
        })
        self.assertEqual(bis3._get_eas_endpoint(partner_empty), (None, None))

    def test_get_eas_endpoint_country_filter(self):
        """Identifiers are filtered by the partner's country."""
        bis3 = self.env['account.edi.xml.ubl_bis3']
        # A DK partner with a DK enterprise number
        partner = self.env['res.partner'].create({
            'name': 'DK partner',
            'country_id': self.env.ref('base.dk').id,
            'additional_identifiers': {'DK_EN': '12345674'},
        })
        self.assertEqual(bis3._get_eas_endpoint(partner), ('0184', '12345674'))

    def test_partner_ubl_cii_formats(self):
        from unittest.mock import patch

        def _get_ubl_cii_formats_info(self):
            return {
                'ubl_no_country': {'on_peppol': True},
                'peppol': {'countries': ['NZ', 'AU'], 'on_peppol': True},
                'cii': {'countries': ['AU'], 'on_peppol': False, 'sequence': 90},
            }

        Partner = self.env['res.partner']
        partner_nz = self.env['res.partner'].create({
            'name': "NZ partner",
            'country_id': self.env.ref('base.nz').id,
        })
        partner_be = self.env['res.partner'].create({
            'name': "BE partner",
            'country_id': self.env.ref('base.be').id,
        })
        partner_au = self.env['res.partner'].create({
            'name': "AU partner",
            'country_id': self.env.ref('base.au').id,
        })
        with patch.object(self.env.registry['res.partner'], '_get_ubl_cii_formats_info', _get_ubl_cii_formats_info):
            self.assertEqual(Partner._get_ubl_cii_formats(), ['ubl_no_country', 'peppol', 'cii'])
            self.assertEqual(Partner._get_ubl_cii_formats_by_country()['NZ'], ['peppol'])
            self.assertEqual(Partner._get_ubl_cii_formats_by_country()['AU'], ['peppol', 'cii'])
            self.assertEqual(Partner._get_peppol_formats(), ['ubl_no_country', 'peppol'])
            self.assertEqual(partner_au._get_suggested_ubl_cii_edi_format(), 'cii')  # AU matches 2 formats but 'cii' has a lower sequence
            self.assertEqual(partner_nz._get_suggested_ubl_cii_edi_format(), 'peppol')
            self.assertFalse(partner_be._get_suggested_ubl_cii_edi_format())
