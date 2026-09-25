# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, models
from odoo.exceptions import UserError


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    @api.model
    def _is_cn_edi_applicable(self, move):
        return (
            move.country_code == 'CN'
            and move.move_type == 'out_invoice'
            and move.state == 'posted'
            and move.l10n_cn_edi_state not in ('issued', 'sent')
        )

    def _get_all_extra_edis(self):
        # EXTENDS 'account'
        res = super()._get_all_extra_edis()
        res['cn_edi'] = {
            'label': self.env._("e-Fapiao"),
            'is_applicable': self._is_cn_edi_applicable,
            'help': self.env._("Issue the official Chinese e-Fapiao of the invoice."),
        }
        return res

    @api.model
    def _get_invoice_extra_attachments(self, move):
        # EXTENDS 'account'
        return super()._get_invoice_extra_attachments(move) + move.l10n_cn_edi_fapiao_pdf_id

    @api.model
    def _call_web_service_before_invoice_pdf_render(self, invoices_data):
        # EXTENDS 'account'
        super()._call_web_service_before_invoice_pdf_render(invoices_data)
        invoices = self.env['account.move'].union(*(
            invoice
            for invoice, invoice_data in invoices_data.items()
            if 'cn_edi' in invoice_data.get('extra_edis', set())
        ))
        for invoice, error in self._l10n_cn_edi_issue_invoices(invoices).items():
            invoices_data[invoice]['error'] = {
                'error_title': self.env._("Error when issuing the e-Fapiao:"),
                'errors': [error],
            }

    @api.model
    def _l10n_cn_edi_issue_invoices(self, invoices):
        """Issue the e-Fapiao of ``invoices``: submit them all, then follow up on them together.

        Return ``{invoice: error message}`` for those that couldn't be issued.
        """
        errors = {}
        for company, company_invoices in invoices.grouped('company_id').items():
            if not company._l10n_cn_edi_is_ready():
                errors.update(dict.fromkeys(company_invoices, self.env._(
                    "E-Fapiao is not set up for %s. Please go to Settings.", company.name,
                )))
                continue
            client = company._l10n_cn_edi_get_client()
            try:
                client.ensure_ready()
            except UserError as e:
                errors.update(dict.fromkeys(company_invoices, str(e)))
                continue
            for invoice in company_invoices:
                if error := invoice._l10n_cn_edi_submit_invoice(client):
                    errors[invoice] = error
                if self._can_commit():
                    # The provider holds the fapiao now: rolling back the send must not forget it.
                    self.env.cr.commit()
            errors.update(company_invoices._l10n_cn_edi_fetch_submitted(client))
            if self._can_commit():
                self.env.cr.commit()
        return errors
