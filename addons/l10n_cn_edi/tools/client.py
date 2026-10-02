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
    ``pdf``         the fapiao PDF as bytes, once issued, with ``pdf_filename``: the
                    copy that goes out with the invoice email
    ``ofd``         the fapiao OFD as bytes, with ``ofd_filename``: the legal original
                    voucher, kept on the invoice
    ``error``       human-readable reason, when failed
    ``new_serial``  set on a failure when the order is dead (refused, failed, voided), so
                    the next attempt may use a new serial number. Otherwise it reuses
                    the old one: a new serial for an order that may still go through
                    would issue a second fapiao
    ``amount_untaxed``, ``amount_tax``, ``amount_total``
                    optional, once issued: the amounts the provider issued. The flow warns
                    on the move when they differ from its own, e.g. when the invoice was
                    edited and resent under a serial the provider had already issued

Issuing is two steps, so a batch waits once instead of once per invoice:
``issue_invoice`` submits and usually answers 'sent'; after each of the client's
``result_delays`` the flow asks ``query_invoice(move, just_submitted=True)`` about
the batch's pending fapiao, and leaves whatever is still pending to the cron. The cron
keeps passing ``just_submitted=True`` for 10 minutes after the submission.

A provider with ``supports_direct_red()`` issues the red fapiao of a credit note without
a red form: ``issue_direct_red`` and ``query_direct_red`` answer invoice results.

Invoice values carry, per line, ``price_include`` (the Odoo tax's basis) and both
``amount_untaxed`` and ``amount_total``, so a provider can send whichever basis the
line was priced in and still match the Odoo invoice to the fen.

``red form result`` (request_red_form, query_red_form, list_inbound_red_forms items)
    ``uuid``, ``number``       the provider's and the bureau's identifiers
    ``bureau_state``           the tax bureau's 01-10 code (see BUREAU_STATES), or
                               False while the bureau hasn't registered the form
    ``red_fapiao_no``          the red fapiao number, once issued
    ``red_fapiao_date``        naive UTC ``datetime``, once issued
    ``pdf``, ``ofd``           the red fapiao's files, as for an invoice result
    ``error``                  human-readable reason, when refused
    inbound items also carry ``original_fapiao_no``, ``amount_untaxed``,
    ``amount_tax`` and ``reason``.

``session state`` (get_session_state)
    'ok', 'login' (the drawer is logged out of the tax bureau) or 'verify' (the
    bureau wants the drawer's identity confirmed, 实名认证). Anything but 'ok' holds
    the invoices as 'waiting_login' until someone logs in through the provider's
    ``res.company._l10n_cn_edi_action_login()``.

Problems other than a refusal are raised:

- ``UserError`` means nothing was submitted (configuration, credentials, the provider
  unreachable before the request left): the flow keeps the move as it was, to be fixed
  and sent again.
- :class:`L10nCnEdiProviderUnreachable` means the request may have reached the provider
  but its answer didn't come back: a timeout or a connection reset after sending, an
  unreadable answer. The fapiao may be issued, so after ``issue_invoice`` or
  ``issue_direct_red`` the flow locks the move as 'sent' and the cron queries it with
  the same serial number until the provider tells. Elsewhere it is a ``UserError``.
"""
import time

from odoo.exceptions import UserError


class L10nCnEdiProviderUnreachable(UserError):
    """The request may have reached the provider, whose answer was lost: the outcome is unknown."""


class L10nCnEdiClient:

    # Seconds to wait before each follow-up query of freshly submitted fapiao.
    result_delays = ()

    def __init__(self, company):
        self.company = company

    def wait(self, seconds):
        time.sleep(seconds)

    def ensure_ready(self):
        """Raise a UserError if the company can't issue right now (credentials, session...)."""
        raise NotImplementedError

    def get_session_state(self):
        """The drawer's tax bureau session: 'ok', 'login' or 'verify'."""
        return 'ok'

    def issue_invoice(self, values):
        """Submit a fapiao from ``account.move._l10n_cn_edi_prepare_invoice_values()``."""
        raise NotImplementedError

    def supports_direct_red(self):
        """Whether out_refund uses direct red issuance (no confirmation-form lifecycle)."""
        return False

    def issue_direct_red(self, values):
        """Submit a direct red invoice from ``_l10n_cn_edi_prepare_red_form_values()``.

        Providers with ``supports_direct_red()`` must return an invoice result dict.
        """
        raise NotImplementedError

    def query_direct_red(self, move, just_submitted=False):
        """Fetch the result of a direct-red invoice previously accepted as 'sent'."""
        raise NotImplementedError

    def query_invoice(self, move, just_submitted=False):
        """Fetch the current result of a fapiao that was accepted as 'sent'.

        Shortly after submitting (``just_submitted``), a fapiao the provider doesn't know
        yet is still 'sent'; later, it is 'failed'.
        """
        raise NotImplementedError

    def request_red_form(self, values):
        """Submit a red letter confirmation form from ``_l10n_cn_edi_prepare_red_form_values()``.

        Only full reversals are sent: the bureau's partial-red rules depend on the buyer's
        bookkeeping and may change, and every provider advises against them.
        """
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
