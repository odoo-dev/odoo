from unittest.mock import patch

from odoo.tests import tagged
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install', '-at_install')
class TestPartnerFields(AccountTestInvoicingCommon):

    def test_partner_ubl_cii_formats(self):
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
