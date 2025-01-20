# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import json
from collections import defaultdict

from odoo import _, api, models


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    def _get_all_extra_edis(self) -> dict:
        # EXTENDS 'account'
        res = super()._get_all_extra_edis()
        res.update({'ph_eis_send': {'label': _("Send to EIS"), 'is_applicable': self._is_ph_edi_applicable}})
        return res

    def _hook_invoice_document_before_pdf_report_render(self, invoice, invoice_data):
        # EXTENDS 'account'
        super()._hook_invoice_document_before_pdf_report_render(invoice, invoice_data)
        self._generate_eis_file_data(invoice, invoice_data)

    def _call_web_service_before_invoice_pdf_render(self, invoices_data):
        # EXTENDS 'account'
        super()._call_web_service_before_invoice_pdf_render(invoices_data)

        json_contents_per_company = defaultdict(list)
        for move, move_data in invoices_data.items():
            if 'ph_eis_send' not in move_data['extra_edis']:
                continue

            if 'eis_attachment' not in move_data:
                self._generate_eis_file_data(move, move_data)

            # In case the above call ended in an error, we skip setting json_data
            if 'eis_attachment' not in move_data:
                continue
            for attachment in move_data['eis_attachment'].values():
                # Repeating the move is ok, it's more important to ensure one item per invoice on EIS to batch later on.
                json_contents_per_company[move.company_id].append((move, json.loads(attachment['raw'].decode('utf-8'))))

        if json_contents_per_company:
            errors = self.env['account.move']._l10n_ph_edi_send_invoices(json_contents_per_company)

            if errors:
                for move, move_data in invoices_data.items():
                    if move in errors:
                        move_data['error'] = {
                            'error_title': _('Error when sending the invoices to the E-invoicing service.'),
                            'errors': errors[move],
                        }

            if self._can_commit():
                self._cr.commit()

    def _link_invoice_documents(self, invoices_data):
        # EXTENDS 'account'
        super()._link_invoice_documents(invoices_data)

        attachments_vals = []
        for invoice_data in invoices_data.values():
            if 'eis_attachment' in invoice_data:
                attachments_vals.extend(invoice_data['eis_attachment'].values())

        if attachments_vals:
            attachments = self.env['ir.attachment'].sudo().create(attachments_vals)
            res_ids = attachments.mapped('res_id')
            self.env['account.move'].browse(set(res_ids)).invalidate_recordset(fnames=[
                'l10n_ph_edi_eis_vatable_file_id', 'l10n_ph_edi_eis_vatable_file',
                'l10n_ph_edi_eis_zero_rated_file_id', 'l10n_ph_edi_eis_zero_rated_file',
                'l10n_ph_edi_eis_vat_exempt_file_id', 'l10n_ph_edi_eis_vat_exempt_file',
            ])

            if self._can_commit():
                self._cr.commit()

    # ----------------
    # Business methods
    # ----------------

    @api.model
    def _is_ph_edi_applicable(self, move):
        return not move.l10n_ph_edi_invoice_state and move.company_id.l10n_ph_edi_in_use

    @api.model
    def _generate_eis_file_data(self, invoice, invoice_data):
        """ Generate the EIS json "file" for the current invoice if needed. """
        need_file = (
            (invoice_data['invoice_edi_format'] == 'ph_eis' and invoice.company_id.l10n_ph_edi_in_use)
            or 'ph_eis_send' in invoice_data['extra_edis']
        )
        if need_file:  # todo download
            errors = invoice._l10n_ph_edi_check_invoice_configuration()
            if not errors:
                json_datas = invoice._l10n_ph_edi_generate_invoice_json()
                invoice_data['eis_attachment'] = {}
                # We add up to three attachments per invoice.
                for transaction_class, json_data in json_datas.items():
                    if transaction_class == '01':
                        res_field = 'l10n_ph_edi_eis_vatable_file'
                    elif transaction_class == '02':
                        res_field = 'l10n_ph_edi_eis_zero_rated_file'
                    else:
                        res_field = 'l10n_ph_edi_eis_vat_exempt_file'
                    invoice_data['eis_attachment'][transaction_class] = {
                        'name': f'{invoice.name.replace("/", "_")}_eis_{transaction_class}.json',
                        'raw': json.dumps(json_data, ensure_ascii=False).encode('utf8'),
                        'mimetype': 'application/json',
                        'res_model': invoice._name,
                        'res_id': invoice.id,
                        'res_field': res_field,
                    }
            else:
                invoice_data['error'] = {
                    'error_title': _('Error when generating the Json data to send to the EIS.'),
                    'errors': errors,
                }
