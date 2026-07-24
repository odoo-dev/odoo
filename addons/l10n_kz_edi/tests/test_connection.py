# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import timedelta
from unittest.mock import MagicMock, patch

import requests
import zeep

from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

SEAM = 'odoo.addons.l10n_kz_edi.models.res_company.ResCompany._l10n_kz_edi_soap_request'


@tagged('post_install', '-at_install', 'l10n_kz_edi')
class TestL10nKzEdiConnection(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env.company
        cls.company.vat = '123456789012'
        # createAuthTicket/createSessionSigned read the signer credentials off the
        # acting user; set them so the signed checks reach the (mocked) seam.
        cls.env.user.l10n_kz_edi_signer_iin = '123456789011'
        cls.env.user.l10n_kz_edi_password = 'TestPass123'

    # --- AC-1 --------------------------------------------------------------
    def test_environment_field(self):
        field = self.env['res.company']._fields['l10n_kz_edi_environment']
        self.assertEqual(field.type, 'selection')
        self.assertEqual({v for v, _ in field.selection}, {'sandbox', 'production'})
        fresh = self.env['res.company'].create({'name': 'KZ Co'})
        self.assertEqual(fresh.l10n_kz_edi_environment, 'sandbox')

    # --- AC-2 --------------------------------------------------------------
    def test_get_base_url(self):
        self.company.l10n_kz_edi_environment = 'sandbox'
        self.assertEqual(
            self.company._l10n_kz_edi_get_base_url(),
            'https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1/',
        )
        self.company.l10n_kz_edi_environment = 'production'
        self.assertEqual(
            self.company._l10n_kz_edi_get_base_url(),
            # Port 8443, matching the soap:address in every SDK WSDL. This is
            # never exercised live (production needs a real cert), so the URL is
            # pinned to the vendor contract rather than to observed behaviour.
            'https://esf.gov.kz:8443/esf-web/ws/api1/',
        )

    def test_get_base_url_never_raises_on_empty(self):
        self.company.l10n_kz_edi_environment = False
        # Should not raise and should fall back to a hardcoded constant.
        self.assertTrue(self.company._l10n_kz_edi_get_base_url())

    # --- AC-3 --------------------------------------------------------------
    def test_settings_related_field(self):
        self.company.l10n_kz_edi_environment = 'sandbox'
        settings = self.env['res.config.settings'].create({})
        self.assertEqual(settings.l10n_kz_edi_environment, 'sandbox')
        settings.l10n_kz_edi_environment = 'production'
        settings.execute()
        self.assertEqual(self.company.l10n_kz_edi_environment, 'production')

    # --- AC-16 -------------------------------------------------------------
    def test_vat_certificate_fields_are_optional_chars(self):
        for name in ('l10n_kz_edi_vat_certificate_series', 'l10n_kz_edi_vat_certificate_num'):
            with self.subTest(field=name):
                field = self.env['res.company']._fields[name]
                self.assertEqual(field.type, 'char')
                self.assertFalse(field.required)

    def test_settings_related_vat_certificate_fields(self):
        settings = self.env['res.config.settings'].create({})
        settings.l10n_kz_edi_vat_certificate_series = '13788'
        settings.l10n_kz_edi_vat_certificate_num = '1399478'
        settings.execute()
        self.assertEqual(self.company.l10n_kz_edi_vat_certificate_series, '13788')
        self.assertEqual(self.company.l10n_kz_edi_vat_certificate_num, '1399478')

    # --- AC-4 (the seam itself) --------------------------------------------
    def _mocked_zeep_client(self, response):
        """Return a fake zeep client whose bound service answers ``response``."""
        service_proxy = MagicMock()
        service_proxy._binding_options = {}
        service_proxy.getVersion = MagicMock(return_value=response)
        client = MagicMock()
        client.bind = MagicMock(return_value=service_proxy)
        return client, service_proxy

    def test_soap_request_builds_client_through_factory(self):
        client, service_proxy = self._mocked_zeep_client({'version': '1.0'})
        self.company.l10n_kz_edi_environment = 'sandbox'
        with patch.object(type(self.company), '_get_zeep_client__', return_value=client) as factory:
            response = self.company._l10n_kz_edi_soap_request('VersionService', 'getVersion', {})
        self.assertEqual(response, {'version': '1.0'})
        factory.assert_called_once()
        # The live ?wsdl URL of the selected environment is driven (fetched+cached
        # by the inherited ZeepOrmCache factory), with a dedicated requests session.
        wsdl_url = factory.call_args.args[0]
        self.assertEqual(
            wsdl_url,
            'https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1/VersionService?wsdl',
        )
        self.assertIsInstance(factory.call_args.kwargs['session'], requests.Session)
        # The endpoint is derived from the environment, not from the WSDL.
        client.bind.assert_called_once_with('VersionService', 'VersionServicePort')
        self.assertEqual(
            service_proxy._binding_options['address'],
            'https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1/VersionService',
        )
        service_proxy.getVersion.assert_called_once_with()

    def test_soap_fault_carrying_a_kgd_code_is_translated(self):
        """A KGD code is shown as its readable message *and* the raw code."""
        client, service_proxy = self._mocked_zeep_client(None)
        service_proxy.getVersion.side_effect = zeep.exceptions.Fault('OCSP_NOT_AVAILABLE')
        with patch.object(type(self.company), '_get_zeep_client__', return_value=client):
            with self.assertRaises(UserError) as caught:
                self.company._l10n_kz_edi_soap_request('VersionService', 'getVersion', {})
        message = str(caught.exception)
        readable = self.company._l10n_kz_edi_get_error_code_messages()['OCSP_NOT_AVAILABLE']
        self.assertIn(readable, message)
        self.assertIn('OCSP_NOT_AVAILABLE', message)

    def test_soap_fault_with_free_text_is_passed_through(self):
        """Not every fault is a code; free text must not be dressed up as one."""
        client, service_proxy = self._mocked_zeep_client(None)
        message = 'A security error was encountered when verifying the message'
        service_proxy.getVersion.side_effect = zeep.exceptions.Fault(message)
        with patch.object(type(self.company), '_get_zeep_client__', return_value=client):
            with self.assertRaises(UserError) as caught:
                self.company._l10n_kz_edi_soap_request('VersionService', 'getVersion', {})
        self.assertIn(message, str(caught.exception))

    def test_soap_request_wraps_transport_error(self):
        with patch.object(
            type(self.company), '_get_zeep_client__',
            side_effect=requests.exceptions.ConnectionError('boom'),
        ):
            with self.assertRaises(UserError):
                self.company._l10n_kz_edi_soap_request('VersionService', 'getVersion', {})

    # --- AC-4 / AC-5 -------------------------------------------------------
    def test_check_reachability_uses_version_service_only(self):
        with patch(SEAM, return_value={'version': '1.0'}) as mocked:
            result = self.company._l10n_kz_edi_check_reachability()
        self.assertTrue(result)
        mocked.assert_called_once()
        service, operation, payload = mocked.call_args.args
        self.assertEqual(service, 'VersionService')
        self.assertIn(operation, ('getVersion', 'getApiVersion'))
        # No session opened and no signature/certificate passed.
        self.assertNotIn('sessionId', payload)
        self.assertFalse(any('cert' in str(k).lower() for k in payload))

    # --- AC-4 / AC-6 -------------------------------------------------------
    def test_create_session_calls_seam(self):
        self.env.user.l10n_kz_edi_last_session_date = False
        with patch(SEAM, return_value={'sessionId': 'abc'}) as mocked:
            result = self.company._l10n_kz_edi_create_session_signed('<signed/>')
        self.assertIsInstance(result, dict)
        service, operation, payload = mocked.call_args.args
        self.assertEqual(service, 'SessionService')
        self.assertEqual(operation, 'createSessionSigned')
        # The signed ticket travels in signedAuthTicket, not x509Certificate.
        self.assertEqual(payload['signedAuthTicket'], '<signed/>')
        self.assertEqual(payload['tin'], self.company.vat)
        self.assertNotIn('x509Certificate', payload)
        self.assertTrue(self.env.user.l10n_kz_edi_last_session_date)

    def test_create_session_sends_wsse_username_token(self):
        """createSessionSigned must carry a WS-Security UsernameToken (signer IIN
        + ESF password), which the ESF validates alongside the signed ticket."""
        self.env.user.l10n_kz_edi_last_session_date = False
        with patch(SEAM, return_value={'sessionId': 'abc'}) as mocked:
            self.company._l10n_kz_edi_create_session_signed('<signed/>')
        token = mocked.call_args.kwargs['wsse']
        self.assertEqual(token.username, '123456789011')
        self.assertEqual(token.password, 'TestPass123')

    def test_create_session_requires_a_signer_iin(self):
        self.env.user.l10n_kz_edi_last_session_date = False
        self.env.user.l10n_kz_edi_signer_iin = False
        with patch(SEAM) as mocked:
            with self.assertRaises(UserError):
                self.company._l10n_kz_edi_create_session_signed('<signed/>')
        mocked.assert_not_called()

    def test_create_session_throttle_blocks_before_seam(self):
        self.env.user.l10n_kz_edi_last_session_date = fields.Datetime.now() - timedelta(minutes=2)
        with patch(SEAM) as mocked:
            with self.assertRaises(UserError):
                self.company._l10n_kz_edi_create_session_signed('<signed/>')
        mocked.assert_not_called()

    def test_create_session_allowed_after_throttle(self):
        self.env.user.l10n_kz_edi_last_session_date = fields.Datetime.now() - timedelta(minutes=6)
        with patch(SEAM, return_value={'sessionId': 'abc'}) as mocked:
            self.company._l10n_kz_edi_create_session_signed('<signed/>')
        mocked.assert_called_once()

    # --- AC-4 / AC-9 -------------------------------------------------------
    def test_enterprise_validation_calls_seam(self):
        sentinel = {'resultList': ['ok']}
        with patch(SEAM, return_value=sentinel) as mocked:
            result = self.company._l10n_kz_edi_enterprise_validation('sess-1')
        self.assertEqual(result, sentinel)
        service, operation, payload = mocked.call_args.args
        # enterpriseValidation lives on InvoiceService and needs an open session.
        self.assertEqual(service, 'InvoiceService')
        self.assertEqual(operation, 'enterpriseValidation')
        self.assertEqual(payload['sessionId'], 'sess-1')
        self.assertIn(self.company.vat, str(payload))

    def test_enterprise_validation_sends_the_mandatory_certificate_elements(self):
        """``EnterpriseKey`` declares certificateSeries/certificateNum without
        ``minOccurs="0"``: both elements must be present or the envelope is
        schema-invalid and KGD cannot even answer a result type."""
        self.company.l10n_kz_edi_vat_certificate_series = False
        self.company.l10n_kz_edi_vat_certificate_num = False
        with patch(SEAM, return_value={}) as mocked:
            self.company._l10n_kz_edi_enterprise_validation('sess-1')
        _service, _operation, payload = mocked.call_args.args
        enterprise_key = payload['enterpriseKeyList']['enterpriseKey'][0]
        self.assertEqual(
            sorted(enterprise_key),
            ['certificateNum', 'certificateSeries', 'tin'],
        )
        self.assertEqual(enterprise_key['tin'], self.company.vat)
        # Unset fields degrade to empty strings, not missing keys.
        self.assertEqual(enterprise_key['certificateSeries'], '')
        self.assertEqual(enterprise_key['certificateNum'], '')

    def test_enterprise_validation_carries_the_configured_certificate(self):
        """The configured VAT certificate reaches the payload, not a placeholder."""
        self.company.l10n_kz_edi_vat_certificate_series = '13788'
        self.company.l10n_kz_edi_vat_certificate_num = '1399478'
        with patch(SEAM, return_value={}) as mocked:
            self.company._l10n_kz_edi_enterprise_validation('sess-1')
        enterprise_key = mocked.call_args.args[2]['enterpriseKeyList']['enterpriseKey'][0]
        self.assertEqual(enterprise_key['certificateSeries'], '13788')
        self.assertEqual(enterprise_key['certificateNum'], '1399478')

    def test_read_validation_result_success(self):
        digest = self.company._l10n_kz_edi_read_validation_result(
            {'resultList': {'enterpriseValidationResult': [
                {'tin': '123456789012', 'resultType': 'SUCCESS'},
            ]}},
        )
        self.assertTrue(digest['success'])
        self.assertEqual(digest['result_type'], 'SUCCESS')
        self.assertTrue(digest['message'])

    def test_read_validation_result_soft_negative_is_not_a_success(self):
        """A soft negative comes back as a *normal* response; it must not be green."""
        for result_type in ('TIN_ABSENT', 'CERTIFICATE_SERIES_OR_CERTIFICATE_NUM_ABSENT',
                            'BIK_ABSENT', 'BANK_NOT_FOUND', 'IIK_ABSENT', 'WAT_IS_THIS'):
            with self.subTest(result_type=result_type):
                digest = self.company._l10n_kz_edi_read_validation_result(
                    {'resultList': {'enterpriseValidationResult': [
                        {'tin': '123456789012', 'resultType': result_type},
                    ]}},
                )
                self.assertFalse(digest['success'])
                self.assertEqual(digest['result_type'], result_type)
                self.assertTrue(digest['message'])
                self.assertNotEqual(digest['message'], result_type)
                # The raw code is shown alongside its readable message.
                self.assertIn(result_type, digest['message'])

    def test_read_validation_result_empty_answer_is_not_a_success(self):
        self.assertFalse(self.company._l10n_kz_edi_read_validation_result({})['success'])

    def test_enterprise_validation_custom_tin(self):
        with patch(SEAM, return_value={}) as mocked:
            self.company._l10n_kz_edi_enterprise_validation('sess-1', tin='987654321098')
        _service, _operation, payload = mocked.call_args.args
        self.assertIn('987654321098', str(payload))

    # --- AC-4 / AC-15 ------------------------------------------------------
    def test_get_session_user_info(self):
        responses = {
            'currentUser': {'user': {
                'login': '990101300123',
                'taxpayer': {'tin': '123456789012', 'nameRu': 'Acme LLP'},
            }},
            'currentUserProfiles': {'profileInfoList': {'profileInfo': [
                {'tin': '123456789012', 'businessProfileType': 'ADMIN_ENTERPRISE'},
            ]}},
        }
        with patch(SEAM, side_effect=lambda service, operation, payload: responses[operation]) as mocked:
            info = self.company._l10n_kz_edi_get_session_user_info('sess-1')
        self.assertEqual(mocked.call_count, 2)
        services = [call.args[0] for call in mocked.call_args_list]
        operations = [call.args[1] for call in mocked.call_args_list]
        self.assertEqual(services, ['SessionService', 'SessionService'])
        self.assertEqual(sorted(operations), ['currentUser', 'currentUserProfiles'])
        for call in mocked.call_args_list:
            self.assertEqual(call.args[2]['sessionId'], 'sess-1')
        self.assertEqual(info['name'], 'Acme LLP')
        self.assertEqual(info['tin'], '123456789012')
        self.assertEqual(info['profile'], 'ADMIN_ENTERPRISE')

    def test_close_session_calls_seam(self):
        with patch(SEAM, return_value={'status': 'CLOSED'}) as mocked:
            result = self.company._l10n_kz_edi_close_session('sess-1')
        self.assertIsInstance(result, dict)
        service, operation, payload = mocked.call_args.args
        self.assertEqual(service, 'SessionService')
        self.assertEqual(operation, 'closeSession')
        self.assertEqual(payload['sessionId'], 'sess-1')

    # --- AC-14 -------------------------------------------------------------
    def _signed_checks_responses(self):
        return {
            'createSessionSigned': {'sessionId': 'sess-1'},
            'currentUser': {'user': {
                'login': '990101300123',
                'taxpayer': {'tin': '123456789012', 'nameRu': 'Acme LLP'},
            }},
            'currentUserProfiles': {'profileInfoList': {'profileInfo': [
                {'tin': '123456789012', 'businessProfileType': 'ADMIN_ENTERPRISE'},
            ]}},
            'enterpriseValidation': {'resultList': {'enterpriseValidationResult': [
                {'tin': '123456789012', 'resultType': 'SUCCESS'},
            ]}},
            'closeSession': {'status': 'CLOSED'},
        }

    def test_run_signed_checks_full_lifecycle(self):
        self.env.user.l10n_kz_edi_last_session_date = False
        responses = self._signed_checks_responses()
        with patch(SEAM, side_effect=lambda service, operation, payload, wsse=None: responses[operation]) as mocked:
            result = self.company._l10n_kz_edi_run_signed_checks('<signed/>')
        operations = [call.args[1] for call in mocked.call_args_list]
        # The session is opened first, used, and only then closed.
        self.assertEqual(operations[0], 'createSessionSigned')
        self.assertEqual(operations[-1], 'closeSession')
        self.assertLess(operations.index('enterpriseValidation'), operations.index('closeSession'))
        self.assertEqual(result['profile'], 'ADMIN_ENTERPRISE')
        self.assertEqual(result['enterprise_validation'], responses['enterpriseValidation'])
        self.assertIn('ADMIN_ENTERPRISE', result['summary'])
        self.assertIn('Acme LLP', result['summary'])

    def test_run_signed_checks_closes_session_on_failure(self):
        self.env.user.l10n_kz_edi_last_session_date = False
        responses = self._signed_checks_responses()

        def _seam(service, operation, payload, wsse=None):
            if operation == 'enterpriseValidation':
                raise UserError('boom')
            return responses[operation]

        with patch(SEAM, side_effect=_seam) as mocked:
            with self.assertRaises(UserError):
                self.company._l10n_kz_edi_run_signed_checks('<signed/>')
        operations = [call.args[1] for call in mocked.call_args_list]
        # The finally block still closes the session.
        self.assertEqual(operations[-1], 'closeSession')

    def test_run_signed_checks_carries_the_validation_verdict(self):
        self.env.user.l10n_kz_edi_last_session_date = False
        responses = self._signed_checks_responses()
        responses['enterpriseValidation'] = {'resultList': {'enterpriseValidationResult': [
            {'tin': '123456789012', 'resultType': 'TIN_ABSENT'},
        ]}}
        with patch(SEAM, side_effect=lambda service, operation, payload, wsse=None: responses[operation]):
            result = self.company._l10n_kz_edi_run_signed_checks('<signed/>')
        # A soft negative still completes the lifecycle, but is not a success.
        self.assertFalse(result['enterprise_validation_result']['success'])
        self.assertEqual(result['enterprise_validation_result']['result_type'], 'TIN_ABSENT')

    def test_run_signed_checks_close_failure_never_masks_the_real_cause(self):
        """Any exception from ``closeSession`` -- not only a ``UserError`` --
        must be swallowed so the original failure still surfaces."""
        self.env.user.l10n_kz_edi_last_session_date = False

        def _seam(service, operation, payload, wsse=None):
            if operation == 'createSessionSigned':
                return {'sessionId': 'sess-1'}
            if operation == 'closeSession':
                raise ValueError('close blew up')
            raise UserError('the real cause')

        with patch(SEAM, side_effect=_seam) as mocked:
            with self.assertRaisesRegex(UserError, 'the real cause'):
                self.company._l10n_kz_edi_run_signed_checks('<signed/>')
        self.assertEqual(mocked.call_args_list[-1].args[1], 'closeSession')

    # --- AC-8 --------------------------------------------------------------
    def test_create_auth_ticket_is_fetched_from_auth_service(self):
        """The ticket to sign is *issued by the server* (AuthService), not built
        locally: it carries a per-login nonce, so it cannot be fabricated."""
        ticket_xml = (
            '<authSign><timeMark>1</timeMark><state>NONCE=</state>'
            '<iin>123456789011</iin><ttlInMinutes>30</ttlInMinutes></authSign>'
        )
        with patch(SEAM, return_value={'authTicketXml': ticket_xml}) as mocked:
            ticket = self.company._l10n_kz_edi_create_auth_ticket()
        service, operation, payload = mocked.call_args.args
        self.assertEqual(service, 'AuthService')
        self.assertEqual(operation, 'createAuthTicket')
        # The signer IIN (not the company BIN) is what createAuthTicket takes.
        self.assertEqual(payload['iin'], '123456789011')
        self.assertEqual(ticket, ticket_xml)
        # Still unsigned: NCALayer adds the signature browser-side.
        self.assertNotIn('Signature', ticket)

    def test_create_auth_ticket_requires_a_signer_iin(self):
        self.env.user.l10n_kz_edi_signer_iin = False
        with patch(SEAM) as mocked:
            with self.assertRaises(UserError):
                self.company._l10n_kz_edi_create_auth_ticket()
        mocked.assert_not_called()

    # --- AC-7 --------------------------------------------------------------
    def test_every_session_security_code_is_mapped(self):
        """Check 2 fails through ``SessionSecurityDataValidator``.

        Every code in that SDK block is a documented, reachable outcome of
        ``createSessionSigned``, so leaving one unmapped shows the user
        "an unexpected error" for an ordinary situation such as a wrong
        password or an NCA outage.
        """
        messages = self.company._l10n_kz_edi_get_error_code_messages()
        for code in [
            'PROVIDER_NOT_VALID', 'CERTIFICATE_NOT_VALID', 'CERTIFICATE_IS_NOT_FOR_AUTH',
            'CERTIFICATE_REVOKED', 'OCSP_NOT_AVAILABLE', 'IIN_NOT_VALID', 'USER_BLOCKED',
            'USER_NOT_REGISTERED', 'ENTERPRISE_NOT_FOUND_FOR_USER', 'PROXY_NOT_YET',
            'PERMISSIONS_EXPIRED', 'CERTIFICATE_EXPIRED', 'CERTIFICATE_NOT_YET_VALID',
            'CERTIFICATE_POLICY_NOT_VALID', 'CERTIFICATE_SIGNATURE_NOT_VALID',
            'PASSWORD_INVALID', 'SYSTEM_DOWN',
        ]:
            with self.subTest(code=code):
                self.assertIn(code, messages)

    def test_error_code_messages_are_unique_and_nonempty(self):
        messages = self.company._l10n_kz_edi_get_error_code_messages()
        for code, message in messages.items():
            with self.subTest(code=code):
                self.assertTrue(message)
                self.assertNotEqual(message, code)
        self.assertEqual(len(set(messages.values())), len(messages))

    # --- AC-10 -------------------------------------------------------------
    def test_format_connection_summary(self):
        self.company.l10n_kz_edi_environment = 'sandbox'
        summary = self.company._l10n_kz_edi_format_connection_summary(
            'Acme LLP', '123456789012', 'ADMIN_ENTERPRISE',
        )
        self.assertIn('Acme LLP', summary)
        self.assertIn('123456789012', summary)
        self.assertIn('ADMIN_ENTERPRISE', summary)
        self.assertIn('Sandbox', summary)

    # --- AC-11 -------------------------------------------------------------
    def test_action_test_connection(self):
        self.company.l10n_kz_edi_environment = 'production'
        settings = self.env['res.config.settings'].create({})
        action = settings.action_l10n_kz_edi_test_connection()
        self.assertEqual(action['type'], 'ir.actions.client')
        self.assertEqual(action['tag'], 'l10n_kz_edi_test_connection')
        self.assertEqual(action['params']['environment'], 'production')
        self.assertEqual(action['params']['company_id'], self.company.id)
