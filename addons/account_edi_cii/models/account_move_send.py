import logging
import io

from odoo import _, api, fields, models, tools, SUPERUSER_ID
from odoo.tools.pdf import OdooPdfFileReader, OdooPdfFileWriter

_logger = logging.getLogger(__name__)


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    # -------------------------------------------------------------------------
    # CONSTRAINTS
    # -------------------------------------------------------------------------

    @api.model
    def _get_move_constraints(self, move):
        constraints = super()._get_move_constraints(move)
        if move._is_exportable_as_self_invoice():
            constraints.pop('not_sale_document', None)
        return constraints

    # -------------------------------------------------------------------------
    # ATTACHMENTS
    # -------------------------------------------------------------------------

    @api.model
    def _is_xml_embedded_in_pdf(self, move):
        """ Check if the invoice PDF really contains the Factur-X/ZUGFeRD XML.
        The PDF isn't regenerated when it already exists so
        it can be a plain one made before the XML embedding
        (check _hook_invoice_document_after_pdf_report_render)
        """
        pdf_content = move.invoice_pdf_report_file.content
        if b'%PDF-' not in pdf_content[:1024]:
            return False
        try:
            reader = OdooPdfFileReader(io.BytesIO(pdf_content), strict=False)
            return 'factur-x.xml' in (name.lower() for name, _data in reader.get_attachments())
        except Exception:  # noqa: BLE001
            return False

    def _get_placeholder_mail_attachments_data(self, move, invoice_edi_format=None, extra_edis=None, pdf_report=None):
        # EXTENDS 'account'
        results = super()._get_placeholder_mail_attachments_data(move, invoice_edi_format=invoice_edi_format, extra_edis=extra_edis, pdf_report=pdf_report)
        if invoice_edi_format in ('facturx', 'zugferd') and (not move.invoice_pdf_report_file or self._is_xml_embedded_in_pdf(move)):
            # The XML is embedded in the PDF itself and never added as a separate attachment
            # (see _get_invoice_files), so no placeholder for it. If the PDF is already
            # there without the XML, the XML is sent separately, so the placeholder stays.
            return results

        sending_method = self.env.context.get('sending_method')
        if move.with_context(sending_method=sending_method or {})._need_ubl_cii_xml(invoice_edi_format):
            builder = move.partner_id.commercial_partner_id._get_edi_builder(invoice_edi_format)
            filename = builder._export_invoice_filename(move)
            results.append({
                'id': f'placeholder_{filename}',
                'name': filename,
                'mimetype': 'application/xml',
                'placeholder': True,
            })
        return results

    # -------------------------------------------------------------------------
    # BUSINESS ACTIONS
    # -------------------------------------------------------------------------

    def _hook_invoice_document_before_pdf_report_render(self, invoice, invoice_data):
        # EXTENDS 'account'
        super()._hook_invoice_document_before_pdf_report_render(invoice, invoice_data)

        if invoice.with_context(sending_method=invoice_data['sending_methods'])._need_ubl_cii_xml(invoice_data['invoice_edi_format']):
            builder = invoice.partner_id.commercial_partner_id._get_edi_builder(invoice_data['invoice_edi_format'])
            xml_content, errors = (
                builder
                .with_context(from_peppol='peppol' in invoice_data['sending_methods'])
                ._export_invoice(invoice)
            )
            filename = builder._export_invoice_filename(invoice)

            # Failed.
            if errors:
                invoice_data['error'] = {
                    'error_title': _("Errors occurred while creating the EDI document (format: %s):", builder._description),
                    'errors': errors,
                }
                invoice_data['error_but_continue'] = True
            else:
                invoice_data['ubl_cii_xml_attachment_values'] = {
                    'name': filename,
                    'raw': xml_content,
                    'mimetype': 'application/xml',
                    'res_model': invoice._name,
                    'res_id': invoice.id,
                    'res_field': 'ubl_cii_xml_file',  # Binary field
                }
                invoice_data['ubl_cii_xml_options'] = {
                    'ubl_cii_format': invoice_data['invoice_edi_format'],
                    'builder': builder,
                }

    def _hook_invoice_document_after_pdf_report_render(self, invoice, invoice_data):
        # EXTENDS 'account'
        super()._hook_invoice_document_after_pdf_report_render(invoice, invoice_data)

        # Always silently generate a Factur-X and embed it inside the PDF for inter-portability
        if invoice_data.get('ubl_cii_xml_options', {}).get('ubl_cii_format') in ('facturx', 'zugferd'):
            xml_facturx = invoice_data['ubl_cii_xml_attachment_values']['raw']
        else:
            xml_facturx = self.env['account.edi.xml.cii']._export_invoice(invoice)[0]

        # during tests, no wkhtmltopdf, create the attachment for test purposes
        if tools.config['test_enable']:
            self.env['ir.attachment'].sudo().create({
                'name': 'factur-x.xml',
                'raw': xml_facturx,
                'res_id': invoice.id,
                'res_model': 'account.move',
            })
            return

        # Read pdf content.
        pdf_values = invoice_data.get('pdf_attachment_values') or invoice_data['proforma_pdf_attachment_values']
        reader_buffer = io.BytesIO(pdf_values['raw'])
        reader = OdooPdfFileReader(reader_buffer, strict=False)

        # Post-process.
        writer = OdooPdfFileWriter()
        writer.clone_reader_document_root(reader)

        writer.add_attachment('factur-x.xml', xml_facturx, subtype='text/xml', afrelationship='/Alternative')

        # PDF-A.
        # An explicit facturx/zugferd format must always be PDF/A-3, whatever the company country is
        if ((invoice_data.get('ubl_cii_xml_options', {}).get('ubl_cii_format') in ('facturx', 'zugferd')
                or (
                    invoice.commercial_partner_id.country_code in ('FR', 'DE')
                    and not invoice.commercial_partner_id._get_additional_identifier('DE_LTW')
                    and invoice.country_code in ('FR', 'DE')
                ))
                and not writer.is_pdfa
            ):
            try:
                writer.convert_to_pdfa()
            except Exception:
                _logger.exception("Error while converting to PDF/A")

            # Extra metadata to be Factur-x PDF-A compliant.
            content = self.env['ir.qweb']._render(
                'account_edi_cii.account_invoice_pdfa_3_facturx_metadata',
                {
                    'title': invoice.name,
                    'date': fields.Date.context_today(self),
                },
            )
            if "<pdfaid:conformance>B</pdfaid:conformance>" in content:
                content.replace("<pdfaid:conformance>B</pdfaid:conformance>", "<pdfaid:conformance>A</pdfaid:conformance>")
            writer.add_file_metadata(content.encode())

        # Replace the current content.
        writer_buffer = io.BytesIO()
        writer.write(writer_buffer)
        pdf_values['raw'] = writer_buffer.getvalue()
        reader_buffer.close()
        writer_buffer.close()

    def _link_invoice_documents(self, invoices_data):
        # EXTENDS 'account'
        super()._link_invoice_documents(invoices_data)

        attachments_vals = [
            invoice_data.get('ubl_cii_xml_attachment_values')
            for invoice_data in invoices_data.values()
            if invoice_data.get('ubl_cii_xml_attachment_values')
        ]
        if attachments_vals:
            self.env['ir.attachment'].with_user(SUPERUSER_ID).create(attachments_vals)
