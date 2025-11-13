import base64
import uuid
from odoo import api, fields, models
from odoo.tools import float_repr
from datetime import datetime
from lxml import etree


class PosOrder(models.Model):
    _name = "pos.order"
    _inherit = ["pos.order", "zatca.mixin"]

    # Backward compatibility: fallback to new EDI document when no account.move exists
    l10n_sa_invoice_qr_code_str = fields.Char(
        string="ZATCA QR Code",
        compute="_compute_l10n_sa_invoice_qr_code_str",
        store=False
    )
    l10n_sa_invoice_edi_state = fields.Selection(
        string="Electronic invoicing",
        compute="_compute_l10n_sa_invoice_edi_state",
        selection=[
            ('to_send', 'To Send'),
            ('sent', 'Sent'),
            ('rejected', 'Rejected'),
            ('error', 'Error'),
        ],
        store=False
    )

    def _compute_l10n_sa_invoice_qr_code_str(self):
        """Compute QR code with fallback to EDI document when no account.move exists"""
        for order in self:
            if order.account_move:
                order.l10n_sa_invoice_qr_code_str = order.account_move.l10n_sa_qr_code_str
            else:
                order.l10n_sa_invoice_qr_code_str = order.l10n_sa_qr_code_str

    def _compute_l10n_sa_invoice_edi_state(self):
        """Compute EDI state with fallback to EDI document when no account.move exists"""
        for order in self:
            if order.account_move:
                order.l10n_sa_invoice_edi_state = order.account_move.edi_state
            else:
                order.l10n_sa_invoice_edi_state = order.l10n_sa_edi_state

    def _is_zatca_applicable(self):
        """Check if ZATCA EDI is applicable for this order"""
        # todo: check if they are phase 2 compliant/required/whatever
        self.ensure_one()
        return self.country_code == 'SA'
    
    def _get_zatca_journal_id(self):
        """helper method to get the appropriate method to use in the creation of the zatca document"""
        self.ensure_one()
        return self.config_id.journal_id.id

    def _l10n_sa_is_simplified(self):
        """All POS orders are B2C/simplified invoices"""
        self.ensure_one()
        return True

    def _get_qr_code_str_dependencies(self):
        """Define fields that affect QR code generation"""
        return [
            'amount_total', 'amount_tax', 'l10n_sa_confirmation_datetime',
            'company_id', 'company_id.vat', 'session_id', 'session_id.config_id',
            'session_id.config_id.journal_id', 'session_id.config_id.journal_id.l10n_sa_production_csid_json',
            'l10n_sa_edi_document_id', 'l10n_sa_invoice_signature', 'l10n_sa_chain_index', 'state'
        ]

    def _get_l10n_sa_qr_code_str(self, values=None):
        """Generate QR code string for POS order - actual computation in _compute_qr_code_str"""
        self.ensure_one()
        zatca_document = self.env['l10n_sa_edi.document'].search([
            ('res_model', '=', 'pos.order'), ('res_id', '=', self.id)
        ])
        qr_code_str = ''
        if self.country_code == 'SA' and zatca_document and self.state in ('done', 'paid'):
            if self._l10n_sa_is_simplified():
                journal = self.session_id.config_id.journal_id
                x509_cert = journal.l10n_sa_production_csid_certificate_id
                if zatca_document and x509_cert:
                    xml_content = zatca_document._l10n_sa_generate_zatca_template()
                    # Use the stored signature to ensure consistency between XML and QR code
                    # ECDSA signatures are non-deterministic, so we must reuse the same signature
                    qr_code_str = self._l10n_sa_get_qr_code(
                        self.company_id, xml_content, x509_cert,
                        self.l10n_sa_invoice_signature, True
                    )
                    qr_code_str = base64.b64encode(qr_code_str).decode()
        return qr_code_str

    def _get_show_l10n_sa_reason_dependencies(self):
        """POS orders don't show adjustment reasons"""
        return []

    def _get_show_l10n_sa_reason(self):
        """POS orders don't need adjustment reasons (no credit notes in POS like invoices)"""
        return False

    def _l10n_sa_get_adjustment_reason(self):
        """Get adjustment reason for ZATCA payment means. POS orders typically don't have adjustment reasons."""
        self.ensure_one()
        # POS orders don't have complex adjustment reasons like invoices
        # Return reference if exists, otherwise empty string
        return self.ref or ''

    @api.model
    def _l10n_sa_get_qr_code(self, company_id, unsigned_xml, certificate, signature, is_b2c=False):
        """
            Generate QR code string based on XML content of the Invoice UBL file, X509 Production Certificate
            and company info.

            :return b64 encoded QR code string
        """

        def xpath_ns(expr):
            return root.xpath(expr, namespaces=edi_format._l10n_sa_get_namespaces())[0].text.strip()

        qr_code_str = b''
        root = etree.fromstring(unsigned_xml)
        edi_format = self.env['pos.edi.xml.ubl_21.zatca']

        # Indent XML content to avoid indentation mismatches
        etree.indent(root, space='    ')

        invoice_date = xpath_ns('//cbc:IssueDate')
        invoice_time = xpath_ns('//cbc:IssueTime')
        invoice_datetime = datetime.strptime(invoice_date + ' ' + invoice_time, '%Y-%m-%d %H:%M:%S')

        if invoice_datetime and company_id.vat and certificate and signature:
            prehash_content = etree.tostring(root)
            invoice_hash = edi_format._l10n_sa_generate_invoice_xml_hash(prehash_content, 'digest')

            amount_total = float(xpath_ns('//cbc:PayableAmount'))
            amount_tax = float(xpath_ns('//cac:TaxTotal/cbc:TaxAmount'))
            seller_name_enc = self._l10n_sa_get_qr_code_encoding(1, company_id.display_name.encode())
            seller_vat_enc = self._l10n_sa_get_qr_code_encoding(2, company_id.vat.encode())
            timestamp_enc = self._l10n_sa_get_qr_code_encoding(3,
                                                               invoice_datetime.strftime("%Y-%m-%dT%H:%M:%S").encode())
            amount_total_enc = self._l10n_sa_get_qr_code_encoding(4, float_repr(abs(amount_total), 2).encode())
            amount_tax_enc = self._l10n_sa_get_qr_code_encoding(5, float_repr(abs(amount_tax), 2).encode())
            invoice_hash_enc = self._l10n_sa_get_qr_code_encoding(6, invoice_hash)
            # Handle signature as either string or bytes
            signature_bytes = signature if isinstance(signature, bytes) else signature.encode()
            signature_enc = self._l10n_sa_get_qr_code_encoding(7, signature_bytes)
            public_key_enc = self._l10n_sa_get_qr_code_encoding(8, base64.b64decode(certificate._get_public_key_bytes(formatting='base64')))

            qr_code_str = (seller_name_enc + seller_vat_enc + timestamp_enc + amount_total_enc +
                           amount_tax_enc + invoice_hash_enc + signature_enc + public_key_enc)

            if is_b2c:
                qr_code_str += self._l10n_sa_get_qr_code_encoding(9, base64.b64decode(certificate._get_signature_bytes(formatting='base64')))

        return qr_code_str

    def _l10n_sa_get_qr_code_encoding(self, tag, field, int_length=1):
        """
            Helper function to encode strings for the QR code generation according to ZATCA specs
        """
        company_name_tag_encoding = tag.to_bytes(length=1, byteorder='big')
        company_name_length_encoding = len(field).to_bytes(length=int_length, byteorder='big')
        return company_name_tag_encoding + company_name_length_encoding + field

    def _l10n_sa_generate_unsigned_data(self):
        """Generate UUID and digital signature for ZATCA submission"""
        self.ensure_one()
        # Generate UUID for the order
        self.l10n_sa_uuid = uuid.uuid4()
        # Generate XML content
        xml_content = self.l10n_sa_edi_document_id._l10n_sa_generate_zatca_template()
        # Generate hash and signature
        invoice_hash_hex = self.env['pos.edi.xml.ubl_21.zatca']._l10n_sa_generate_invoice_xml_hash(xml_content).decode()
        self.l10n_sa_invoice_signature = self.env['l10n_sa_edi.document']._l10n_sa_get_digital_signature(
            self.session_id.config_id.journal_id.company_id,
            invoice_hash_hex
        ).decode()
        return xml_content

    def _process_saved_order(self, draft):
        """Override to create EDI document and set confirmation datetime"""
        order_id = super()._process_saved_order(draft)
        order = self.browse(order_id)

        # Set confirmation datetime when order is confirmed (paid)
        if not draft and order.state == 'paid' and order._is_zatca_applicable():
            if not order.l10n_sa_confirmation_datetime:
                order.l10n_sa_confirmation_datetime = fields.Datetime.now()

            # Only create EDI document if no invoice is generated
            if not order.account_move and not order.l10n_sa_edi_document_id:
                order._create_l10n_sa_edi_document()

        return order_id

    def action_pos_order_invoice(self):
        """Override to prevent EDI document creation when invoice is generated"""
        # Remove EDI document if it exists, as the invoice will handle ZATCA submission
        if self.l10n_sa_edi_document_id and not self.l10n_sa_edi_document_id.state == 'sent':
            self.l10n_sa_edi_document_id.unlink()
        return super().action_pos_order_invoice()
