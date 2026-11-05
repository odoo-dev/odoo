from odoo.tests import Form, tagged, TransactionCase
from unittest.mock import patch

@tagged('standard')
class TestPeppolPartner(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super(TestPeppolPartner, cls).setUpClass()
        cls.be_country = cls.env.ref('base.be')

    def test_do_not_recompute_peppol_endpoint(self):
        self.env.company.write({
            'country_id': self.be_country.id,
            'vat': 'BE0477472701'
        })

        with (
            patch(
                'odoo.addons.account_peppol.tools.peppol_iap_connector.PeppolIAPConnector.can_connect',
                return_value={'auth_required': False},
            ),
            patch(
                'odoo.addons.account_peppol.tools.peppol_iap_connector.PeppolIAPConnector.create_connection',
                return_value={
                    'id_client': 'test_id_client',
                    'refresh_token': 'test_refresh_token',
                    'peppol_state': 'smp_registration',
                },
            ),
        ):

            new_company = self.env['peppol.registration'].create({
                    'peppol_eas': '0208',
                    'peppol_endpoint': '0239843188',
                    'contact_email': 'partner@example.com',
                    'phone_number': '+32487654321',
                })

            new_company.button_register_peppol_participant()

        self.env.company.vat = 'BE0123456749'
        self.assertRecordValues(self.env.company.partner_id, [{
            'peppol_eas': '0208',
            'peppol_endpoint': '0239843188',
        }])

        with Form(self.env.company.partner_id) as partner_form:
            partner_form.vat = 'BE0477472701'
        self.assertRecordValues(self.env.company.partner_id, [{
            'peppol_eas': '0208',
            'peppol_endpoint': '0239843188',
        }])
