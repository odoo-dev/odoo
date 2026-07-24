# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
from datetime import timedelta

import requests

from odoo import fields, models
from odoo.exceptions import AccessError, UserError
from odoo.tools import zeep
from odoo.tools.zeep.wsse import UsernameToken

_logger = logging.getLogger(__name__)

# Port 8443, per the soap:address in every SDK WSDL (443 serves the web portal).
L10N_KZ_EDI_URLS = {
    'sandbox': 'https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1/',
    'production': 'https://esf.gov.kz:8443/esf-web/ws/api1/',
}

L10N_KZ_EDI_SESSION_THROTTLE = timedelta(minutes=5)


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_kz_edi_environment = fields.Selection(
        selection=[
            ('sandbox', "Sandbox"),
            ('production', "Production"),
        ],
        string="KZ ESF Environment",
        default='sandbox',
        help="Environment used to connect to the Kazakhstan Electronic Invoices System (ЭСФ).",
    )
    l10n_kz_edi_vat_certificate_series = fields.Char(
        string="KZ VAT Certificate Series",
        help="Series of the VAT payer certificate (серия свидетельства плательщика НДС), "
             "sent in the mandatory enterprise key of every enterprise validation.",
    )
    l10n_kz_edi_vat_certificate_num = fields.Char(
        string="KZ VAT Certificate Number",
        help="Number of the VAT payer certificate (номер свидетельства плательщика НДС), "
             "sent in the mandatory enterprise key of every enterprise validation.",
    )

    def _l10n_kz_edi_check_user_access(self):
        """Raise unless the current user may run the ESF connection test."""
        if not (
            self.env.user.has_group('account.group_account_manager')
            or self.env.user.has_group('base.group_system')
        ):
            raise AccessError(self.env._(
                "Only an Accounting Administrator can test the ESF connection.",
            ))

    def _l10n_kz_edi_get_base_url(self):
        """Return the ESF SOAP base URL for the selected environment."""
        self.ensure_one()
        return L10N_KZ_EDI_URLS.get(self.l10n_kz_edi_environment, L10N_KZ_EDI_URLS['sandbox'])

    def _l10n_kz_edi_read_response(self, response, key):
        """Read ``key`` off a SOAP ``response`` (dict or zeep object).

        A bare string is a single-element response already unwrapped by zeep
        (e.g. ``version``, ``sessionId``); it is its own value, so return it.
        """
        if isinstance(response, str):
            return response
        if isinstance(response, dict):
            return response.get(key)
        return getattr(response, key, None)

    def _l10n_kz_edi_get_signer_iin(self):
        """Return the current user's ESF signer IIN, or raise if unconfigured."""
        self.ensure_one()
        iin = self.env.user.l10n_kz_edi_signer_iin
        if not iin:
            raise UserError(self.env._(
                "Set your ESF Signer IIN in your user preferences before testing the connection.",
            ))
        return iin

    def _l10n_kz_edi_get_error_code_messages(self):
        """Return the human-readable message of every mapped KGD error code."""
        return {
            'CERTIFICATE_EXPIRED': self.env._("The certificate has expired."),
            'CERTIFICATE_NOT_YET_VALID': self.env._("The certificate is not valid yet."),
            'CERTIFICATE_REVOKED': self.env._("The certificate has been revoked."),
            'CERTIFICATE_NOT_VALID': self.env._("The certificate is not valid."),
            'CERTIFICATE_IS_NOT_FOR_ENTERPRISE': self.env._("This certificate cannot be used for an enterprise; a legal-entity certificate is required."),
            'CERTIFICATE_IS_NOT_FOR_AUTH': self.env._("This certificate cannot be used for authentication."),
            'CERTIFICATE_IS_NOT_FOR_SIGNING': self.env._("This certificate cannot be used for signing."),
            'SIGNATURE_VERIFICATION_FAILED': self.env._("The signature could not be verified."),
            'SIGNATURE_INVALID_FORMAT': self.env._("The signature format is invalid."),
            'ORIGINAL_DOCUMENT_SIGNATURE_VERIFICATION_FAILED': self.env._("The signature of the original document could not be verified."),
            'CERTIFICATE_SERIES_OR_CERTIFICATE_NUM_ABSENT': self.env._("The certificate series or number is missing."),
            # SessionSecurityDataValidator codes: the ways createSessionSigned fails.
            'CERTIFICATE_POLICY_NOT_VALID': self.env._("The certificate has a usage policy that the ESF does not accept."),
            'CERTIFICATE_SIGNATURE_NOT_VALID': self.env._("The signature of the certificate itself is not valid."),
            'OCSP_NOT_AVAILABLE': self.env._(
                "The ESF server could not reach the National Certification Authority (NCA/НУЦ) to check "
                "whether the certificate is revoked, so it could not accept the certificate. This is an "
                "outage between the ESF and the NCA rather than a problem with your certificate.",
            ),
            'PROVIDER_NOT_VALID': self.env._("The ESF server found no certificate-validation provider."),
            'IIN_NOT_VALID': self.env._("The signer IIN set in your user preferences does not match the certificate used to sign."),
            'PASSWORD_INVALID': self.env._("The ESF password is incorrect."),
            'USER_BLOCKED': self.env._("Your ESF account is blocked. Contact the ESF administrator."),
            'USER_NOT_REGISTERED': self.env._("This user is not registered in the ESF."),
            'ENTERPRISE_NOT_FOUND_FOR_USER': self.env._("No ESF profile was found for this user."),
            'PROXY_NOT_YET': self.env._("No power of attorney has been issued for this user."),
            'PERMISSIONS_EXPIRED': self.env._("The permissions assigned to this user have expired."),
            'SYSTEM_DOWN': self.env._("The ESF reported an internal system error."),
        }

    def _l10n_kz_edi_map_validation_result_type(self, result_type):
        """Return a human-readable message for an ``EnterpriseValidationResultType``."""
        messages = {
            'TIN_ABSENT': self.env._("The BIN/IIN is unknown to the ESF taxpayer registry."),
            'CERTIFICATE_SERIES_OR_CERTIFICATE_NUM_ABSENT': self.env._(
                "The VAT certificate series or number is missing from the ESF registry.",
            ),
            'BIK_ABSENT': self.env._("The bank identification code (BIK) is missing from the ESF registry."),
            'BANK_NOT_FOUND': self.env._("The bank is unknown to the ESF registry."),
            'IIK_ABSENT': self.env._("The bank account (IIK) is missing from the ESF registry."),
        }
        if result_type in messages:
            return self.env._(
                "[%(code)s] %(message)s", message=messages[result_type], code=result_type,
            )
        return self.env._(
            "The enterprise validation did not succeed (result: %s).",
            result_type or self.env._("unknown"),
        )

    def _l10n_kz_edi_format_connection_summary(self, company_name, company_bin, profile):
        """Return a human-readable summary of a successful connection test."""
        self.ensure_one()
        labels = dict(self._fields['l10n_kz_edi_environment']._description_selection(self.env))
        environment_label = labels.get(self.l10n_kz_edi_environment, self.l10n_kz_edi_environment)
        return self.env._(
            "Connected as %(company)s (BIN %(bin)s) with profile %(profile)s on the %(environment)s environment.",
            company=company_name,
            bin=company_bin,
            profile=profile,
            environment=environment_label,
        )

    def _l10n_kz_edi_describe_fault(self, fault):
        """Return the user-facing message for a SOAP ``fault``.

        KGD returns a bare error code as the fault string; map it here, as the
        code is not preserved through Odoo's serialized exception. Unknown codes
        are free text and passed through as-is.
        """
        code = (getattr(fault, 'message', None) or str(fault) or '').strip()
        messages = self._l10n_kz_edi_get_error_code_messages()
        if code in messages:
            return self.env._("[%(code)s] %(message)s", message=messages[code], code=code)
        return self.env._("The ESF service returned an error:\n%s", fault)

    def _l10n_kz_edi_soap_request(self, service, operation, payload, wsse=None):
        """Call ``operation`` on the ESF ``service``; the single SOAP seam.

        The cached WSDL is fetched from the live endpoint, whose ``soap:address``
        is rebound to the selected environment. ``wsse`` carries the WS-Security
        ``UsernameToken`` that ``createSessionSigned`` needs.
        """
        self.ensure_one()
        url = self._l10n_kz_edi_get_base_url() + service
        session = requests.Session()
        try:
            client = self._get_zeep_client__(url + '?wsdl', session=session, wsse=wsse)
            service_proxy = client.bind(service, '%sPort' % service)
            service_proxy._binding_options['address'] = url
            return getattr(service_proxy, operation)(**(payload or {}))
        except zeep.exceptions.Fault as fault:
            raise UserError(self._l10n_kz_edi_describe_fault(fault)) from fault
        except (zeep.exceptions.Error, requests.exceptions.ConnectionError) as error:
            raise UserError(self.env._("Could not reach the ESF service:\n%s", error)) from error

    def _l10n_kz_edi_check_reachability(self):
        """Check 1: query ``VersionService`` to confirm the ESF answers.

        Opens no session and sends no signature. Returns a truthy dict.
        """
        self.ensure_one()
        response = self._l10n_kz_edi_soap_request('VersionService', 'getVersion', {})
        return {
            'reachable': True,
            'version': self._l10n_kz_edi_read_response(response, 'version'),
        }

    def l10n_kz_edi_check_reachability(self):
        self.ensure_one()
        self._l10n_kz_edi_check_user_access()
        return self._l10n_kz_edi_check_reachability()

    def _l10n_kz_edi_create_auth_ticket(self):
        """Check 2 (step 1): fetch the single-use ``authTicketXml`` to sign.

        Signed browser-side by NCALayer; a fresh ticket is needed per attempt.
        """
        self.ensure_one()
        response = self._l10n_kz_edi_soap_request('AuthService', 'createAuthTicket', {
            'iin': self._l10n_kz_edi_get_signer_iin(),
        })
        return self._l10n_kz_edi_read_response(response, 'authTicketXml')

    def l10n_kz_edi_create_auth_ticket(self):
        self.ensure_one()
        self._l10n_kz_edi_check_user_access()
        return self._l10n_kz_edi_create_auth_ticket()

    def _l10n_kz_edi_create_session_signed(self, signed_ticket):
        """Check 2 (step 2): open a session with the NCALayer-signed ticket.

        Requires a WS-Security ``UsernameToken`` header (signer IIN + ESF
        password) or the ESF rejects the message. Throttled per user.
        """
        self.ensure_one()
        user = self.env.user
        last_session = user.l10n_kz_edi_last_session_date
        if last_session and last_session > fields.Datetime.now() - L10N_KZ_EDI_SESSION_THROTTLE:
            raise UserError(self.env._(
                "A session was already opened less than 5 minutes ago. "
                "Please wait a moment before testing the connection again.",
            ))
        response = self._l10n_kz_edi_soap_request(
            'SessionService', 'createSessionSigned',
            {
                'tin': self.vat,
                'signedAuthTicket': signed_ticket,
            },
            wsse=UsernameToken(
                self._l10n_kz_edi_get_signer_iin(),
                user.l10n_kz_edi_password or '',
            ),
        )
        user.sudo().l10n_kz_edi_last_session_date = fields.Datetime.now()
        return {
            'session_id': self._l10n_kz_edi_read_response(response, 'sessionId'),
        }

    def _l10n_kz_edi_get_session_user_info(self, session_id):
        """Check 2 (step 3): read the identity behind the open ``session_id``.

        Flattens ``currentUser`` and ``currentUserProfiles`` into one dict.
        """
        self.ensure_one()
        user_response = self._l10n_kz_edi_soap_request('SessionService', 'currentUser', {
            'sessionId': session_id,
        })
        profiles_response = self._l10n_kz_edi_soap_request('SessionService', 'currentUserProfiles', {
            'sessionId': session_id,
        })

        user = self._l10n_kz_edi_read_response(user_response, 'user')
        taxpayer = self._l10n_kz_edi_read_response(user, 'taxpayer') if user else None
        profile_list = self._l10n_kz_edi_read_response(profiles_response, 'profileInfoList')
        profiles = self._l10n_kz_edi_read_response(profile_list, 'profileInfo') if profile_list else None
        # Pick the profile matching the company BIN, else the first one.
        tin = self._l10n_kz_edi_read_response(taxpayer, 'tin') if taxpayer else None
        profile = None
        for candidate in profiles or []:
            profile = self._l10n_kz_edi_read_response(candidate, 'businessProfileType')
            if self._l10n_kz_edi_read_response(candidate, 'tin') == (tin or self.vat):
                break

        return {
            'login': self._l10n_kz_edi_read_response(user, 'login') if user else None,
            'name': self._l10n_kz_edi_read_response(taxpayer, 'nameRu') if taxpayer else None,
            'tin': tin,
            'profile': profile,
        }

    def _l10n_kz_edi_close_session(self, session_id):
        """Close the ESF session identified by ``session_id``."""
        self.ensure_one()
        response = self._l10n_kz_edi_soap_request('SessionService', 'closeSession', {
            'sessionId': session_id,
        })
        return {
            'status': self._l10n_kz_edi_read_response(response, 'status'),
        }

    def _l10n_kz_edi_enterprise_validation(self, session_id, tin=None):
        """Check 3: validate ``tin`` (default ``company.vat``) over an open session.

        ``certificateSeries``/``certificateNum`` lack ``minOccurs="0"``, so both
        are always sent (empty when unset) to keep the envelope schema-valid.
        """
        self.ensure_one()
        return self._l10n_kz_edi_soap_request('InvoiceService', 'enterpriseValidation', {
            'sessionId': session_id,
            'enterpriseKeyList': {
                'enterpriseKey': [{
                    'certificateSeries': self.l10n_kz_edi_vat_certificate_series or '',
                    'certificateNum': self.l10n_kz_edi_vat_certificate_num or '',
                    'tin': tin or self.vat,
                }],
            },
        })

    def _l10n_kz_edi_read_validation_result(self, validation):
        """Digest an ``enterpriseValidation`` answer into a JSON-safe verdict.

        A soft negative comes back as a normal response with a non-``SUCCESS``
        ``resultType``, so the result type is read back to colour Check 3.
        """
        self.ensure_one()
        result_list = self._l10n_kz_edi_read_response(validation, 'resultList')
        results = self._l10n_kz_edi_read_response(result_list, 'enterpriseValidationResult') or []
        result_type = None
        for result in results:
            result_type = str(self._l10n_kz_edi_read_response(result, 'resultType') or '')
            if result_type != 'SUCCESS':
                break
        success = result_type == 'SUCCESS'
        return {
            'result_type': result_type,
            'success': success,
            'message': (
                self.env._("Check 3: the enterprise is valid on the ESF.")
                if success
                else self._l10n_kz_edi_map_validation_result_type(result_type)
            ),
        }

    def _l10n_kz_edi_run_signed_checks(self, signed_ticket):
        """Run the authenticated part of the test over one session (Checks 2-3).

        Opens a session, reads the identity, validates the enterprise, and
        always closes the session again -- even on failure -- so no session is
        leaked against the ESF one-session-per-five-minutes limit.
        """
        self.ensure_one()
        session_id = self._l10n_kz_edi_create_session_signed(signed_ticket)['session_id']
        try:
            user_info = self._l10n_kz_edi_get_session_user_info(session_id)
            validation = self._l10n_kz_edi_enterprise_validation(session_id)
        finally:
            try:
                self._l10n_kz_edi_close_session(session_id)
            except Exception:  # noqa: BLE001
                # Never let a close failure mask the original error.
                _logger.warning("Could not close the ESF session %s.", session_id, exc_info=True)

        return {
            'session_id': session_id,
            'login': user_info['login'],
            'name': user_info['name'],
            'tin': user_info['tin'],
            'profile': user_info['profile'],
            'enterprise_validation': validation,
            'enterprise_validation_result': self._l10n_kz_edi_read_validation_result(validation),
            'summary': self._l10n_kz_edi_format_connection_summary(
                user_info['name'] or self.name,
                user_info['tin'] or self.vat,
                user_info['profile'],
            ),
        }

    def l10n_kz_edi_run_signed_checks(self, signed_ticket):
        """Return the JSON-serializable subset of the checks for the browser.

        Drops ``session_id``, ``login`` and the raw zeep ``enterprise_validation``
        (kept only as its digest ``enterprise_validation_result``).
        """
        self.ensure_one()
        self._l10n_kz_edi_check_user_access()
        result = self._l10n_kz_edi_run_signed_checks(signed_ticket)
        return {
            'name': result['name'],
            'tin': result['tin'],
            'profile': result['profile'],
            'summary': result['summary'],
            'enterprise_validation_result': result['enterprise_validation_result'],
        }
