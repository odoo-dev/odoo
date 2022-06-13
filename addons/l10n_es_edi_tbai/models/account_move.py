# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime
from re import sub as regex_sub

from lxml import etree
from odoo import _, api, fields, models
from odoo.addons.l10n_es_edi_tbai.models.web_services import get_web_services_for_agency
from odoo.exceptions import UserError, ValidationError
from pytz import timezone
from werkzeug.urls import url_quote

L10N_ES_TBAI_CRC8_TABLE = [
    0x00, 0x07, 0x0E, 0x09, 0x1C, 0x1B, 0x12, 0x15, 0x38, 0x3F, 0x36, 0x31, 0x24, 0x23, 0x2A, 0x2D,
    0x70, 0x77, 0x7E, 0x79, 0x6C, 0x6B, 0x62, 0x65, 0x48, 0x4F, 0x46, 0x41, 0x54, 0x53, 0x5A, 0x5D,
    0xE0, 0xE7, 0xEE, 0xE9, 0xFC, 0xFB, 0xF2, 0xF5, 0xD8, 0xDF, 0xD6, 0xD1, 0xC4, 0xC3, 0xCA, 0xCD,
    0x90, 0x97, 0x9E, 0x99, 0x8C, 0x8B, 0x82, 0x85, 0xA8, 0xAF, 0xA6, 0xA1, 0xB4, 0xB3, 0xBA, 0xBD,
    0xC7, 0xC0, 0xC9, 0xCE, 0xDB, 0xDC, 0xD5, 0xD2, 0xFF, 0xF8, 0xF1, 0xF6, 0xE3, 0xE4, 0xED, 0xEA,
    0xB7, 0xB0, 0xB9, 0xBE, 0xAB, 0xAC, 0xA5, 0xA2, 0x8F, 0x88, 0x81, 0x86, 0x93, 0x94, 0x9D, 0x9A,
    0x27, 0x20, 0x29, 0x2E, 0x3B, 0x3C, 0x35, 0x32, 0x1F, 0x18, 0x11, 0x16, 0x03, 0x04, 0x0D, 0x0A,
    0x57, 0x50, 0x59, 0x5E, 0x4B, 0x4C, 0x45, 0x42, 0x6F, 0x68, 0x61, 0x66, 0x73, 0x74, 0x7D, 0x7A,
    0x89, 0x8E, 0x87, 0x80, 0x95, 0x92, 0x9B, 0x9C, 0xB1, 0xB6, 0xBF, 0xB8, 0xAD, 0xAA, 0xA3, 0xA4,
    0xF9, 0xFE, 0xF7, 0xF0, 0xE5, 0xE2, 0xEB, 0xEC, 0xC1, 0xC6, 0xCF, 0xC8, 0xDD, 0xDA, 0xD3, 0xD4,
    0x69, 0x6E, 0x67, 0x60, 0x75, 0x72, 0x7B, 0x7C, 0x51, 0x56, 0x5F, 0x58, 0x4D, 0x4A, 0x43, 0x44,
    0x19, 0x1E, 0x17, 0x10, 0x05, 0x02, 0x0B, 0x0C, 0x21, 0x26, 0x2F, 0x28, 0x3D, 0x3A, 0x33, 0x34,
    0x4E, 0x49, 0x40, 0x47, 0x52, 0x55, 0x5C, 0x5B, 0x76, 0x71, 0x78, 0x7F, 0x6A, 0x6D, 0x64, 0x63,
    0x3E, 0x39, 0x30, 0x37, 0x22, 0x25, 0x2C, 0x2B, 0x06, 0x01, 0x08, 0x0F, 0x1A, 0x1D, 0x14, 0x13,
    0xAE, 0xA9, 0xA0, 0xA7, 0xB2, 0xB5, 0xBC, 0xBB, 0x96, 0x91, 0x98, 0x9F, 0x8A, 0x8D, 0x84, 0x83,
    0xDE, 0xD9, 0xD0, 0xD7, 0xC2, 0xC5, 0xCC, 0xCB, 0xE6, 0xE1, 0xE8, 0xEF, 0xFA, 0xFD, 0xF4, 0xF3
]

