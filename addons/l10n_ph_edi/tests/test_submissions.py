# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import hashlib
import hmac
import json
from datetime import timedelta
from unittest.mock import patch

import requests
from freezegun import freeze_time

from odoo import fields
from odoo.addons.account.tests.common import AccountTestInvoicingHttpCommon
from odoo.addons.l10n_ph_edi.tools.helpers import _decrypt_rsa, _encrypt_aes256
from odoo.exceptions import UserError
from odoo.tests import tagged
from odoo.tools import format_date

# Public/private keys to simulate the encryption with public key done on our side and decryption with private on theirs.
PUBLIC_KEY = "MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEApEFpJQK4Wq+r64m6WvczgUs9G5OmR4SZrgR/aJf7XbXTqbk9rykojLMGOqv2yXynWORG6xRheWM8ntNljY7vKyUwOqlX3i4NWwGhs7NfJGTC2y/1ExPH7iR06OTo3B+Xoy5lsXruFhFqoD4H5tDO31Y5uHkEBGLxYUpeF1QR5t0lf3bBtb3yhkQH63m31dZGLB95AkQuM7vIB6O8gUJSnJGeGO7fzHJN+rhRiaKc+STQsy5KrrgbYRsd2BdPRkLvByU7lJVmDpECvoTGdWVOLkVhErw9DBnIxT4PmbSccCIDPf4rofG55FH/xSfZq/0lN04M6njODloDg5DJJkBuEtVYxFCsyXj/OBChFZdtrO48cD70dWNH7h42scFi/YU2O+Q3jn4uaP1tIOfRaDKvYv5TZ8WfwVPdMakGf5yAziplmFRcYhsCGpjOktWnZEBg2d2vXlG+BDopYtc71UihtUizxWeilhmZOxJCBeE4ja5786Ea+THK3nw5vGTDrIOdAgMBAAE="
PRIVATE_KEY = "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"
REQUEST_TO_PATCH = 'odoo.addons.l10n_ph_edi.tools.helpers.requests.request'


