# Part of Odoo. See LICENSE file for full copyright and licensing details.
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

from odoo import Command

from odoo.addons.account.tests.test_account_move_send import TestAccountMoveSendCommon

BAROBILL_CALL = 'odoo.addons.l10n_kr_edi.models.res_company.ResCompany._l10n_kr_edi_barobill_call'
BAROBILL_NOT_FOUND = -21002
BAROBILL_ISSUED = 3011
BAROBILL_CANCELLED = 5013


class TestL10nKrEdiCommon(TestAccountMoveSendCommon):

    @classmethod
    @TestAccountMoveSendCommon.setup_country('kr')
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.company_data['company']
        cls.company.write({
            'vat': '220-81-05670',
            'street': '1 Sejong-daero',
            'city': 'Seoul',
            'email': 'company@example.kr',
            'phone': '02-1234-5678',
            'l10n_kr_representative_name': 'Kim Daepyo',
            'l10n_kr_edi_barobill_id': 'barobill_user',
            'l10n_kr_edi_certificate_key': 'certificate_key',
        })
        cls.partner_a.write({
            'name': '㈜Partner A',
            'vat': '123-81-02348',
            'street': '2 Teheran-ro',
            'city': 'Seoul',
            'country_id': cls.env.ref('base.kr').id,
            'l10n_kr_representative_name': 'Lee Daepyo',
            'industry_id': cls.env['res.partner.industry'].create({'name': "Wholesale"}).id,
        })
        cls.partner_b.write({
            'phone': '+82 10-1234-5678',
            'country_id': cls.env.ref('base.kr').id,
            'l10n_kr_default_issuance_type': 'cash_receipt',
        })
        ChartTemplate = cls.env['account.chart.template'].with_company(cls.company)
        cls.tax_10 = ChartTemplate.ref('l10n_kr_Sales_10')
        cls.tax_0 = ChartTemplate.ref('l10n_kr_Sales_0')
        cls.tax_exempt = ChartTemplate.ref('l10n_kr_Sales_tf')
        cls.Document = cls.env['l10n_kr_edi.document']

    @classmethod
    def _create_kr_invoice(cls, partner=None, taxes=None, invoice_date='2026-11-24', move_type='out_invoice', lines=None, post=True, **values):
        invoice = cls.env['account.move'].create({
            'move_type': move_type,
            'partner_id': (partner or cls.partner_a).id,
            'invoice_date': invoice_date,
            'invoice_line_ids': [
                Command.create({
                    'name': 'Line',
                    'quantity': 2,
                    'price_unit': 1000,
                    'tax_ids': [Command.set((taxes or cls.tax_10).ids)],
                    **line_values,
                })
                for line_values in (lines or [{}])
            ],
            **values,
        })
        if post:
            invoice.action_post()
        return invoice

    @classmethod
    def _create_kr_document(cls, move, state='issued', **values):
        return cls.Document.create({
            'move_id': move.id,
            'document_type': 'cash_receipt' if move.l10n_kr_issuance_type == 'cash_receipt' else 'tax_invoice',
            'mgt_key': move.name.replace('/', '-'),
            'state': state,
            **values,
        })

    @staticmethod
    def _tax_invoice_state(barobill_state=BAROBILL_ISSUED, nts_send_state=1, **values):
        return SimpleNamespace(
            BarobillState=barobill_state,
            NTSSendState=nts_send_state,
            NTSSendKey=values.get('NTSSendKey', ''),
            NTSSendDT=values.get('NTSSendDT', ''),
            NTSResultDT=values.get('NTSResultDT', ''),
            NTSSendResult=values.get('NTSSendResult', ''),
        )

    @staticmethod
    def _cash_receipt_state(barobill_state, **values):
        return SimpleNamespace(
            BarobillState=barobill_state,
            NTSConfirmNum=values.get('NTSConfirmNum', ''),
            NTSConfirmDT=values.get('NTSConfirmDT', ''),
            NTSSendDT=values.get('NTSSendDT', ''),
            NTSConfirmMessage=values.get('NTSConfirmMessage', ''),
        )

    @contextmanager
    def _patch_barobill(self, responses):
        calls = []

        def barobill_call(company, service_name, operation, **kwargs):
            calls.append((operation, kwargs))
            response = responses[operation]
            return response.pop(0) if isinstance(response, list) else response

        with patch(BAROBILL_CALL, new=barobill_call):
            yield calls

    def _send(self, invoice, extra_edis):
        wizard = self.create_send_and_print(invoice, extra_edis=extra_edis)
        wizard.action_send_and_print()
