import json
from unittest.mock import patch

import requests

from odoo.exceptions import UserError
from odoo.tests import tagged

from .common import TestEGEdiCommon


def _response(status_code, content):
    response = requests.Response()
    response.status_code = status_code
    response._content = content if isinstance(content, bytes) else json.dumps(content).encode()
    return response


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestFetchBills(TestEGEdiCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.purchase_journal = cls.company_data['default_journal_purchase']
        cls.tax_14 = cls.env['account.tax'].create({
            'name': 'ETA purchase 14%',
            'type_tax_use': 'purchase',
            'amount': 14,
            'l10n_eg_eta_code': 't1_v009',
        })
        cls.tax_withholding = cls.env['account.tax'].create({
            'name': 'ETA withholding 1%',
            'type_tax_use': 'purchase',
            'amount': -1,
            'l10n_eg_eta_code': 't4_w002',
        })

    def _document(self, uuid, **kwargs):
        return {
            'uuid': uuid,
            'internalId': f'INV-{uuid}',
            'typeName': 'I',
            'issuerId': '123456789',
            'dateTimeIssued': '2022-03-15T10:00:00Z',
            'status': 'Valid',
            **kwargs,
        }

    def _patch_eta(self, pages, raw_lines=None, raw_status=200):
        """ Mock the ETA API: `pages` is the list of search-documents results, one entry per page."""
        raw_lines = raw_lines or [{'description': 'Service', 'quantity': 2, 'unitValue': {'amountEGP': 50.0}}]

        def request(method, url, **kwargs):
            if url.endswith('/connect/token'):
                return _response(200, {'access_token': 'tok'})
            if url.endswith('/api/v1.0/documents/search'):
                index = int(kwargs['params'].get('continuationToken') or 0)
                token = str(index + 1) if index + 1 < len(pages) else 'EndofResultSet'
                return _response(200, {'result': pages[index], 'metadata': {'continuationToken': token}})
            return _response(raw_status, {'document': json.dumps({'invoiceLines': raw_lines})})

        return patch('odoo.addons.l10n_eg_edi_eta.lib.eta_client.requests.request', side_effect=request)

    def setUp(self):
        super().setUp()
        self.startPatcher(patch('odoo.addons.l10n_eg_edi_eta.models.account_move.ETA_SEARCH_DOCUMENTS_DELAY', 0))

    def test_fetch_bills(self):
        self.assertTrue(self.purchase_journal.show_fetch_in_einvoices_button)
        pages = [
            [self._document('UUID1'), self._document('UUID2', typeName='C', status='Invalid')],
            [self._document('UUID3', typeName='C'), self._document('UUID1')],
        ]
        raw_lines = [{
            'description': 'Service',
            'quantity': 2,
            'unitValue': {'amountEGP': 50.0},
            'discount': {'rate': 10},
            'taxableItems': [
                {'taxType': 'T1', 'subType': 'V009', 'rate': 14},
                {'taxType': 'T4', 'subType': 'W002', 'rate': 1},
                {'taxType': 'T2', 'subType': 'Tbl01', 'rate': 5},
            ],
        }]
        with self._patch_eta(pages, raw_lines) as mock_request:
            self.purchase_journal.button_fetch_in_einvoices()
            bills = self.env['account.move'].search([('l10n_eg_eta_received_uuid', '!=', False)], order='id')
            self.assertRecordValues(bills, [
                {'l10n_eg_eta_received_uuid': 'UUID1', 'move_type': 'in_invoice', 'ref': 'INV-UUID1', 'journal_id': self.purchase_journal.id},
                {'l10n_eg_eta_received_uuid': 'UUID3', 'move_type': 'in_refund', 'ref': 'INV-UUID3', 'journal_id': self.purchase_journal.id},
            ])
            self.assertRecordValues(bills[0].invoice_line_ids, [{
                'name': 'Service',
                'quantity': 2,
                'price_unit': 50.0,
                'discount': 10,
                'tax_ids': (self.tax_14 + self.tax_withholding).ids,
            }])
            self.assertEqual(str(bills[0].invoice_date), '2022-03-15')

            # Fetching again does not create duplicates nor download the documents again.
            mock_request.reset_mock()
            self.purchase_journal.button_fetch_in_einvoices()
            self.assertFalse([call for call in mock_request.call_args_list if call.args[1].endswith('/raw')])
            self.assertEqual(self.env['account.move'].search_count([('l10n_eg_eta_received_uuid', '!=', False)]), 2)

    def test_fetch_bills_errors(self):
        messages = {
            'unreachable': "Unable to reach the ETA portal. Please check your connection or try again later.",
            'auth': "ETA authentication failed. Please verify your Client ID, Client Secret, and environment in the settings.",
            'other': "The ETA portal returned an error. Please try again later.",
        }
        for side_effect, expected in (
            (requests.exceptions.ConnectionError(), 'unreachable'),
            (_response(401, {'error': 'invalid_client'}), 'auth'),
            (_response(500, b'Internal Server Error'), 'other'),
        ):
            with self.subTest(expected=expected), patch(
                'odoo.addons.l10n_eg_edi_eta.lib.eta_client.requests.request', side_effect=[side_effect],
            ), self.assertRaisesRegex(UserError, messages[expected]):
                self.purchase_journal.button_fetch_in_einvoices()

        for raw_status, expected in ((403, 'auth'), (404, 'other')):
            with self.subTest(raw_status=raw_status), self._patch_eta([[self._document('UUID1')]], raw_status=raw_status), \
                    self.assertRaisesRegex(UserError, messages[expected]):
                self.purchase_journal.button_fetch_in_einvoices()
        self.assertFalse(self.env['account.move'].search_count([('l10n_eg_eta_received_uuid', '!=', False)]))
