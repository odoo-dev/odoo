# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.exceptions import UserError, ValidationError, RedirectWarning
from odoo.tests import tagged
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.addos.l10n_id_efaktur_coretax.tests.test_l10n_id_efaktur_coretax import TestEfakturCoretax


class TestPajakio(TestEfakturCoretax):
    """
    Tests include:
    1) 

    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # API repsonses
        cls.user_registration_error = {
            'code': 400,
            'data': None,
            'message': 'PASSWORD MUST HAVE ATLEAST ONE UPPERCASE CHARACTER',
            'status': 'BAD_REQUEST'
        }
        cls.user_registration_success = {
            'code': 200,
            'data': None,
            'message': 'REGISTER USER SUCCESS',
            'status': 'OK'
        }
        cls.company_registration_success = {
            'code': 200,
            'data': {'clientId': 'u7oZMdLXeNgztgcFo-5RpYPOnTxraYdFuA'},
            'message': 'REGISTER COMPANY PT. BROKE BOYS INDONESIA SUCCESS',
            'status': 'OK'
        }

        cls.success_create_efaktur = {
            'batchId': '4777920d-6039-4ee4-9dfa-79757aeec677', 
            'transaction': [
                {'transactionId': 'e5d76caa-979d-43d5-a4f6-96c93e7b3a6d',
                 'noInvoice': 'INV/2025/00001',
                 'message': 'SUCCESS SENDING REQUEST TO CREATE VAT OUTPUT'
                }
            ]
        }
