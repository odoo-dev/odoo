import uuid

from odoo import _, api, models
from odoo.exceptions import UserError


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _l10n_sa_edi_create_document(self):
        self.ensure_one()
        self.l10n_sa_edi_document_id = self.env['l10n_sa_edi.document'].create({
            'res_id': self.id,
            'res_model': 'account.move',
            'state': 'to_send',
        })

    def _get_qr_code_str_dependencies(self):
        return ['amount_total_signed', 'amount_tax_signed', 'l10n_sa_confirmation_datetime', 'company_id',
                'company_id.vat', 'journal_id', 'journal_id.l10n_sa_production_csid_json', 'l10n_sa_edi_document_id',
                'l10n_sa_invoice_signature', 'l10n_sa_chain_index', 'state']

    def _l10n_sa_is_applicable(self):
        return super()._l10n_sa_is_applicable() and self.move_type in ('out_invoice', 'out_refund') and self.l10n_sa_edi_document_id and self.state != 'draft'

    @api.ondelete(at_uninstall=False)
    def _prevent_zatca_rejected_invoice_deletion(self):
        # Prevent deletion of ZATCA-rejected invoices in production mode
        descr = 'Rejected ZATCA Document not to be deleted - ثيقة ZATCA المرفوضة لا يجوز حذفها'
        for move in self:
            if move.country_code == "SA" and \
               move.company_id.l10n_sa_edi_is_production and \
               move.attachment_ids.filtered(lambda a: a.description == descr and a.res_model == 'account.move'):
                raise UserError(_("The Invoice(s) are linked to a validated EDI document and cannot be modified according to ZATCA rules"))

    # def _compute_qr_code_str(self):
    #     """ Override to update QR code generation in accordance with ZATCA Phase 2"""
    #     phase_one_moves = self.env['account.move']
    #     for move in self:
    #         zatca_document = move.l10n_sa_edi_document_id
    #         if move.country_code == 'SA' and move.move_type in ('out_invoice', 'out_refund') and zatca_document and move.state != 'draft':
    #             qr_code_str = ''
    #             if move._l10n_sa_is_simplified():
    #                 x509_cert = move.journal_id.l10n_sa_production_csid_certificate_id
    #                 xml_content = self.l10n_sa_edi_document_id._l10n_sa_generate_zatca_template()
    #                 qr_code_str = move._l10n_sa_get_qr_code(move.company_id, xml_content, x509_cert,
    #                                                         move.l10n_sa_invoice_signature, True)
    #                 qr_code_str = b64encode(qr_code_str).decode()
    #             elif zatca_document.state == 'accepted' and zatca_document.attachment_id.datas:
    #                 document_xml = zatca_document.attachment_id.with_context(bin_size=False).datas.decode()
    #                 root = etree.fromstring(b64decode(document_xml))
    #                 qr_node = root.xpath('//*[local-name()="ID"][text()="QR"]/following-sibling::*/*')[0]
    #                 qr_code_str = qr_node.text
    #             move.l10n_sa_qr_code_str = qr_code_str
    #         else:
    #             # In the case where the Invoice is not a ZATCA invoice, or is Phase 1, or is not confirmed,
    #             # we call super to trigger the initial QR code generation for Phase 1
    #             phase_one_moves |= move
    #     super(AccountMove, phase_one_moves)._compute_qr_code_str()

    def _l10n_sa_check_billing_reference(self):
        """
        Make sure credit/debit notes have a either a reveresed move or debited move or a customer reference
        """
        self.ensure_one()
        return self.debit_origin_id or self.reversed_entry_id or self.ref

    @api.depends('state', 'l10n_sa_edi_document_id.state')
    def _compute_edi_show_cancel_button(self):
        """
        Override to hide the EDI Cancellation button at all times for ZATCA Invoices
        """
        super()._compute_edi_show_cancel_button()
        for move in self.filtered(lambda m: m.is_invoice() and m.country_code == 'SA'):
            move.edi_show_cancel_button = False

    @api.depends('state')
    def _compute_show_reset_to_draft_button(self):
        """
        Override to hide the Reset to Draft button for ZATCA Invoices that have been successfully submitted
        in Production mode.
        """
        super()._compute_show_reset_to_draft_button()
        for move in self:
            # The "Reset to Draft" button should be hidden in the following cases:
            # - Invoice has been successfully submitted in Production mode.
            # - The invoice submission encountered a timed out, regardless of the API mode.
            if move.l10n_sa_chain_index and (move.company_id.l10n_sa_edi_is_production or not move.l10n_sa_edi_document_id._l10n_sa_is_in_chain()):
                move.show_reset_to_draft_button = False

    def button_draft(self):
        # OVERRIDE
        for move in self:
            if move.country_code == "SA" and move.l10n_sa_chain_index and move.company_id.l10n_sa_edi_is_production:
                raise UserError(_("The Invoice(s) are linked to a validated EDI document and cannot be modified according to ZATCA rules"))
        return super().button_draft()

    def _l10n_sa_reset_confirmation_datetime(self):
        """ OVERRIDE: we want rejected phase 2 invoices to keep the original confirmation datetime"""
        for move in self.filtered(lambda m: m.country_code == 'SA'):
            zatca_doc = move.l10n_sa_edi_document_id
            if not zatca_doc or zatca_doc[0].blocking_level != 'error':  # Error is the rejection case
                move.l10n_sa_confirmation_datetime = False

    def _l10n_sa_generate_unsigned_data(self):
        """
        Generate UUID and digital signature to be used during both Signing and QR code generation.
        It is necessary to save the signature as it changes everytime it is generated and both the signing and the
        QR code expect to have the same, identical signature.
        """
        self.ensure_one()
        # Build the dict of values to be used for generating the Invoice XML content
        # Set Invoice field values required for generating the XML content, hash and signature
        self.l10n_sa_uuid = uuid.uuid4()
        # We generate the XML content
        xml_content = self.l10n_sa_edi_document_id._l10n_sa_generate_zatca_template()
        # Once the required values are generated, we hash the invoice, then use it to generate a Signature
        invoice_hash_hex = self.env['account.edi.xml.ubl_21.zatca']._l10n_sa_generate_invoice_xml_hash(xml_content).decode()
        self.l10n_sa_invoice_signature = self.env['l10n_sa_edi.document']._l10n_sa_get_digital_signature(self.journal_id.company_id,
                                                                                   invoice_hash_hex).decode()
        return xml_content

    def _is_l10n_sa_eligibile_invoice(self):
        self.ensure_one()
        return self.is_invoice() and self.l10n_sa_confirmation_datetime and self.country_code == 'SA'

    def _l10n_sa_is_legal(self):
        # Extends l10n_sa
        # Accounts for both ZATCA phases
        # Phase 1: no documents
        # Phase 2: checks the state of documents
        self.ensure_one()
        result = super()._l10n_sa_is_legal()
        zatca_document = self.l10n_sa_edi_document_id
        return result or (self.company_id.country_id.code == 'SA' and zatca_document and self.l10n_sa_edi_state == "accepted")

    def _get_report_base_filename(self):
        """
        Generate the name of the invoice PDF file according to ZATCA business rules:
        Seller Vat Number (BT-31), Date (BT-2), Time (KSA-25), Invoice Number (BT-1)
        """
        if self._is_l10n_sa_eligibile_invoice():
            return self.with_context(l10n_sa_file_format=False).env['account.edi.xml.ubl_21.zatca']._export_invoice_filename(self)
        return super()._get_report_base_filename()

    def _get_invoice_report_filename(self, extension='pdf', report=None):
        if self._is_l10n_sa_eligibile_invoice():
            return self.with_context(l10n_sa_file_format=extension).env['account.edi.xml.ubl_21.zatca']._export_invoice_filename(self)
        return super()._get_invoice_report_filename(extension, report)

    def _prepare_tax_lines_for_taxes_computation(self, tax_amls, round_from_tax_lines):
        """
        If the final invoice has downpayment lines, we skip the tax correction, as we need to recalculate tax amounts
        without taking into account those lines
        """
        if self.country_code == 'SA' and not self._is_downpayment() and self.line_ids._get_downpayment_lines():
            return []
        return super()._prepare_tax_lines_for_taxes_computation(tax_amls, round_from_tax_lines)

    def _get_l10n_sa_totals(self):
        self.ensure_one()
        invoice_node = self.env['account.edi.xml.ubl_21.zatca']._get_invoice_node({'invoice': self})
        return {
            'total_amount': invoice_node['cac:LegalMonetaryTotal']['cbc:TaxInclusiveAmount']['_text'],
            'total_tax': invoice_node['cac:TaxTotal'][-1]['cbc:TaxAmount']['_text'],
        }

    def action_show_chain_head(self):
        """
        Action to show the chain head of the invoice
        """
        self.ensure_one()
        return self.l10n_sa_edi_document_id.l10n_sa_edi_chain_head_id._get_records_action(name=_("Chain Head"))


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    def _apply_retention_tax_filter(self, tax_values):
        return not tax_values['tax_id'].l10n_sa_is_retention

    def _is_global_discount_line(self):
        """
        Any line that has a negative amount and is not linked to a down-payment is considered as a
        global discount line. These can be created either manually, or through a promotions program.
        """
        self.ensure_one()
        return not self._get_downpayment_lines() and self.price_subtotal < 0

    @api.depends('price_subtotal', 'price_total')
    def _compute_tax_amount(self):
        super()._compute_tax_amount()
        AccountTax = self.env['account.tax']
        for line in self:
            if (
                line.move_id.country_code == 'SA'
                and line.move_id.is_invoice(include_receipts=True)
                and line.display_type == 'product'
            ):
                base_line = line.move_id._prepare_product_base_line_for_taxes_computation(line)
                AccountTax._add_tax_details_in_base_line(base_line, line.company_id)
                AccountTax._round_base_lines_tax_details([base_line], line.company_id)
                line.l10n_gcc_invoice_tax_amount = sum(
                    tax_data['tax_amount_currency']
                    for tax_data in base_line['tax_details']['taxes_data']
                    if not tax_data['tax'].l10n_sa_is_retention
                )
