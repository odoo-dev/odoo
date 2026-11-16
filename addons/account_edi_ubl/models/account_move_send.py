import base64

from lxml import etree

from odoo import _, api, models
from odoo.tools import cleanup_xml_node

from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_cii.models.account_edi_common import SUPPORTED_FILE_TYPES


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    # -------------------------------------------------------------------------
    # ALERTS
    # -------------------------------------------------------------------------

    def _get_alerts(self, moves, moves_data):
        # EXTENDS 'account'
        alerts = super()._get_alerts(moves, moves_data)

        peppol_formats = set(self.env['res.partner']._get_peppol_formats())
        if peppol_format_moves := moves.filtered(lambda m: moves_data[m]['invoice_edi_format'] in peppol_formats):
            not_configured_company_partners = peppol_format_moves.company_id.partner_id.filtered(
                lambda partner: not partner.routing_identifier
            )
            if not_configured_company_partners:
                alerts['account_edi_ubl_configure_company'] = {
                    'message': _("Please fill in your company's VAT or Peppol Address to generate a complete XML file."),
                    'level': 'info',
                    'action_text': _("Configure"),
                    'action': not_configured_company_partners._get_records_action(),
                }
            not_configured_partners = peppol_format_moves.partner_id.commercial_partner_id.filtered(
                lambda partner: not partner.routing_identifier
            )
            if not_configured_partners:
                alerts['account_edi_ubl_configure_partner'] = {
                    'message': _("Please fill in partner's VAT or Peppol Address."),
                    'level': 'info',
                    'action_text': _("View Partner(s)"),
                    'action': not_configured_partners._get_records_action(name=_("Check Partner(s)"))
                }

            if any(
                    self.env['account.edi.xml.ubl_bis3']._is_customer_behind_chorus_pro(partner)
                    for partner in peppol_format_moves.partner_id.commercial_partner_id
                ):
                chorus_pro = self.env['ir.module.module'].sudo().search([('name', '=', 'l10n_fr_facturx_chorus_pro')], limit=1)
                if chorus_pro and chorus_pro.state != 'installed':
                    alerts['account_edi_ubl_chorus_pro_install'] = {
                        'message': _("Please install the french Chorus pro module to have all the specific rules."),
                        'level': 'info',
                        'action': chorus_pro._get_records_action(),
                        'action_text': _("Install Chorus Pro"),
                    }
        return alerts

    # -------------------------------------------------------------------------
    # ATTACHMENTS
    # -------------------------------------------------------------------------

    @api.model
    def _display_attachments_widget(self, edi_format, sending_methods):
        ubl_format_info = self.env['res.partner']._get_ubl_cii_formats_info()
        return (
            super()._display_attachments_widget(edi_format, sending_methods)
            or ubl_format_info.get(edi_format, {}).get('embed_attachments')
        )

    @api.model
    def _get_ubl_available_attachments(self, mail_attachments_widget, invoice_edi_format):
        if not invoice_edi_format or not mail_attachments_widget:
            return self.env['ir.attachment'], self.env['ir.attachment']
        attachment_ids = [values['id'] for values in mail_attachments_widget if values.get('manual') or values.get('mail_template_id')]
        attachments = self.env['ir.attachment'].browse(attachment_ids)

        ubl_format_info = self.env['res.partner']._get_ubl_cii_formats_info().get(invoice_edi_format, {})
        if not ubl_format_info.get('embed_attachments'):
            return self.env['ir.attachment'], attachments

        accepted_attachments = attachments.filtered(lambda attachment: attachment.mimetype in SUPPORTED_FILE_TYPES)
        return accepted_attachments, attachments - accepted_attachments

    # -------------------------------------------------------------------------
    # BUSINESS ACTIONS
    # -------------------------------------------------------------------------

    def _hook_invoice_document_after_pdf_report_render(self, invoice, invoice_data):
        # EXTENDS 'account_edi_cii'
        # Add the PDF to the UBL XML, before the Factur-X XML is embedded in the PDF.
        if self._needs_ubl_postprocessing(invoice_data):
            self._postprocess_invoice_ubl_xml(invoice, invoice_data)
        super()._hook_invoice_document_after_pdf_report_render(invoice, invoice_data)

    @api.model
    def _needs_ubl_postprocessing(self, invoice_data):
        return 'ubl_cii_xml_options' in invoice_data and invoice_data['ubl_cii_xml_options']['ubl_cii_format'] not in ('facturx', 'zugferd')

    @api.model
    def _postprocess_invoice_ubl_xml(self, invoice, invoice_data):
        """
        Include the PDF in the UBL as an AdditionalDocumentReference element.

        According to UBL 2.1 standard, the AdditionalDocumentReference element should be
        placed above ProjectReference which isn't usually in xml files.
        So usually it's set above AccountingSupplierParty. Here, we try to find a suitable anchor point among
        the available element to insert our PDF attachment. If none of these are found, we
        skip adding the attachment to avoid breaking the XML structure.
        Inside CreditNote, the ProjectReference element is not used in xml.
        So we look for OriginatorDocumentReference instead.
        """
        tree = etree.fromstring(bytes(invoice_data['ubl_cii_xml_attachment_values']['raw']))

        localname = etree.QName(tree).localname
        anchor_xpath = {
            'Invoice': "//*[local-name()='ProjectReference' or local-name()='Signature' or local-name()='AccountingSupplierParty']",
            'CreditNote': "//*[local-name()='StatementDocumentReference' or local-name()='OriginatorDocumentReference' or local-name()='Signature' or local-name()='AccountingSupplierParty']",
            'DebitNote': "//*[local-name()='Signature' or local-name()='AccountingSupplierParty']",
        }.get(localname)

        anchor_elements = tree.xpath(anchor_xpath)

        if not anchor_elements:
            return

        anchor_index = tree.index(anchor_elements[0])
        if invoice_pdf := invoice.invoice_pdf_report_file:
            pdf_values = {'name': invoice_pdf.filename, 'raw': invoice_pdf, 'mimetype': invoice_pdf.mimetype}
        else:
            pdf_values = invoice_data.get('pdf_attachment_values') or invoice_data['proforma_pdf_attachment_values']

        edi_model = invoice_data["ubl_cii_xml_options"]["builder"]
        doc_type_code_node = edi_model._get_document_type_code_node(invoice, invoice_data)
        nsmap = edi_model._get_document_nsmap(edi_model._init_invoice_export_values(invoice))

        attachments_to_embed = [
            {
                'filename': attachment.name,
                'raw': attachment.raw,
                'mimetype': attachment.mimetype,
            }
            for attachment in self._get_ubl_available_attachments(
                invoice_data['mail_attachments_widget'],
                invoice_data['invoice_edi_format']
            )[0]
        ] if invoice_data.get('mail_attachments_widget') else []
        attachments_to_embed.append({
            'filename': pdf_values['name'],
            'raw': bytes(pdf_values['raw']),
            'mimetype': pdf_values['mimetype'],
            'document_type_node': doc_type_code_node,
        })

        for attachment_values in attachments_to_embed:
            additional_document_reference_node = {
                '_tag': 'cac:AdditionalDocumentReference',
                'cbc:ID': {'_text': attachment_values['filename']},
                'cbc:DocumentTypeCode': attachment_values.get('document_type_node'),
                'cac:Attachment': {
                    'cbc:EmbeddedDocumentBinaryObject': {
                        '_text': base64.b64encode(attachment_values['raw']).decode(),
                        'mimeCode': attachment_values['mimetype'],
                        'filename': attachment_values['filename']
                    }
                }
            }
            tree.insert(anchor_index, dict_to_xml(additional_document_reference_node, nsmap=nsmap))

        invoice_data['ubl_cii_xml_attachment_values']['raw'] = etree.tostring(
            cleanup_xml_node(tree), xml_declaration=True, encoding='UTF-8'
        )
