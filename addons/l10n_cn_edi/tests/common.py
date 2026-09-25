# Part of Odoo. See LICENSE file for full copyright and licensing details.
from unittest.mock import patch

from odoo.addons.account.tests.test_account_move_send import TestAccountMoveSendCommon
from odoo.addons.l10n_cn_edi.tools import L10nCnEdiClient


class FakeClient(L10nCnEdiClient):
    """A provider that answers from ``responses`` and records every call in ``calls``."""

    def __init__(self, company, responses):
        super().__init__(company)
        self.responses = responses
        self.calls = []

    def _answer(self, method, *args):
        self.calls.append((method, args))
        response = self.responses.get(method)
        if isinstance(response, Exception):
            raise response
        return response() if callable(response) else response

    def ensure_ready(self):
        return self._answer('ensure_ready')

    def issue_invoice(self, values):
        return self._answer('issue_invoice', values)

    def wait(self, seconds):
        self.calls.append(('wait', (seconds,)))

    def query_invoice(self, move, just_submitted=False):
        return self._answer('query_invoice', move, just_submitted)

    def request_red_form(self, values):
        return self._answer('request_red_form', values)

    def query_red_form(self, document):
        return self._answer('query_red_form', document)

    def operate_red_form(self, document, action):
        return self._answer('operate_red_form', document, action)

    def list_inbound_red_forms(self, date_from, date_to):
        return self._answer('list_inbound_red_forms', date_from, date_to) or []


class L10nCnEdiTestCommon(TestAccountMoveSendCommon):

    @classmethod
    @TestAccountMoveSendCommon.setup_country('cn')
    def setUpClass(cls):
        super().setUpClass()
        cls.company_data['company'].vat = '91310115MA1K39423D'
        cls.partner_a.country_id = cls.env.ref('base.cn')
        tax_category = cls.env['l10n_cn_edi.tax.category'].sudo().create({'name': 'Test', 'code': '1010101010000000000'})
        (cls.product_a + cls.product_b).product_tmpl_id.l10n_cn_tax_category_id = tax_category

    def setUp(self):
        super().setUp()
        self.responses = {}
        self.client = FakeClient(self.company_data['company'], self.responses)
        Company = self.env.registry['res.company']
        patch.object(Company, '_l10n_cn_edi_is_ready', lambda company: True).start()
        patch.object(Company, '_l10n_cn_edi_get_client', lambda company: self.client).start()
        self.addCleanup(patch.stopall)

    def _issue(self, invoice):
        """Issue through the send flow; return the invoice's error, or None."""
        return self.env['account.move.send']._l10n_cn_edi_issue_invoices(invoice).get(invoice)

    def _create_posted_invoice(self, fapiao_no=None):
        invoice = self.init_invoice('out_invoice', partner=self.partner_a, products=self.product_a, taxes=self.tax_sale_a)
        invoice.action_post()
        if fapiao_no:
            invoice.l10n_cn_edi_fapiao_no = fapiao_no
        return invoice

    def _reverse(self, invoice, reason='02'):
        wizard = self.env['account.move.reversal'].with_context(
            active_ids=invoice.ids,
            active_model='account.move',
        ).create({
            'journal_id': invoice.journal_id.id,
            'reason': 'placeholder',
            'l10n_cn_edi_red_form_reason': reason,
        })
        wizard.reverse_moves()
        return wizard.new_move_ids
