# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""Regression tests for the RPC surface used by the OWL client action.

The connection test is driven browser-side, so every method the OWL component
calls must survive ``call_kw``: Odoo refuses to expose any method whose name
starts with an underscore. Calling the frozen private methods in-process is
therefore *not* enough to prove the feature works -- these tests cross the RPC
boundary on purpose.
"""
import inspect
import json
from unittest.mock import patch

from odoo.exceptions import AccessError
from odoo.service.model import get_public_method
from odoo.tests import tagged
from odoo.tests.common import HttpCase, TransactionCase

SEAM = 'odoo.addons.l10n_kz_edi.models.res_company.ResCompany._l10n_kz_edi_soap_request'

# The exact method names the OWL client action passes to ``orm.call``.
RPC_METHODS = [
    'l10n_kz_edi_check_reachability',
    'l10n_kz_edi_create_auth_ticket',
    'l10n_kz_edi_run_signed_checks',
]


@tagged('post_install', '-at_install', 'l10n_kz_edi')
class TestL10nKzEdiRpcSurface(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env.company
        cls.company.vat = '123456789012'
        cls.env.user.l10n_kz_edi_signer_iin = '123456789011'
        cls.env.user.l10n_kz_edi_password = 'TestPass123'

    def test_owl_methods_are_remotely_callable(self):
        """Every method the OWL component calls must pass ``get_public_method``."""
        company = self.env['res.company']
        for name in RPC_METHODS:
            with self.subTest(method=name):
                self.assertTrue(callable(get_public_method(company, name)))

    def test_wrappers_delegate_to_private_methods(self):
        with patch(SEAM, return_value={'version': '1.0'}) as mocked:
            self.assertTrue(self.company.l10n_kz_edi_check_reachability())
        self.assertEqual(mocked.call_args.args[0], 'VersionService')

        with patch(SEAM, return_value={'authTicketXml': '<authSign/>'}) as mocked:
            self.assertEqual(self.company.l10n_kz_edi_create_auth_ticket(), '<authSign/>')
        self.assertEqual(mocked.call_args.args[:2], ('AuthService', 'createAuthTicket'))

    def _responses(self):
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

    def test_run_signed_checks_wrapper_returns_serializable_payload(self):
        self.env.user.l10n_kz_edi_last_session_date = False
        responses = self._responses()
        with patch(SEAM, side_effect=lambda service, operation, payload, wsse=None: responses[operation]):
            result = self.company.l10n_kz_edi_run_signed_checks('<signed/>')
        self.assertEqual(result['profile'], 'ADMIN_ENTERPRISE')
        self.assertIn('Acme LLP', result['summary'])
        # The browser must be able to colour Check 3, so the verdict travels too.
        self.assertTrue(result['enterprise_validation_result']['success'])
        # The whole payload has to survive the RPC boundary.
        json.dumps(result)

    def test_run_signed_checks_wrapper_documents_every_dropped_key(self):
        """The public wrapper returns a narrower dict than its private namesake,
        so every key it drops must be named in its docstring."""
        self.env.user.l10n_kz_edi_last_session_date = False
        with patch(SEAM, side_effect=lambda service, operation, payload, wsse=None: self._responses()[operation]):
            private = self.company._l10n_kz_edi_run_signed_checks('<signed/>')
        self.env.user.l10n_kz_edi_last_session_date = False
        with patch(SEAM, side_effect=lambda service, operation, payload, wsse=None: self._responses()[operation]):
            public = self.company.l10n_kz_edi_run_signed_checks('<signed/>')

        docstring = inspect.getdoc(type(self.company).l10n_kz_edi_run_signed_checks)
        for dropped in set(private) - set(public):
            with self.subTest(key=dropped):
                self.assertIn(dropped, docstring)

    def test_wrappers_require_accounting_rights(self):
        portal = self.env['res.users'].create({
            'name': 'KZ Portal',
            'login': 'kz_portal_user',
            'group_ids': [(6, 0, [self.env.ref('base.group_portal').id])],
        })
        company = self.company.with_user(portal)
        with patch(SEAM) as mocked:
            with self.assertRaises(AccessError):
                company.l10n_kz_edi_check_reachability()
        mocked.assert_not_called()

    def test_close_session_failure_does_not_mask_the_real_error(self):
        """A failing ``closeSession`` must not hide why the checks failed."""
        self.env.user.l10n_kz_edi_last_session_date = False

        def _seam(service, operation, payload, wsse=None):
            if operation == 'createSessionSigned':
                return {'sessionId': 'sess-1'}
            if operation == 'closeSession':
                raise AccessError('close blew up')
            raise AccessError('the real cause')

        with patch(SEAM, side_effect=_seam) as mocked:
            with self.assertRaisesRegex(AccessError, 'the real cause'):
                self.company._l10n_kz_edi_run_signed_checks('<signed/>')
        self.assertEqual(mocked.call_args_list[-1].args[1], 'closeSession')


@tagged('post_install', '-at_install', 'l10n_kz_edi')
class TestL10nKzEdiCallKw(HttpCase):

    def test_call_kw_accepts_the_owl_methods(self):
        """Hit ``/web/dataset/call_kw`` for real, as the browser does."""
        self.authenticate('admin', 'admin')
        company = self.env.company
        company.vat = '123456789012'
        self.env.cr.flush()

        with patch(SEAM, return_value={'version': '1.0'}):
            response = self.make_jsonrpc_request('/web/dataset/call_kw', {
                'model': 'res.company',
                'method': 'l10n_kz_edi_check_reachability',
                'args': [[company.id]],
                'kwargs': {},
            })
        self.assertTrue(response['reachable'])

    def test_call_kw_rejects_the_private_methods(self):
        """The frozen private methods stay private -- hence the wrappers."""
        self.authenticate('admin', 'admin')
        with self.assertRaises(AccessError):
            get_public_method(self.env['res.company'], '_l10n_kz_edi_check_reachability')
