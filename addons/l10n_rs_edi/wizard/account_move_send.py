from odoo import _, api, fields, models, SUPERUSER_ID


class AccountMoveSend(models.TransientModel):
    _inherit = 'account.move.send'

    l10n_rs_edi_send_enable = fields.Boolean(compute="_compute_l10n_rs_edi_send_enable")
    l10n_rs_edi_send_readonly = fields.Boolean(compute="_compute_l10n_rs_edi_send_readonly")
    l10n_rs_edi_send_checkbox = fields.Boolean(
        string="eFaktura",
        compute="_compute_l10n_rs_edi_send_checkbox",
        store=True, readonly=False,
        help="Send the E-Invoice to the Governoment via eFaktura"
        )

    @api.depends('move_ids')
    def _compute_l10n_rs_edi_send_readonly(self):
        for wizard in self:
            wizard.l10n_rs_edi_send_readonly = all(move.l10n_rs_edi_state == 'sent' for move in wizard.move_ids)

    @api.depends('move_ids')
    def _compute_l10n_rs_edi_send_enable(self):
        for wizard in self:
            wizard.l10n_rs_edi_send_enable = any(move.l10n_rs_edi_is_eligible for move in wizard.move_ids)

    @api.depends('l10n_rs_edi_send_enable')
    def _compute_l10n_rs_edi_send_checkbox(self):
        for wizard in self:
            wizard.l10n_rs_edi_send_checkbox = wizard.l10n_rs_edi_send_enable

    def _get_wizard_values(self):
        # EXTENDS 'account'
        vals = super()._get_wizard_values()
        vals['l10n_rs_edi_send'] = self.l10n_rs_edi_send_checkbox
        return vals

    @api.model
    def _get_wizard_vals_restrict_to(self, only_options):
        # EXTENDS 'account'
        values = super()._get_wizard_vals_restrict_to(only_options)
        return {
            'l10n_rs_edi_send_checkbox': False,
            **values,
        }

    @api.model
    def _need_invoice_document(self, invoice):
        # EXTENDS 'account'
        return super()._need_invoice_document(invoice) and not invoice.l10n_rs_edi_attachment_id

    @api.model
    def _get_invoice_extra_attachments(self, invoice):
        # EXTENDS 'account'
        return super()._get_invoice_extra_attachments(invoice) + invoice.l10n_rs_edi_attachment_id

    @api.model
    def _call_web_service_after_invoice_pdf_render(self, invoices_data):
        # EXTENDS 'account'
        super()._call_web_service_after_invoice_pdf_render(invoices_data)
        for invoice, invoice_data in invoices_data.items():
            # Not all invoices may need EDI.
            if not invoice_data.get("l10n_rs_edi_send") or not invoice.l10n_rs_edi_is_eligible:
                continue

            xml, errors = self.env['account.edi.xml.ubl.rs']._export_invoice(invoice)
            if errors:
                invoice_data["error"] = {
                    "error_title": _("Errors when generating the UBL document:"),
                    "errors": errors,
                }
                continue
            else:
                invoice_data['l10n_rs_edi_attachement_values'] = invoice._l10n_rs_edi_get_attachment_values(xml)

            if error := invoice.with_company(invoice.company_id)._l10n_rs_edi_send(xml):
                invoice_data["error"] = {
                    "error_title": _("Errors when submitting the e-invoice to eFaktura:"),
                    "errors": error,
                }

            if self._can_commit():
                self._cr.commit()

    @api.model
    def _link_invoice_documents(self, invoice, invoice_data):
        # EXTENDS 'account'
        super()._link_invoice_documents(invoice, invoice_data)
        if attachment_values := invoice_data.get('l10n_rs_edi_attachement_values'):
            self.env['ir.attachment'].with_user(SUPERUSER_ID).create(attachment_values)
            invoice.invalidate_recordset(fnames=['l10n_rs_edi_attachment_id', 'l10n_rs_edi_attachment_file'])
