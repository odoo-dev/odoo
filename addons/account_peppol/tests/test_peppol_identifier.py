from odoo.tests.common import TransactionCase, tagged


@tagged('-at_install', 'post_install')
class TestPeppolIdentifier(TransactionCase):

    def test_no_recompute_when_registered(self):
        """ The Peppol EAS/Endpoint of a company registered on Peppol must not
            be recomputed when its VAT changes afterwards, as the registered
            configuration would no longer match the one on the network.
        """
        company = self.env.company
        company.partner_id.country_id = self.env.ref('base.be')
        company.write({'peppol_eas': '0208', 'peppol_endpoint': '0239843188'})
        company.account_peppol_proxy_state = 'receiver'

        company.partner_id.vat = 'BE0477472701'

        self.assertEqual(company.peppol_eas, '0208')
        self.assertEqual(company.peppol_endpoint, '0239843188')

    def test_recompute_when_not_registered(self):
        """ A company not registered on Peppol keeps the standard behavior:
            filling the VAT recomputes the endpoint. """
        company = self.env.company
        company.partner_id.country_id = self.env.ref('base.be')
        company.write({'peppol_eas': '0106', 'peppol_endpoint': False})
        self.assertEqual(company.account_peppol_proxy_state, 'not_registered')

        company.partner_id.write({'peppol_eas': '9925', 'vat': 'BE0477472701'})

        self.assertEqual(company.peppol_endpoint, 'BE0477472701')