@tagged('post_install_l10n', 'post_install', '-at_install')
class L10nPHTestEIS(AccountTestInvoicingHttpCommon):
    """
    The data sent and returned during the different flows matches the examples in their documentation.
    The certificate used for the test have been generated for these tests only.
    """

    @classmethod
    @AccountTestInvoicingHttpCommon.setup_country('ph')
    def setUpClass(cls):
        super().setUpClass()
        # Setup the EIS data for the company.
        cls.company_data['company'].write({
            # Basic information that must be filled by the user to use the system.
            'l10n_ph_edi_accreditation_id': '12345678',  # Issued by the EIS, included in invoices unique IDs
            'l10n_ph_edi_application_id': '60xLDIL1',
            'l10n_ph_edi_application_key': 'X8TD8UUEDTK7',
            'l10n_ph_edi_user_id': 'douzone',
            'l10n_ph_edi_user_password': 'abc!123',
            # Use our own key so that we can decrypt and validate the encryption part as well
            'l10n_ph_edi_eis_public_key': PUBLIC_KEY,
            # Authentication information retrieve from the system.
            'l10n_ph_edi_auth_token': '',
            'l10n_ph_edi_auth_session_key': '',
            'l10n_ph_edi_auth_token_expiry': '',
        })
        cls.partner_a.vat = '123-456-789-000'

    @freeze_time('2025-02-02 10:00:00')
    def test_01_authentication(self):
        """ Test the authentication flow to ensure that the data is correctly sent, and that we handle the response correctly. """
        # Test a: successful flow. We expect the company to store the authentication data.
        with patch(REQUEST_TO_PATCH, new=self._test_01_authentication_success):
            auth_token = self.company_data['company']._l10n_ph_edi_authenticate()
            self.assertEqual(auth_token, '53A8CJFLEK3CE9MQ7L2X9V76TUIPZ4YU')
            self.assertRecordValues(
                self.company_data['company'],
                [{
                    'l10n_ph_edi_auth_token': '53A8CJFLEK3CE9MQ7L2X9V76TUIPZ4YU',
                    'l10n_ph_edi_auth_session_key': 'WmZq4t7w!z$C&F)J@NcRfUjXn2r5u8x/',
                    'l10n_ph_edi_auth_token_expiry': fields.Datetime.now() + timedelta(minutes=60),  # The expected value returned from the test.
                }]
            )

        # Test b: failed flow. A UserError is expected.
        with patch(REQUEST_TO_PATCH, new=self._test_01_authentication_failed):
            with self.assertRaises(UserError):
                self.company_data['company']._l10n_ph_edi_authenticate()

    @freeze_time('2025-02-02 10:00:00')
    def test_02_initiate_invoice(self):
        """ Test the submission of a basic invoice to the EIS, and ensure that the important fields on the invoice are set afterward. """
        # Test a: submission is successful, the invoice is awaiting validation.
        with patch(REQUEST_TO_PATCH, new=self._test_02_submission_success):
            self.company_data['company']._l10n_ph_edi_enable()
            invoice = self.init_invoice('out_invoice', amounts=[100], post=True)
            invoice._generate_eis_documents()
            document_data = invoice.eis_document_ids._generate_eis_json()
            self.env['account.move.send']._generate_and_send_invoices(
                invoice,
                invoice_edi_format='ph_eis',
            )
            self.assertEqual(invoice.l10n_ph_edi_submission_id, '12345678-20210325-be3cfa2c0b1e')
            self.assertEqual(invoice.l10n_ph_edi_unique_id, '202103251234567800000001')
            self.assertEqual(invoice.l10n_ph_edi_submission_state, 'sent')

        # Test b: submission fails, an error is raised.
        with patch(REQUEST_TO_PATCH, new=self._test_02_submission_failed):
            with self.assertRaises(UserError):
                invoice = self.init_invoice('out_invoice', amounts=[200], post=True)
                self.env['account.move.send']._generate_and_send_invoices(
                    invoice,
                    invoice_edi_format='ph_eis',
                )

    def test_03_poll_validation_status(self):
        """ Test the polling of an invoice validation status and the different possible states. """
        invoice = self.init_invoice('out_invoice', amounts=[200], post=True)
        invoice.write({
            'l10n_ph_edi_submission_id': '12345678-20210325-be3cfa2c0b1e',
            'l10n_ph_edi_submission_state': 'sent',
        })
        with patch(REQUEST_TO_PATCH, new=self._test_03_inquiry_in_progress):
            invoice.action_pull_validation_result()
            self.assertEqual(invoice.l10n_ph_edi_submission_state, 'sent')
        with patch(REQUEST_TO_PATCH, new=self._test_03_inquiry_success):
            invoice.action_pull_validation_result()
            self.assertEqual(invoice.l10n_ph_edi_submission_state, 'registered')
        # We reset the state, as we don't want to allow spamming the API by polling invoices that are done.
        invoice.l10n_ph_edi_submission_state = 'in_progress'
        with patch(REQUEST_TO_PATCH, new=self._test_03_inquiry_failed):
            invoice.action_pull_validation_result()
            with self.assertRaises(UserError, msg='The validation of the invoice failed.'):
                self.assertEqual(invoice.l10n_ph_edi_submission_state, 'rejected')

    def test_04_receive_validation_status(self):
        """ Test that alternatively to polling, we can receive the status automatically once the validation ends. """
        invoice = self.init_invoice('out_invoice', amounts=[200], post=True)
        invoice.write({
            'l10n_ph_edi_unique_id': '202103251234567800000001',
            'l10n_ph_edi_submission_id': '12345678-20210325-be3cfa2c0b1e',
            'l10n_ph_edi_submission_state': 'in_progress',
        })
        # Simulate an update being pushed, we mainly test the controller and not the invoice logic (tested above)
        response = self._trigger_validation_status_push('12345678-20210325-be3cfa2c0b1e')
        self.assertEqual(invoice.l10n_ph_edi_submission_state, 'valid')
        invoice.l10n_ph_edi_submission_state = 'in_progress'
        self.assertEqual(
            response,
            {
                "status": "1",
                "data": {
                    "accreditationId": self.company_data['company'].l10n_ph_edi_accreditation_id,
                    "userId": "testuser",
                    "refSubmitId": "12345678-20210325-be3cfa2c0b1e",
                    "taxpayerAckId": "20210325-20210601135218-12345",
                    "description": "Test description message",
                }
            }
        )
        # We try again but purposefully give a wrong info in the signature to ensure that we block the request.
        response = self._trigger_validation_status_push('12345678-20210325-be3cfa2c0b1e', fail_sign=True)
        self.assertEqual(
            response,
            {
                "status": "0",
                "errorDetails": {
                    "errorCode": "ERR",
                    "errorMessage": "Error xxx"
                }
            }
        )

    def test_05_batch_submission(self):
        """ Test that we can send invoices in batch, and also receive validation status for the batch. """
        invoices = (
            self.init_invoice('out_invoice', amounts=[100], post=True)
            | self.init_invoice('out_invoice', amounts=[200], post=True)
            | self.init_invoice('out_invoice', amounts=[300], post=True)
        )
        with patch(REQUEST_TO_PATCH, new=self._test_05_submission_success):
            self.env['account.move.send']._generate_and_send_invoices(
                invoices,
                invoice_edi_format='ph_eis',
            )

    # -------------------------------------------------------------------------
    # Patched methods
    # -------------------------------------------------------------------------

    def _test_01_authentication_success(self, method, url, **kwargs):
        """ Patch to return a successful authentication response. """
        if method == 'POST' and url == 'https://eis-cert.bir.gov.ph/api/authentication':
            # We check that we receive the expected data, and that we properly encrypted it.
            data = json.loads(_decrypt_rsa(base64.b64decode(kwargs['json']['data']), PRIVATE_KEY))
            # We don't test the authKey here, instead we use it to encrypt the response, and it will fail at decryption if wrong.
            auth_key = data.pop('authKey')
            self.assertDictEqual(
                data,
                {
                    "userId": "douzone",
                    "password": "abc!123",
                },
            )
            payload = json.dumps({
                "accreditationId": self.company_data['company'].l10n_ph_edi_accreditation_id,
                "userId": self.company_data['company'].l10n_ph_edi_user_id,
                "authToken": "53A8CJFLEK3CE9MQ7L2X9V76TUIPZ4YU",
                "sessionKey": "WmZq4t7w!z$C&F)J@NcRfUjXn2r5u8x/",
                "tokenExpiry": (fields.Datetime.now() + timedelta(minutes=60)).strftime('%Y-%m-%dT%H:%M:%S'),
            })
            encrypted_payload = _encrypt_aes256(payload, auth_key)
            return self._make_request_response(200, {
                "status": "1",
                "data": base64.b64encode(encrypted_payload),
            })
        else:
            raise UserError('Unexpected request done during a test: %s %s.' % (method, url))

    def _test_01_authentication_failed(self, method, url, **kwargs):
        """ Patch to return a failed authentication response. """
        if method == 'POST' and url == 'https://eis-cert.bir.gov.ph/api/authentication':
            return self._make_request_response(200, {
                "status": "0",
                "errorDetails": {
                    "errorCode": "E23",
                    "errorMessage": "Invalid User ID or Password",
                },
            })
        else:
            raise UserError('Unexpected request done during a test: %s %s.' % (method, url))

    def _test_02_submission_success(self, method, url, **kwargs):
        """ Patch to return a successful authentication response. """
        if method == 'POST' and url == 'https://eis-cert.bir.gov.ph/api/authentication':
            data = json.loads(_decrypt_rsa(base64.b64decode(kwargs['json']['data']), PRIVATE_KEY))
            auth_key = data.pop('authKey')
            payload = json.dumps({
                "accreditationId": self.company_data['company'].l10n_ph_edi_accreditation_id,
                "userId": self.company_data['company'].l10n_ph_edi_user_id,
                "authToken": "53A8CJFLEK3CE9MQ7L2X9V76TUIPZ4YU",
                "sessionKey": "WmZq4t7w!z$C&F)J@NcRfUjXn2r5u8x/",
                "tokenExpiry": (fields.Datetime.now() + timedelta(minutes=60)).strftime('%Y-%m-%dT%H:%M:%S'),
            })
            encrypted_payload = _encrypt_aes256(payload, auth_key)
            return self._make_request_response(200, {
                "status": "1",
                "data": base64.b64encode(encrypted_payload),
            })
        elif method == 'POST' and url == 'https://eis-cert.bir.gov.ph/api/invoices':
            # todo test the received data.
            print('')
            return {
                "status": "1",
                "data": "uIBdWCRrNnpUKfd+RcYYwgHtFi6M3ggK9N+tgp36WDqBFMzU2qO6Qe7vEFITWtDnmeKQ6mom5ZX3qCz/SPPshtsS3SrL9YTDVw42Rsg"
                        "ZYYK5pbL4kpR6Xqr0HjjBrUiv6PxgCtZneCqGtPAx/4EScePKIBVdKpFOm9TtNY3NjmZXvrMRYMCOjNeZDMb49vxukOFD56XIAdVncSm"
                        "bvEP5n6OC+T7YSMPSbDJYZmNhLBobfUfpv9Uvela5Ggv3fOnFHQzA4RCtYP4hrzHT4dJTbN1lKnVwHBw7Z8F8mJZId2R0xklK7ae6G05"
                        "8TMQ2fXlS",
            }
        else:
            raise UserError('Unexpected request done during a test: %s %s.' % (method, url))

    def _test_02_submission_failed(self, method, url, **kwargs):
        """ Patch to return a successful authentication response. """
        if method == 'POST' and url == 'https://eis-cert.bir.gov.ph/api/invoices':
            return {
                "status": "0",
                "errorDetails": {
                    "errorCode": "E03",
                    "errorMessage": "Invalid authToken",
                },
            }
        else:
            raise UserError('Unexpected request done during a test: %s %s.' % (method, url))

    def _test_03_inquiry_success(self, method, url, **kwargs):
        """ Patch to return a successful authentication response. """
        if method == 'GET' and url == 'https://eis-cert.bir.gov.ph/invoice_result/12345678-20210325-be3cfa2c0b1e':
            return {
                "status": "1",
                "data": {
                    "accreditationId": self.company_data['company'].l10n_ph_edi_accreditation_id,
                    "userId": "testuser",
                    "refSubmitId": "12345678-20210325-be3cfa2c0b1e",
                    "ackId": "BIR-20210325154527-12345",
                    "responseDtm": "2021-03-25T15:45:28",
                    "processStatusCode": "01",
                    "totalCountQuantity": 1,
                    "successCountQuantity": 1,
                    "failCountQuantity": 1,
                    "processedDocuments": [
                        {"invoiceUid": "202103251234567800000001", "resultStatusCode": "SUC001"},
                    ]
                }
            }
        else:
            raise UserError('Unexpected request done during a test: %s %s.' % (method, url))

    def _test_03_inquiry_in_progress(self, method, url, **kwargs):
        """ Patch to return a successful authentication response. """
        if method == 'GET' and url == 'https://eis-cert.bir.gov.ph/invoice_result/12345678-20210325-be3cfa2c0b1e':
            return {
                "status": "1",
                "data": {
                    "accreditationId": self.company_data['company'].l10n_ph_edi_accreditation_id,
                    "userId": "testuser",
                    "refSubmitId": "12345678-20210325-be3cfa2c0b1e",
                    "ackId": "BIR-20210325154527-12345",
                    "responseDtm": "2021-03-25T15:45:28",
                    "processStatusCode": "02"
                }
            }
        else:
            raise UserError('Unexpected request done during a test: %s %s.' % (method, url))

    def _test_03_inquiry_failed(self, method, url, **kwargs):
        """ Patch to return a successful authentication response. """
        if method == 'GET' and url == 'https://eis-cert.bir.gov.ph/invoice_result/12345678-20210325-be3cfa2c0b1e':
            return {
                "accreditationId": self.company_data['company'].l10n_ph_edi_accreditation_id,
                "userId": "testuser",
                "refSubmitId": "12345678-20210325-be3cfa2c0b1e",
                "ackId": "BIR-20210325154527-12345",
                "responseDtm": "2021-03-25T15:45:28",
                "processStatusCode": "03",
                "failReasonStatusCode": "FRS002"
            }
        else:
            raise UserError('Unexpected request done during a test: %s %s.' % (method, url))

    def _test_05_submission_success(self, method, url, **kwargs):
        """ Patch to return a successful authentication response. """
        if method == 'POST' and url == 'https://eis-cert.bir.gov.ph/api/invoices':
            # todo test the received data.
            # todo correctly create custom data and then encrypt them as expected.
            return {
                "status": "1",
                "data": "uIBdWCRrNnpUKfd+RcYYwgHtFi6M3ggK9N+tgp36WDqBFMzU2qO6Qe7vEFITWtDnmeKQ6mom5ZX3qCz/SPPshtsS3SrL9YTDVw42Rsg"
                        "ZYYK5pbL4kpR6Xqr0HjjBrUiv6PxgCtZneCqGtPAx/4EScePKIBVdKpFOm9TtNY3NjmZXvrMRYMCOjNeZDMb49vxukOFD56XIAdVncSm"
                        "bvEP5n6OC+T7YSMPSbDJYZmNhLBobfUfpv9Uvela5Ggv3fOnFHQzA4RCtYP4hrzHT4dJTbN1lKnVwHBw7Z8F8mJZId2R0xklK7ae6G05"
                        "8TMQ2fXlS",
            }
        else:
            raise UserError('Unexpected request done during a test: %s %s.' % (method, url))

    # -------------------------------------------------------------------------
    # Other helpers
    # -------------------------------------------------------------------------

    def _trigger_validation_status_push(self, submission_id, fail_sign=False):
        """ Fake a request coming from outside. """
        url = f'{self.base_url()}/api/receive_invoice_result'
        now = format_date(self.env, fields.Datetime.now(), date_format='yyyyMMddHHmmss')
        payload = {
            "accreditationId": self.company_data['company'].l10n_ph_edi_accreditation_id,
            "userId": "testuser",
            "refSubmitId": {submission_id},
            "ackId": "BIR-20210325154527-12345",
            "responseDtm": now,
            "processStatusCode": "01",
            "totalCountQuantity": 1,
            "successCountQuantity": 1,
            "failCountQuantity": 0,
            "processedDocuments": [
                {"invoiceUid": "202103251234567800000001", "resultStatusCode": "SUC001"},
            ]
        }
        message = f'{now}{'POST' if fail_sign else 'PUT'}/invoice_result/{submission_id}'
        h = hmac.new(base64.b64decode(self.company_data['company'].l10n_ph_edi_auth_session_key), message.encode(), digestmod=hashlib.sha256)

        # Build the header
        headers = {
            'accreditationId': self.company_data['company'].l10n_ph_edi_accreditation_id,
            'applicationId': '60xLDIL1',
            'authorization': f"Bearer {h.hexdigest()}",
            'datetime': 'application/json',
        }

        return self.url_open(url=url, data=payload, headers=headers)

    @staticmethod
    def _make_request_response(status_code, data):
        def json_func():
            return data

        r = requests.Response()
        r.status_code = status_code
        r.json = json_func
        return r
