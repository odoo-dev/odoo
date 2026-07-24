# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""Live Check 1 test against the real ESF sandbox.

Mirrors ``l10n_es_edi_sii/tests/test_edi_web_services.py``: the class is tagged
``-standard`` so it is *excluded* from the ordinary CI run and only executes
opt-in with ``--test-tags external``. It exercises the real reachability path
with NO mocking -- a real zeep client is built from the live
``VersionService?wsdl`` (fetched from the sandbox and ORM-cached) and driven
against the live sandbox endpoint. Because Check 1 is unauthenticated it needs
neither a session, nor a signature, nor a certificate, nor NCALayer.

Network/connection failures degrade cleanly through ``self.skipTest`` so the
test never errors when the sandbox is unreachable (and ``-standard`` keeps it
out of the normal suite regardless).
"""
import requests

from odoo.exceptions import UserError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase
from odoo.tools import zeep


@tagged('external_l10n', 'post_install', '-at_install', '-standard', 'external')
class TestL10nKzEdiWebServices(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env.company
        # Check 1 is unauthenticated: no certificate, no session, no NCALayer.
        cls.company.l10n_kz_edi_environment = 'sandbox'

    def test_check_reachability_live_sandbox(self):
        """Drive the REAL Check 1 against the live sandbox VersionService.

        No mock and no patch of the seam: this proves the live ?wsdl and the
        sandbox endpoint actually talk to each other and return a version.
        """
        self.assertEqual(
            self.company._l10n_kz_edi_get_base_url(),
            'https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1/',
        )
        try:
            result = self.company._l10n_kz_edi_check_reachability()
        except (UserError, zeep.exceptions.Error, requests.exceptions.RequestException, OSError) as error:
            # The sandbox may be down or firewalled: degrade cleanly instead of
            # erroring so the opt-in run stays informative.
            self.skipTest("ESF sandbox is not reachable: %s" % error)

        self.assertTrue(result['reachable'])
        version = result['version']
        self.assertTrue(version, "The live sandbox must answer a non-empty version string.")
