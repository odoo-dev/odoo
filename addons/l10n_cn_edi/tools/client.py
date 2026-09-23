# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""The contract between the e-Fapiao flow and a provider.

A provider module overrides ``res.company._l10n_cn_edi_get_client()`` to return
an instance of a subclass of :class:`L10nCnEdiClient`. The flow in this module
never sees a provider's field names, codes or transport: it hands over the
neutral values built by ``account.move`` and reads back the neutral results
described below.

Results are plain dicts:

``invoice result`` (issue_invoice, query_invoice)
    ``state``       'issued', 'sent' (accepted, result pending) or 'failed'
    ``fapiao_no``   the 数电 number, once issued
    ``fapiao_date`` naive UTC ``datetime``, once issued
    ``qr_code``     QR payload, if the provider returns one
    ``error``       human-readable reason, when failed

``red form result`` (request_red_form, query_red_form, list_inbound_red_forms items)
    ``uuid``, ``number``       the provider's and the bureau's identifiers
    ``bureau_state``           the tax bureau's 01-10 code (see BUREAU_STATES)
    ``red_fapiao_no``          the red fapiao number, once issued
    ``red_fapiao_date``        naive UTC ``datetime``, once issued
    ``error``                  human-readable reason, when refused
    inbound items also carry ``original_fapiao_no``, ``amount_untaxed``,
    ``amount_tax`` and ``reason``.

Connectivity and configuration problems are raised as ``UserError``: the flow
treats them as "try again later" and never marks the invoice failed for them.
"""


class L10nCnEdiClient:

    def __init__(self, company):
        self.company = company

    def ensure_ready(self):
        """Raise a UserError if the company can't issue right now (credentials, session...)."""
        raise NotImplementedError

    def issue_invoice(self, values):
        """Issue a blue or red fapiao from ``account.move._l10n_cn_edi_prepare_invoice_values()``."""
        raise NotImplementedError

    def query_invoice(self, move):
        """Fetch the current result of a fapiao that was accepted as 'sent'."""
        raise NotImplementedError

    def request_red_form(self, values):
        """Submit a red letter confirmation form from ``_l10n_cn_edi_prepare_red_form_values()``."""
        raise NotImplementedError

    def query_red_form(self, document):
        """Fetch the current state of the red form tracked by ``document``."""
        raise NotImplementedError

    def operate_red_form(self, document, action):
        """Act on a red form: ``action`` is 'confirm', 'reject' or 'revoke'."""
        raise NotImplementedError

    def list_inbound_red_forms(self, date_from, date_to):
        """Red forms raised by suppliers against this company, as a list of red form results."""
        raise NotImplementedError
