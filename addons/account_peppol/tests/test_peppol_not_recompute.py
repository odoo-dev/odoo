from odoo.tests import tagged

from odoo.addons.account.tests.common import AccountTestInvoicingCommon

@tagged('post_install', '-at_install')
class TestPeppolNotRecompute(AccountTestInvoicingCommon):

    def test_peppol_not_recompute(self):
        company = self.env['res.company'].create({
            'name': 'Test Company',
            'country_id' : self.env.ref('base.be').id,
            'account_peppol_proxy_state' : 'receiver',
            'peppol_eas' : '0208',
            'peppol_endpoint' : '0123456789'
        })

        partner = company.partner_id

        self.assertRecordValues(partner, [{
            'peppol_eas' : '0208',
            'peppol_endpoint' : '0123456789'
        }])

        partner.write({
            'vat' : 'BE0476543210'
        })

        self.assertRecordValues(partner, [{
            'peppol_eas': '0208',
            'peppol_endpoint': '0123456789'
        }])

        company.write({
            'account_peppol_proxy_state' : 'not_registered'
        })

        partner.write({
            'vat': 'BE0476543211'
        })

        self.assertRecordValues(partner, [{
            'peppol_eas': '0208',
            'peppol_endpoint': '0476543211'
        }])
