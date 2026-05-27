from freezegun import freeze_time
from lxml import etree

from odoo import fields
from odoo.tests import tagged

from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.addons.account_peppol.tests.common import (
    mock_lookup_not_found,
    mock_lookup_success,
)


@tagged('-at_install', 'post_install')
class TestPeppolIdentifiers(AccountTestInvoicingCommon):
    """Test identifier resolution for Peppol: _peppol_get_possible_identifiers,
    _get_eas_endpoint, and partner sync caching."""

    @classmethod
    @AccountTestInvoicingCommon.setup_country('be')
    def setUpClass(cls):
        super().setUpClass()
        cls.env['ir.config_parameter'].sudo().set_str('account_peppol.edi.mode', 'test')
        cls.env.company.write({
            'account_peppol_proxy_state': 'receiver',
        })
        cls.env.company.partner_id.additional_identifiers = {'BE_EN': '0477472701'}

        cls.private_key = cls.env['certificate.key'].create({
            'name': 'Test key PEPPOL',
            'content': cls.file_read('account_peppol/tests/assets/private_key.pem'),
        })
        cls.env['account_edi_proxy_client.user'].create({
            'id_client': 'test_id_client',
            'proxy_type': 'peppol',
            'edi_mode': 'test',
            'edi_identification': '0208:0477472701',
            'private_key_id': cls.private_key.id,
            'refresh_token': 'deadbeef-0000-0000-0000-000000000000',
        })

    # -------------------------------------------------------------------------
    # 1. _peppol_get_possible_identifiers
    # -------------------------------------------------------------------------

    def test_possible_identifiers_vat_only(self):
        """Partner with only VAT => one peppol identifier (VAT-based)."""
        partner = self.env['res.partner'].create({
            'name': 'VAT only',
            'country_id': self.env.ref('base.be').id,
            'vat': 'BE0477472701',
        })
        identifiers = partner._peppol_get_possible_identifiers()
        # Should have at least the VAT identifier: 9925:BE0477472701
        self.assertTrue(any(i.startswith('9925:') for i in identifiers))

    def test_possible_identifiers_en_only(self):
        """Partner with only an EN identifier in additional_identifiers."""
        partner = self.env['res.partner'].create({
            'name': 'EN only',
            'country_id': self.env.ref('base.be').id,
            'additional_identifiers': {'BE_EN': '0477472701'},
        })
        identifiers = partner._peppol_get_possible_identifiers()
        self.assertIn('0208:0477472701', identifiers)

    def test_possible_identifiers_en_and_vat(self):
        """Partner with both VAT and EN => EN comes first (lower sequence)."""
        partner = self.env['res.partner'].create({
            'name': 'EN + VAT',
            'country_id': self.env.ref('base.be').id,
            'vat': 'BE0477472701',
            'additional_identifiers': {'BE_EN': '0477472701'},
        })
        identifiers = partner._peppol_get_possible_identifiers()
        self.assertTrue(len(identifiers) >= 2)
        # EN (0208, sequence 10) should be before VAT (9925, higher sequence)
        en_idx = next(i for i, x in enumerate(identifiers) if x.startswith('0208:'))
        vat_idx = next(i for i, x in enumerate(identifiers) if x.startswith('9925:'))
        self.assertLess(en_idx, vat_idx)

    def test_possible_identifiers_with_enrichment(self):
        """With enrich=True, deduced identifiers (e.g., BE_VAT => BE_EN) are also included."""
        partner = self.env['res.partner'].create({
            'name': 'Enriched',
            'country_id': self.env.ref('base.be').id,
            'vat': 'BE0477472701',
        })
        without_enrich = partner._peppol_get_possible_identifiers(enrich=False)
        with_enrich = partner._peppol_get_possible_identifiers(enrich=True)
        # Enriched should have at least as many identifiers
        self.assertGreaterEqual(len(with_enrich), len(without_enrich))
        # Should include the deduced BE_EN identifier
        self.assertTrue(any(i.startswith('0208:') for i in with_enrich))

    def test_possible_identifiers_empty(self):
        """Partner with no VAT and no additional_identifiers => empty list."""
        partner = self.env['res.partner'].create({
            'name': 'Empty',
            'country_id': self.env.ref('base.be').id,
        })
        identifiers = partner._peppol_get_possible_identifiers()
        self.assertEqual(identifiers, [])

    # FIXME add test for manual peppol_send_to_endpoint

    # -------------------------------------------------------------------------
    # 2. _get_eas_endpoint (BIS3 builder)
    # -------------------------------------------------------------------------

    def test_eas_endpoint_en_priority(self):
        """EN identifier takes priority over VAT."""
        partner = self.env['res.partner'].create({
            'name': 'EN priority',
            'country_id': self.env.ref('base.be').id,
            'vat': 'BE0477472701',
            'additional_identifiers': {'BE_EN': '0477472701'},
        })
        bis3 = self.env['account.edi.xml.ubl_bis3']
        eas, endpoint = bis3._get_eas_endpoint(partner)
        self.assertEqual(eas, '0208')
        self.assertEqual(endpoint, '0477472701')

    def test_eas_endpoint_vat_fallback(self):
        """Without EN, falls back to VAT."""
        partner = self.env['res.partner'].create({
            'name': 'VAT fallback',
            'country_id': self.env.ref('base.be').id,
            'vat': 'BE0477472701',
        })
        bis3 = self.env['account.edi.xml.ubl_bis3']
        eas, endpoint = bis3._get_eas_endpoint(partner)
        self.assertEqual(eas, '9925')
        self.assertEqual(endpoint, 'BE0477472701')

    def test_eas_endpoint_country_scoped(self):
        """Identifiers are filtered to the partner's country."""
        partner = self.env['res.partner'].create({
            'name': 'DK partner',
            'country_id': self.env.ref('base.dk').id,
            'additional_identifiers': {'DK_EN': '12345674'},
        })
        bis3 = self.env['account.edi.xml.ubl_bis3']
        eas, endpoint = bis3._get_eas_endpoint(partner)
        self.assertEqual(eas, '0184')
        self.assertEqual(endpoint, '12345674')

    def test_eas_endpoint_none_when_no_identifiers(self):
        """No identifiers => (None, None)."""
        partner = self.env['res.partner'].create({
            'name': 'No ID',
            'country_id': self.env.ref('base.be').id,
        })
        bis3 = self.env['account.edi.xml.ubl_bis3']
        self.assertEqual(bis3._get_eas_endpoint(partner), (None, None))

    # todo test two user error from button_sync

    # -------------------------------------------------------------------------
    # 4. Partner sync caching
    # -------------------------------------------------------------------------

    def test_sync_first_time(self):
        """First sync (no metadata_updated_at) always performs lookup."""
        partner = self.env['res.partner'].create({
            'name': 'First sync',
            'country_id': self.env.ref('base.be').id,
            'additional_identifiers': {'BE_EN': '2718281828'},
        })
        self.assertFalse(partner.peppol_metadata_updated_at)
        with mock_lookup_success('0208:2718281828'):
            partner._peppol_sync_partner_metadata(force=False)
        self.assertTrue(partner.peppol_metadata_updated_at)
        self.assertEqual(partner.peppol_verification_state, 'valid')

    def test_sync_within_ttl_skipped(self):
        """Sync within TTL is skipped (unless force=True)."""
        partner = self.env['res.partner'].create({
            'name': 'Recent sync',
            'country_id': self.env.ref('base.be').id,
            'additional_identifiers': {'BE_EN': '2718281828'},
        })
        # Set metadata_updated_at to now (within TTL)
        with mock_lookup_success('0208:2718281828'):
            partner._peppol_sync_partner_metadata(force=True)
        first_ts = partner.peppol_metadata_updated_at

        # Second sync without force => skipped (metadata_updated_at unchanged)
        partner._peppol_sync_partner_metadata(force=False)
        self.assertEqual(partner.peppol_metadata_updated_at, first_ts)

    def test_sync_force_ignores_ttl(self):
        """Force sync always performs lookup regardless of TTL."""
        partner = self.env['res.partner'].create({
            'name': 'Force sync',
            'country_id': self.env.ref('base.be').id,
            'additional_identifiers': {'BE_EN': '2718281828'},
        })
        with mock_lookup_success('0208:2718281828'):
            partner._peppol_sync_partner_metadata(force=True)
        first_ts = partner.peppol_metadata_updated_at

        with mock_lookup_success('0208:2718281828'):
            partner._peppol_sync_partner_metadata(force=True)
        self.assertGreaterEqual(partner.peppol_metadata_updated_at, first_ts)

    @freeze_time('2023-01-15')
    def test_sync_after_ttl_expiry(self):
        """Sync after TTL expiry performs lookup."""
        partner = self.env['res.partner'].create({
            'name': 'Expired sync',
            'country_id': self.env.ref('base.be').id,
            'additional_identifiers': {'BE_EN': '2718281828'},
        })
        # Set metadata_updated_at to 8 days ago (past 7-day TTL)
        partner.peppol_metadata_updated_at = fields.Datetime.subtract(fields.Datetime.now(), days=8)

        with mock_lookup_success('0208:2718281828'):
            partner._peppol_sync_partner_metadata(force=False)
        # Should have been refreshed
        self.assertEqual(partner.peppol_verification_state, 'valid')

    def test_sync_not_found(self):
        """Sync when partner not on Peppol => not_valid state."""
        partner = self.env['res.partner'].create({
            'name': 'Not on peppol',
            'country_id': self.env.ref('base.be').id,
            'additional_identifiers': {'BE_EN': '3141592654'},
        })
        with (
            mock_lookup_not_found('0208:3141592654'),
            mock_lookup_not_found('9925:be3141592654'),
        ):
            partner._peppol_sync_partner_metadata(force=True)
        self.assertEqual(partner.peppol_verification_state, 'not_valid')

    # -------------------------------------------------------------------------
    # 5. Alerts (account_move_send)
    # -------------------------------------------------------------------------

    def test_alert_company_not_configured(self):
        """Alert when company has no EAS endpoint identifiable."""
        partner = self.env['res.partner'].create({
            'name': 'Valid customer',
            'country_id': self.env.ref('base.be').id,
            'additional_identifiers': {'BE_EN': '2718281828'},
            'invoice_edi_format': 'ubl_bis3',
        })
        with mock_lookup_success('0208:2718281828'):
            partner._peppol_sync_partner_metadata(force=True)

        # Clear company identifiers
        self.env.company.partner_id.write({'vat': False, 'additional_identifiers': {}})

        move = self.env['account.move'].create({
            'partner_id': partner.id,
            'move_type': 'out_invoice',
            'invoice_line_ids': [{'product_id': self.product_a.id}],
        })
        move.action_post()

        wizard = self.env['account.move.send'].with_context(
            active_model='account.move',
            active_ids=move.ids,
        ).create({})
        alerts = wizard._get_alerts(move, {move: {'invoice_edi_format': 'ubl_bis3'}})
        self.assertIn('account_edi_ubl_cii_configure_company', alerts)

    # -------------------------------------------------------------------------
    # 6. Import flow — EndpointID => additional_identifiers
    # -------------------------------------------------------------------------

    def test_import_endpoint_to_additional_identifiers(self):
        """Importing a UBL with EndpointID stores value in additional_identifiers."""
        bis3 = self.env['account.edi.xml.ubl_bis3']
        # Minimal BIS3 XML with EndpointID
        xml = etree.fromstring(b'''
            <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
                     xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                     xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
                <cac:AccountingSupplierParty>
                    <cac:Party>
                        <cbc:EndpointID schemeID="0208">0477472701</cbc:EndpointID>
                    </cac:Party>
                </cac:AccountingSupplierParty>
            </Invoice>
        ''')
        vals = bis3._import_retrieve_partner_vals(xml, 'AccountingSupplier')
        # The BE_EN identifier should be in additional_identifiers
        self.assertIn('additional_identifiers', vals)
        self.assertEqual(vals['additional_identifiers'].get('BE_EN'), '0477472701')