class AccountMove(models.Model):
    _inherit = 'account.move'

    # Stored fields
    l10n_es_tbai_is_required = fields.Boolean(
        string="TicketBAI required",
        help="Is the Bask EDI (TicketBAI) needed",
        compute="_compute_l10n_es_tbai_is_required",
    )
    l10n_es_tbai_is_in_chain = fields.Boolean(
        string="In TicketBAI chain",
        compute="_compute_l10n_es_tbai_is_in_chain",
        help="Invoice has been included in chain",
        store=True, copy=False,
    )
    l10n_es_tbai_chain_index = fields.Integer(
        string="TicketBAI chain index",
        help="Invoice index in chain, set if and only if an in-chain XML was submitted and did not error",
        store=True, copy=False, readonly=True,
    )

    # Relations
    l10n_es_tbai_post_xml_id = fields.Many2one(
        comodel_name="ir.attachment", readonly=True, copy=False,
        string="Submission XML",
        help="Submission XML sent to TicketBAI. Kept if accepted or no response (timeout), cleared otherwise.",
    )
    l10n_es_tbai_cancel_xml_id = fields.Many2one(
        comodel_name="ir.attachment", readonly=True, copy=False,
        string="Cancellation XML",
        help="Cancellation XML sent to TicketBAI. Kept if accepted or no response (timeout), cleared otherwise.",
    )

    # Non-stored fields
    l10n_es_tbai_id = fields.Char(string="TicketBAI ID", compute="_compute_l10n_es_tbai_id")
    l10n_es_tbai_sequence = fields.Char(string="TicketBAI sequence", compute="_compute_l10n_es_tbai_seq_num")
    l10n_es_tbai_number = fields.Char(string="TicketBAI number", compute="_compute_l10n_es_tbai_seq_num")
    l10n_es_tbai_qr = fields.Char(string="TicketBAI QR code URL", compute="_compute_l10n_es_tbai_qr")
    l10n_es_tbai_qr_escaped = fields.Char(string="TicketBAI QR code, escaped", compute="_compute_l10n_es_tbai_qr")
    l10n_es_tbai_signature = fields.Char(string="TicketBAI XML signature", compute="_compute_l10n_es_tbai_values")
    l10n_es_tbai_registration_date = fields.Date(
        string="TicketBAI registration date",
        help="Technical field to keep the date the invoice was sent the first time as the date the invoice was "
             "registered into the TicketBai system.",
        compute="_compute_l10n_es_tbai_values",
    )

    # Optional fields
    l10n_es_tbai_refund_reason = fields.Selection(
        selection=[
            ('R1', "R1: Art. 80.1, 80.2, 80.6 and rights founded error"),
            ('R2', "R2: Art. 80.3"),
            ('R3', "R3: Art. 80.4"),
            ('R4', "R4: Art. 80 - other"),
            ('R5', "R5: Factura rectificativa en facturas simplificadas"),
        ],
        string="Invoice Refund Reason Code (TicketBai)",
        help="BOE-A-1992-28740. Ley 37/1992, de 28 de diciembre, del Impuesto sobre el "
        "Valor Añadido. Artículo 80. Modificación de la base imponible.",
        copy=False,
    )

    # -------------------------------------------------------------------------
    # COMPUTE & API-DECORATED METHODS
    # -------------------------------------------------------------------------

    @api.depends('move_type', 'company_id')
    def _compute_l10n_es_tbai_is_required(self):
        for move in self:
            move.l10n_es_tbai_is_required = move.is_sale_document() \
                and move.country_code == 'ES' \
                and move.company_id.l10n_es_tbai_tax_agency

    @api.depends('l10n_es_tbai_is_required', 'edi_document_ids.state')
    def _compute_l10n_es_tbai_is_in_chain(self):
        """
        True iff invoice has been posted to the chain and confirmed by govt.
        Note that cancelled invoices remain part of the chain.
        """
        for move in self:
            tbai_doc_ids = move.edi_document_ids.filtered(lambda d: d.edi_format_id.code == 'es_tbai')
            move.l10n_es_tbai_is_in_chain = move.l10n_es_tbai_is_required \
                and len(tbai_doc_ids) > 0 \
                and not any(tbai_doc_ids.filtered(lambda d: d.state == 'to_send'))

    @api.depends('l10n_es_tbai_is_required', 'name')
    def _compute_l10n_es_tbai_seq_num(self):
        tbai_required = self.filtered(lambda m: m.l10n_es_tbai_is_required)
        for move in tbai_required:
            sequence, number = move.name.rsplit('/', 1)
            sequence = regex_sub(r"[^0-9A-Za-z.\_\-\/]", "", sequence)  # remove forbidden characters
            sequence = regex_sub(r"[\s]+", " ", sequence)  # no more than once consecutive whitespace allowed
            # TODO (optional) issue warning if sequence uses chars out of ([0123456789ABCDEFGHJKLMNPQRSTUVXYZ.\_\-\/ ])
            move.l10n_es_tbai_sequence = sequence + ("TEST" if move.company_id.l10n_es_edi_test_env else "")
            move.l10n_es_tbai_number = regex_sub(r"[^0-9]", "", number)  # remove non-decimal characters
        for move in self - tbai_required:
            move.l10n_es_tbai_sequence = ''
            move.l10n_es_tbai_number = ''

    @api.depends('l10n_es_tbai_is_in_chain', 'l10n_es_tbai_post_xml_id')
    def _compute_l10n_es_tbai_values(self):
        """
        This function reads values directly from the 'post' XMLs submitted to the government \
            (the 'cancel' XML is ignored).
        Note about the signature value: if the post XML has \
            not been validated (yet), the signature value is left blank.
        """
        in_chain = self.filtered(lambda m: m.l10n_es_tbai_is_in_chain)
        for move in in_chain:
            vals = move._get_l10n_es_tbai_values_from_xml({
                'signature': r'.//{http://www.w3.org/2000/09/xmldsig#}SignatureValue',
                'registration_date': r'.//CabeceraFactura//FechaExpedicionFactura'
            })
            # RFC2045 - Base64 Content-Transfer-Encoding (page 25)
            # Any characters outside of the base64 alphabet are to be ignored in base64-encoded data.
            move.l10n_es_tbai_signature = vals['signature'].replace("\n", "")
            move.l10n_es_tbai_registration_date = datetime.strptime(vals['registration_date'], '%d-%m-%Y').replace(tzinfo=timezone('Europe/Madrid'))
        for move in self - in_chain:
            move.l10n_es_tbai_signature = ''
            move.l10n_es_tbai_registration_date = ''

    @api.depends('l10n_es_tbai_is_in_chain', 'l10n_es_tbai_signature', 'l10n_es_tbai_registration_date')
    def _compute_l10n_es_tbai_id(self):
        in_chain = self.filtered(lambda m: m.l10n_es_tbai_is_in_chain)
        for move in in_chain:
            company = move.company_id
            tbai_id_no_crc = '-'.join([
                'TBAI',
                str(company.vat[2:] if company.vat.startswith('ES') else company.vat),
                datetime.strftime(move.l10n_es_tbai_registration_date, '%d%m%y'),
                move.l10n_es_tbai_signature[:13],
                ''  # CRC
            ])
            move.l10n_es_tbai_id = tbai_id_no_crc + self._l10n_es_edi_tbai_crc8(tbai_id_no_crc)
        for move in self - in_chain:
            move.l10n_es_tbai_id = ''

    @api.depends('l10n_es_tbai_is_in_chain', 'l10n_es_tbai_id', 'l10n_es_tbai_sequence', 'l10n_es_tbai_number')
    def _compute_l10n_es_tbai_qr(self):
        in_chain = self.filtered(lambda m: m.l10n_es_tbai_is_in_chain)
        for move in in_chain:
            company = move.company_id
            web_services = get_web_services_for_agency(agency=company.l10n_es_tbai_tax_agency, env=self.env)
            tbai_qr_no_crc = web_services.get_qr_base_url(company=company) + '?' + '&'.join([
                'id=' + move.l10n_es_tbai_id,
                's=' + move.l10n_es_tbai_sequence,
                'nf=' + move.l10n_es_tbai_number,
                'i=' + move._get_l10n_es_tbai_values_from_xml({'importe': r'.//ImporteTotalFactura'})['importe']
            ])
            move.l10n_es_tbai_qr = tbai_qr_no_crc + '&cr=' + self._l10n_es_edi_tbai_crc8(tbai_qr_no_crc)
        for move in self - in_chain:
            move.l10n_es_tbai_qr = ''
        for move in self:
            move.l10n_es_tbai_qr_escaped = url_quote(move.l10n_es_tbai_qr)

    @api.constrains('l10n_es_tbai_refund_reason', 'partner_id', 'move_type')
    def _check_l10n_es_tbai_refund_reason_allowed(self):
        if self.move_type == 'out_refund':
            if not self.l10n_es_tbai_refund_reason:
                raise ValidationError(_('Refund reason must be specified (TicketBAI)'))
            if self._is_l10n_es_tbai_simplified():
                if self.l10n_es_tbai_refund_reason != 'R5':
                    raise ValidationError(_('Refund reason must be R5 for simplified invoices (TicketBAI)'))
            else:
                if self.l10n_es_tbai_refund_reason == 'R5':
                    raise ValidationError(_('Refund reason cannot be R5 for non-simplified invoices (TicketBAI)'))

    @api.ondelete(at_uninstall=False)
    def _l10n_es_tbai_unlink_except_in_chain(self):
        # Prevent deleting moves that are part of the TicketBAI chain
        if not self._context.get('force_delete') and any(m.l10n_es_tbai_chain_index for m in self):
            raise UserError(_('You cannot delete a move that has a TicketBAI chain id.'))

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    def _l10n_es_edi_tbai_crc8(self, data):
        crc = 0x0
        for c in data:
            crc = L10N_ES_TBAI_CRC8_TABLE[(crc ^ ord(c)) & 0xFF]
        return '{:03d}'.format(crc & 0xFF)

    def _get_l10n_es_tbai_values_from_xml(self, xpaths):
        """
        This function reads values directly from the 'post' XML submitted to the government \
            (the 'cancel' XML is ignored).
        """
        res = {key: '' for key in xpaths.keys()}
        doc_xml = self._get_l10n_es_tbai_submitted_xml()
        if doc_xml is None:
            return res
        for key, value in xpaths.items():
            res[key] = doc_xml.find(value).text
        return res

    def _get_l10n_es_tbai_submitted_xml(self, cancel=False):
        doc = self.l10n_es_tbai_cancel_xml_id if cancel else self.l10n_es_tbai_post_xml_id
        doc_raw = doc.with_context(bin_size=False).raw  # Without bin_size=False, size is returned instead of content
        if not doc_raw:
            return None
        return etree.fromstring(doc_raw.decode())

    def _update_l10n_es_tbai_submitted_xml(self, xml_doc, cancel):
        self.ensure_one()

        doc = self.l10n_es_tbai_cancel_xml_id if cancel else self.l10n_es_tbai_post_xml_id
        # No existing document: first time posting/cancelling (or first time after error)
        # bool(doc) == False <==> (doc is None or doc.raw == b'')
        if not doc:
            if xml_doc is not None:
                doc = self.env['ir.attachment'].create({
                    'type': 'binary',
                    'name': self.name + ('_cancel' if cancel else '_post') + '.xml',
                    'raw': b'' if xml_doc is None else etree.tostring(xml_doc, encoding='UTF-8'),
                    'mimetype': 'application/xml',
                    'res_id': self.id,
                    'res_model': 'account.move',
                })
        # Existing document: update document (for now only used to erase document that yields error)
        else:
            doc = self.env['ir.attachment'].update({
                'name': self.name + ('_cancel' if cancel else '_post') + '.xml',
                'raw': b'' if xml_doc is None else etree.tostring(xml_doc, encoding='UTF-8'),
                'res_id': self.id,
            })
        # Update the corresponding post/cancel document
        if cancel:
            self.l10n_es_tbai_cancel_xml_id = doc
        else:
            self.l10n_es_tbai_post_xml_id = doc

    def _is_l10n_es_tbai_simplified(self):
        return self.commercial_partner_id == self.env.ref("l10n_es_edi_sii.partner_simplified")
