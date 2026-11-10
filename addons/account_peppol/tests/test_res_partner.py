from odoo.tests.common import tagged
from odoo.tests.form import Form

from odoo.addons.account_peppol.tests.common import PeppolConnectorCommon


@tagged('-at_install', 'post_install')
class TestResPartner(PeppolConnectorCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

    def test_vat_update(self):
        partner = self.env['res.partner'].create({
            'name': 'Test Partner',
            'country_id': self.env.ref('base.be').id,
        })
        partner_view = self.env.ref("account_peppol.res_partner_form_account_peppol")

        # Set valid VAT first => Peppol endpoint/eas updated
        with self._mock_requests([
            self._mock_lookup_participant(True),
        ]):
            with Form(partner, view=partner_view) as partner_form:
                # Check preconditions
                self.assertEqual(partner_form.peppol_verification_state, "not_verified")
                self.assertFalse(partner_form.peppol_endpoint)
                self.assertFalse(partner_form.peppol_eas)

                partner_form.vat = "BE0477472701"
        # Check postconditions: peppol derived from VAT
        self.assertEqual(partner.peppol_verification_state, "not_valid_format")
        self.assertEqual(partner.peppol_endpoint, "0477472701")
        self.assertIn(partner_form.record.peppol_eas, partner.available_peppol_eas)
        partner.unlink()

    def test_vat_after_peppol(self):
        # Case:
        #   Set valid peppol first
        #   Set different VAT => no update of peppol info
        partner = self.env['res.partner'].create({
            'name': 'Test Partner',
            'country_id': self.env.ref('base.be').id,
            'peppol_eas': '0208',
            'peppol_endpoint': '0477472701',
            'peppol_verification_state': 'valid',
            'invoice_sending_method': 'peppol',
            'invoice_edi_format': 'ubl_bis3',
        })
        partner_view = self.env.ref("account_peppol.res_partner_form_account_peppol")
        with Form(partner, view=partner_view) as partner_form:
            # Check preconditions
            self.assertFalse(partner_form.vat)
            self.assertEqual(partner_form.peppol_verification_state, "valid")
            self.assertEqual(partner_form.peppol_endpoint, "0477472701")
            self.assertIn(partner_form.peppol_eas, partner.available_peppol_eas)

            partner_form.record.vat = "BE0851927541"
            # Valid Peppol info unchanged in the form
            self.assertEqual(partner_form.peppol_verification_state, "valid")
            self.assertEqual(partner_form.peppol_endpoint, "0477472701")
            self.assertIn(partner_form.peppol_eas, partner.available_peppol_eas)
        # Check postconditions: peppol unchanged as it was valid
        self.assertEqual(partner.peppol_endpoint, "0477472701")
        self.assertEqual(partner.peppol_verification_state, "valid")
        self.assertIn(partner.peppol_eas, partner.available_peppol_eas)
        partner.unlink()

        # Case:
        #   Set peppol first, partner not on peppol => verif_state updated
        #   Set VAT => Peppol endpoint, eas, verif_state updated
        partner = self.env['res.partner'].create({
            'name': 'Test Partner',
            'country_id': self.env.ref('base.be').id,
            'peppol_eas': '0208',
            'peppol_endpoint': '0477472702',
            'invoice_sending_method': 'peppol',
            'invoice_edi_format': 'ubl_bis3',
        })
        with self._mock_requests([
            self._mock_lookup_participant(already_exists=True),
        ]):
            with Form(partner, view=partner_view) as partner_form:
                # Check preconditions
                self.assertEqual(partner_form.record.peppol_verification_state, "not_verified")
                self.assertFalse(partner_form.vat)

                partner_form.vat = "BE0477472701"  # triggers compute of peppol

        # Check postconditions: peppol updated to VAT as it was not_verified
        self.assertEqual(partner.peppol_endpoint, "0477472701")
        self.assertEqual(partner.peppol_verification_state, "not_valid_format")  # No service format supported
        self.assertIn(partner.peppol_eas, partner.available_peppol_eas)
        partner.unlink()

        # Case:
        #   Set peppol first, partner not on peppol => verif_state updated
        #   Set VAT => Peppol endpoint, eas, verif_state updated
        partner = self.env['res.partner'].create({
            'name': 'Test Partner',
            'country_id': self.env.ref('base.be').id,
            'peppol_eas': '0208',
            'peppol_endpoint': '0477472702',
            'invoice_sending_method': 'peppol',
            'invoice_edi_format': 'ubl_bis3',
        })
        with self._mock_requests([
            self._mock_lookup_participant(
                already_exists=True,
                services=[{'formats': ['urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0']}]),
        ]):
            with Form(partner, view=partner_view) as partner_form:
                # Check preconditions
                self.assertEqual(partner_form.record.peppol_verification_state, "not_verified")
                self.assertFalse(partner_form.vat)

                partner_form.vat = "BE0477472701"

        # Check postconditions: peppol updated to VAT as it was not_verified
        self.assertEqual(partner.peppol_endpoint, "0477472701")
        self.assertEqual(partner.peppol_verification_state, "valid")  # services supported format
        self.assertIn(partner.peppol_eas, partner.available_peppol_eas)
        partner.unlink()
