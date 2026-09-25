from unittest.mock import MagicMock, call, patch

from odoo.tests import tagged

from odoo.addons.l10n_tr_nilvera_einvoice.tests.test_xml_ubl_tr_common import TestUBLTRCommon


def mock_nilvera_request(method, endpoint, *args, **kwargs):
    response = MagicMock(status_code=200)
    if method == 'GET' and 'Check/TaxNumber' in endpoint:
        response.json.return_value = [{'Name': 'urn:mail:generic@example.com'}]
    elif method == 'GET' and 'GetGlobalCustomerInfo' in endpoint:
        aliases = {
            'Invoice': [{'Name': 'urn:mail:invoice@example.com'}],
            'DespatchAdvice': [{'Name': 'urn:mail:dispatch@example.com'}],
        }
        response.json.return_value = {'Aliases': aliases[kwargs['params']['globalUserType']]}
    return response


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestNilveraAliases(TestUBLTRCommon):

    @patch('odoo.addons.l10n_tr_nilvera.lib.nilvera_client.NilveraClient.request', side_effect=mock_nilvera_request)
    def test_sync_edispatch_alias(self, mocked_request):
        with patch.object(self.env.cr, 'commit', autospec=True):
            self.einvoice_partner._check_nilvera_customer()

        self.assertEqual(self.einvoice_partner.l10n_tr_nilvera_customer_alias_id.name, 'urn:mail:invoice@example.com')
        self.assertEqual(self.einvoice_partner.l10n_tr_nilvera_edispatch_alias_id.name, 'urn:mail:dispatch@example.com')
        self.assertNotEqual(
            self.einvoice_partner.l10n_tr_nilvera_customer_alias_id,
            self.einvoice_partner.l10n_tr_nilvera_edispatch_alias_id,
        )
        mocked_request.assert_has_calls([
            call(
                'GET',
                '/general/GlobalCompany/Check/TaxNumber/1729171602',
                handle_response=False,
            ),
            call(
                'GET',
                '/general/GlobalCompany/GetGlobalCustomerInfo/1729171602',
                params={'globalUserType': 'Invoice'},
                handle_response=False,
            ),
            call(
                'GET',
                '/general/GlobalCompany/GetGlobalCustomerInfo/1729171602',
                params={'globalUserType': 'DespatchAdvice'},
                handle_response=False,
            ),
        ])
        self.assertEqual(mocked_request.call_count, 3)
