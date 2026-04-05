# -*- coding: utf-8 -*-
from odoo.tests import tagged
from odoo.addons.account.tests.common import AccountTestInvoicingCommon

@tagged('post_install', '-at_install')
class TestAdditionalIdentifiers(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner = cls.env['res.partner'].create({
            'name': 'Test Partner Identifiers',
            'country_id': cls.env.ref('base.fr').id,
        })

    def test_field_stores_json(self):
        """ Test that we can store and retrieve JSON from the new field. """
        self.partner.additional_identifiers = {'FR_SIRET': '73282932000074'}
        self.assertEqual(self.partner.additional_identifiers, {'FR_SIRET': '73282932000074'})

    def test_empty_value_not_stored(self):
        """ Test that empty string values are stripped before persistence. """
        self.partner.additional_identifiers = {'FR_SIRET': ''}
        self.assertFalse(self.partner.additional_identifiers)

    def test_mixed_empty_and_set_values(self):
        """ Test that empty strings are dropped while valid values remain. """
        self.partner.additional_identifiers = {'GLN': '1234567890123', 'FR_SIRET': ''}
        self.assertEqual(self.partner.additional_identifiers, {'GLN': '1234567890123'})
        self.assertNotIn('FR_SIRET', self.partner.additional_identifiers)

    def test_identifier_metadata_global(self):
        """ Global metadata method call """
        metadata = self.env['res.partner'].get_available_additional_identifiers_metadata(None, seq_max=999)
        self.assertTrue(isinstance(metadata, dict))
        self.assertTrue(len(metadata) > 2)
        # Check standard properties for international
        gln_meta = metadata['GLN']
        self.assertEqual(gln_meta['eas'], '0088')
        self.assertNotIn('type', gln_meta)

        self.assertNotIn('FR_VAT', metadata) # Taxes are excluded

    def test_identifier_metadata_by_country_multiple(self):
        """ Filters mapped directly to a country include generic and non-tax ids. """
        metadata = self.env['res.partner'].get_available_additional_identifiers_metadata('FR', seq_max=999)
        keys = metadata.keys()
        self.assertIn('FR_SIREN', keys)
        self.assertIn('FR_SIRET', keys)
        self.assertNotIn('FR_VAT', keys)

    def test_identifier_metadata_by_country(self):
        """ Specific country check """
        metadata = self.env['res.partner'].get_available_additional_identifiers_metadata('IT', seq_max=999)
        keys = metadata.keys()
        self.assertIn('IT_CF', keys)
        self.assertNotIn('IT_VAT', keys)

        it_cf_meta = metadata['IT_CF']
        self.assertNotIn('type', it_cf_meta)

    def test_peppol_eas_metadata_keys(self):
        """ Check that essential non-tax EAS fallbacks are explicitly mapped. """
        metadata = self.env['res.partner'].get_available_additional_identifiers_metadata('NO', seq_max=999)
        keys_to_check = ['GLN', 'NO_EN']
        found_keys = [k for k in metadata if k in keys_to_check]
        self.assertEqual(len(found_keys), len(keys_to_check))
