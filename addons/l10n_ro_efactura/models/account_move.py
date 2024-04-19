import requests

from odoo import models, fields, _, api


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_ro_edi_document_ids = fields.One2many(
        comodel_name='l10n_ro_edi.document',
        inverse_name='invoice_id',
    )
    l10n_ro_edi_state = fields.Selection(
        selection=[
            ('invoice_sending', 'Sending'),
            ('invoice_sent', 'Sent'),
        ],
        string='E-Factura Status',
        compute='_compute_l10n_ro_edi_state',
        store=True,
    )

    @api.model
    def _l10n_ro_edi_create_document_invoice_sending(self, invoice, key_loading: str):
        self.env['l10n_ro_edi.document'].create({
            'invoice_id': invoice.id,
            'state': 'invoice_sending',
            'key_loading': key_loading,
        })

    @api.model
    def _l10n_ro_edi_create_document_invoice_sending_failed(self, invoice, message: str):
        self.env['l10n_ro_edi.document'].create({
            'invoice_id': invoice.id,
            'state': 'invoice_sending_failed',
            'message': message,
        })

    @api.model
    def _l10n_ro_edi_create_document_invoice_sent(self, invoice, result: dict):
        document = self.env['l10n_ro_edi.document'].create({
            'invoice_id': invoice.id,
            'state': 'invoice_sent',
            'key_signature': result['key_signature'],
            'key_certificate': result['key_certificate'],
        })
        document.attachment_id = self.env['ir.attachment'].sudo().create({
            'name': invoice._l10n_ro_edi_get_attachment_file_name(),
            'raw': result['attachment_raw'],
            'res_model': self._name,
            'res_id': document.id,
            'type': 'binary',
            'mimetype': 'application/xml',
        })

    @api.depends('l10n_ro_edi_document_ids')
    def _compute_l10n_ro_edi_state(self):
        self.l10n_ro_edi_state = False
        for move in self:
            for document in move.l10n_ro_edi_document_ids.sorted():
                if document.state in ('invoice_sending', 'invoice_sent'):
                    move.l10n_ro_edi_state = document.state
                    break

    @api.depends('l10n_ro_edi_document_ids', 'l10n_ro_edi_state')
    def _compute_show_reset_to_draft_button(self):
        """ Prevent user to reset move to draft when there's an
            active sending document or an OK response has been received """
        super()._compute_show_reset_to_draft_button()
        for move in self:
            received_error_document = (move.l10n_ro_edi_state == 'invoice_sending' and
                                       all(doc.state != 'invoice_sending_failed' for doc in move.l10n_ro_edi_document_ids))
            if move.l10n_ro_edi_state == 'invoice_sent' or received_error_document:
                move.show_reset_to_draft_button = False

    def _l10n_ro_edi_get_attachment_file_name(self):
        self.ensure_one()
        return f"ciusro_{self.name.replace('/', '_')}.xml"

    def _l10n_ro_edi_get_sending_and_failed_documents(self):
        return self.l10n_ro_edi_document_ids.filtered(lambda d: d.state in ('invoice_sending', 'invoice_sending_failed'))

    def _l10n_ro_edi_compute_errors(self, xml_data):
        """ Compute possible errors before sending E-Factura """
        self.ensure_one()
        errors = []
        if not self.company_id.l10n_ro_edi_access_token:
            errors.append(_('Romanian access token not found. Please generate or fill it in the settings.'))
        if not xml_data:
            errors.append(_('CIUS-RO XML attachment not found.'))
        return errors

    def _l10n_ro_edi_send_invoice(self, xml_data):
        """ Called by _call_web_service_after_invoice_pdf_render in account.move.send.
            The state flow of Romanian E-Factura invoice goes as follows:
             - Pre-check any errors from invoice's company before sending, return if found any
             - Send to E-Factura, and based on the result:
                 - if error -> delete all other error documents and create a new error document
                 - if success -> delete all other sending documents and create a new sending document"""
        self.ensure_one()
        if errors := self.company_id._l10n_ro_edi_get_errors_pre_request():
            self._l10n_ro_edi_get_sending_and_failed_documents().unlink()
            self._l10n_ro_edi_create_document_invoice_sending_failed(self, '\n'.join(errors))
            return

        result = self.env['l10n_ro_edi.document']._request_ciusro_send_invoice(
            company=self.company_id,
            xml_data=xml_data,
            move_type=self.move_type,
        )
        if 'error' in result:
            self._l10n_ro_edi_get_sending_and_failed_documents().unlink()
            self._l10n_ro_edi_create_document_invoice_sending_failed(self, result['error'])
        else:
            self._l10n_ro_edi_get_sending_and_failed_documents().unlink()
            self._l10n_ro_edi_create_document_invoice_sending(self, result['key_loading'])

    def _l10n_ro_edi_fetch_invoice_sending_documents(self):
        """ Collects all selected active documents in self and process them as a batch.
            Make a fetch request for each document. Based on the received result,
            if error -> generate error document on that document's invoice
            else -> immediately make a download request and process it
        """
        session = requests.session()
        to_delete_documents = self.env['l10n_ro_edi.document']

        for invoice in self.filtered(lambda inv: inv.l10n_ro_edi_state == 'invoice_sending'):
            active_sending_document = invoice.l10n_ro_edi_document_ids.filtered(lambda d: d.state == 'invoice_sending')[0]

            if errors := invoice.company_id._l10n_ro_edi_get_errors_pre_request():
                to_delete_documents |= invoice._l10n_ro_edi_get_sending_and_failed_documents()
                self._l10n_ro_edi_create_document_invoice_sending_failed(invoice, '\n'.join(errors))
                continue
            result = self.env['l10n_ro_edi.document']._request_ciusro_fetch_status(
                company=invoice.company_id,
                key_loading=active_sending_document.key_loading,
                session=session,
            )

            if 'error' in result:
                to_delete_documents |= invoice._l10n_ro_edi_get_sending_and_failed_documents()
                self._l10n_ro_edi_create_document_invoice_sending_failed(invoice, result['error'])
            elif 'key_download' in result:
                # use the obtained key_download to immediately make a download request and process them
                final_result = self.env['l10n_ro_edi.document']._request_ciusro_download_answer(
                    company=invoice.company_id,
                    key_download=result['key_download'],
                    session=session,
                )
                if 'error' in final_result:
                    to_delete_documents |= invoice._l10n_ro_edi_get_sending_and_failed_documents()
                    self._l10n_ro_edi_create_document_invoice_sending_failed(invoice, final_result['error'])
                else:
                    to_delete_documents |= invoice._l10n_ro_edi_get_sending_and_failed_documents()
                    self._l10n_ro_edi_create_document_invoice_sent(invoice, final_result)

        # Delete outdated documents in batches
        to_delete_documents.unlink()
