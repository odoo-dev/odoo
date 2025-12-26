import json
import requests

from odoo import Command
from odoo.tests import tagged
from odoo.tools import file_open

from odoo.addons.account.tests.common import PatchRequestsMixin
from odoo.addons.account.tests.test_account_move_send import TestAccountMoveSendCommon
from odoo.addons.l10n_hr_edi.tests.test_hr_edi_common import TestL10nHrEdiCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestHrEdiFlowsMocked(TestL10nHrEdiCommon, TestAccountMoveSendCommon, PatchRequestsMixin):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

    # -------------------------------------------------------------------------
    # HELPERS
    # -------------------------------------------------------------------------

    def _get_base_url(self):
        return 'https://demo.moj-eracun.hr'

    def _get_mojeracun_credentials(self):
        """ If running the tests in external mode, you need to provide valid credentials here. """
        return {
            'Username': '...',
            'Password': '...',
            'CompanyId': self.env.company.l10n_hr_mer_company_ident,
            'SoftwareId': 'Test-002',
        }

    def _build_request(self, endpoint, request_args):
        return {
            'method': 'post',
            'url': self._get_base_url() + endpoint,
            'json': {
                **self._get_mojeracun_credentials(),
                **request_args,
            },
        }

    def _build_response(self, status_code, response_dict):
        response = requests.Response()
        response.status_code = status_code
        response._content = json.dumps(response_dict)
        return response

    def _build_send_request(self, invoice_xml):
        return self._build_request(
            endpoint='/api/v2/send',
            request_args={
                'File': invoice_xml,
            },
        )

    def _build_send_success_response(self, **kwargs):
        return self._build_response(200, {
            "ElectronicId": "3083666",
            "DocumentNr": "INV/2017/00001",
            "DocumentTypeId": 1,
            "DocumentTypeName": "Račun",
            "StatusId": 20,
            "StatusName": "Obrađen",
            "RecipientBusinessNumber": "BE0477472701",
            "RecipientBusinessUnit": "",
            "RecipientBusinessName": "Odoo S.A.",
            "Created": "2025-10-14T14:27:06.2388492+02:00",
            "Sent": "2025-10-14T14:27:06.3355877+02:00",
            "Modified": "2025-10-14T14:27:06.3355877+02:00",
            "Delivered": None,
            **kwargs,
        })

    # -------------------------------------------------------------------------
    # TESTS
    # -------------------------------------------------------------------------

    def test_10_send_invoice(self):
        self.setup_partner_as_hr(self.env.company.partner_id)
        self.setup_partner_as_hr_alt(self.partner_a)
        tax = self.env['account.chart.template'].ref('VAT_S_IN_ROC_25')

        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [
                Command.create({
                    'product_id': self.product_a.id,
                    'price_unit': 100.0,
                    'tax_ids': [Command.set(tax.ids)],
                }),
            ],
        })
        invoice.action_post()

        # TODO: Any asserts needed before sending?

        send_and_print = self.create_send_and_print(invoice)

        with file_open('l10n_hr_edi/tests/test_files/test_invoice.xml', 'r') as f:
            expected_invoice_xml = f.read().replace('INV/2017/00001', invoice.name).encode()

        with self.assert_requests([
            (
                # Request 1: Send invoice
                self._build_send_request(expected_invoice_xml),
                self._build_send_success_response({
                    "ElectronicId": "3083666",
                    "DocumentNr": invoice.name,
                    "RecipientBusinessNumber": "BE0477472701",
                    "RecipientBusinessName": "Odoo S.A.",
                }),
            ),
        ]):
            send_and_print._generate_and_send_invoices(invoice)

        # TODO: Any other fields to assert?
        self.assertRecordValues(invoice, [{
            'l10n_hr_mer_document_status': '20',
            'l10n_hr_mer_document_eid': '3083666',
        }])


@tagged('external_l10n', 'external', 'post_install', '-at_install', '-standard', '-post_install_l10n')
class TestHrEdiFlowsLive(TestHrEdiFlowsMocked):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.external_mode = 'warn'  # Activate external mode with warnings
