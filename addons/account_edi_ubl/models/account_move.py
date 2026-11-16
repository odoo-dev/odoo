from base64 import b64decode
from contextlib import suppress
import binascii

from lxml import etree

from odoo import api, models
from odoo.tools.mimetypes import guess_mimetype


class AccountMove(models.Model):
    _inherit = 'account.move'

    # -------------------------------------------------------------------------
    # EDI
    # -------------------------------------------------------------------------

    def _get_import_file_type(self, file_data):
        """ Identify UBL files. """
        # EXTENDS 'account'
        if (tree := file_data['xml_tree']) is not None:
            if etree.QName(tree).localname == 'AttachedDocument':
                return 'account.edi.xml.ubl.attached_document'
            if customization_id := tree.findtext('{*}CustomizationID'):
                if 'xrechnung' in customization_id:
                    return 'account.edi.xml.ubl_de'
                if customization_id == 'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0':
                    return 'account.edi.xml.ubl_nl'
                if customization_id == 'urn:cen.eu:en16931:2017#conformant#urn:fdc:peppol.eu:2017:poacc:billing:international:aunz:3.0':
                    return 'account.edi.xml.ubl_a_nz'
                if customization_id == 'urn:cen.eu:en16931:2017#conformant#urn:fdc:peppol.eu:2017:poacc:billing:international:sg:3.0':
                    return 'account.edi.xml.ubl_sg'
                if customization_id == 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0':
                    return 'account.edi.xml.ubl_bis3'
            if tree.findtext('{*}UBLVersionID') in ('2.0', '2.1', '2.2', '2.3'):
                # Any other UBL document: use the generic UBL syntax.
                return 'account.edi.ubl'
            if customization_id := tree.findtext('{*}CustomizationID'):
                if 'urn:cen.eu:en16931:2017' in customization_id:
                    return 'account.edi.xml.ubl_bis3'

        return super()._get_import_file_type(file_data)

    def _unwrap_attachment(self, file_data, recurse=True):
        """ Unwrap UBL AttachedDocument files, which are wrappers around an inner file. """

        if file_data['import_file_type'] != 'account.edi.xml.ubl.attached_document':
            return super()._unwrap_attachment(file_data, recurse)

        content, tree = self._ubl_parse_attached_document(file_data['xml_tree'])
        if not content:
            return []

        embedded_file_data = {
            'name': file_data['name'],
            'raw': content,
            'xml_tree': tree,
            'mimetype': guess_mimetype(content),
            'attachment': None,
            'origin_attachment': file_data['origin_attachment'],
            'origin_import_file_type': file_data['origin_import_file_type'],
        }
        embedded_file_data['import_file_type'] = self._get_import_file_type(embedded_file_data)

        embedded = [embedded_file_data]
        if recurse:
            embedded.extend(self._unwrap_attachments(embedded, recurse=True))

        return embedded

    @api.model
    def _ubl_parse_attached_document(self, tree):
        """
        In UBL, an AttachedDocument file is a wrapper around multiple different UBL files.
        According to the specifications the original document is stored within the top most
        Attachment node either as an Attachment/EmbeddedDocumentBinaryObject or (in special cases)
        a CDATA string stored in Attachment/ExternalReference/Description.

        We must parse this before passing the original file to the decoder to figure out how best
        to handle it.
        """
        attachment_node = tree.find('{*}Attachment')
        if attachment_node is None:
            return '', None

        attachment_binary_data = attachment_node.find('./{*}EmbeddedDocumentBinaryObject')
        if attachment_binary_data is not None \
                and attachment_binary_data.attrib.get('mimeCode') in ('application/xml', 'text/xml'):
            with suppress(etree.XMLSyntaxError, binascii.Error):
                content_1 = b64decode(attachment_binary_data.text)
                return content_1, etree.fromstring(content_1)

        external_reference = attachment_node.find('./{*}ExternalReference')
        if external_reference is not None:
            description = external_reference.findtext('./{*}Description')
            mime_code = external_reference.findtext('./{*}MimeCode')

            if description and mime_code in ('application/xml', 'text/xml'):
                content_2 = description.encode('utf-8')
                with suppress(etree.XMLSyntaxError):
                    return content_2, etree.fromstring(content_2)

        # If neither EmbeddedDocumentBinaryObject nor ExternalReference/Description can be decoded as an XML,
        # fall back on the contents of EmbeddedDocumentBinaryObject.
        return content_1, None

    def _get_ubl_cii_importable_models(self):
        # EXTENDS account_edi_cii
        return super()._get_ubl_cii_importable_models() | self._get_edi_child_models('account.edi.ubl')

    def _is_exportable_as_self_invoice(self):
        # EXTENDS account_edi_cii
        return (
            self.state == 'posted'
            and self.is_purchase_document()
            and self.journal_id.is_self_billing
            and (invoice_edi_format := self.commercial_partner_id._get_peppol_edi_format())
            and (edi_builder := self.partner_id._get_edi_builder(invoice_edi_format)) is not None
            and edi_builder._can_export_selfbilling()
        )
