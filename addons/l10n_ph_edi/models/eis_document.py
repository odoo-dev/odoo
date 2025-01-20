# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models, _

import re


class EisDocument(models.Model):
    """
    Represents a document that is sent to the EIS.
    This model is used by other ones which need integrations with the EIS (invoices, PoS).

    A single record could have more than one document; a common example would be invoices with mixed tax
    rates in which we need to separate the tax rates in different documents.
    """
    _name = 'eis.document'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = "EIS Document"
    # _check_company_auto = True

    # todo one document with multiple attachment as we want a single invoice number.

    # ------------------
    # Fields declaration
    # ------------------

    # EDI values
    eis_document_state = fields.Selection(
        string='EIS Status',
        selection=[
            ('sent', 'Sent'),
            ('registered', 'Registered'),
            ('rejected', 'Rejected'),
        ],
        copy=False,
    )
    eis_submission_id = fields.Char()
    eis_unique_id = fields.Char()
    eis_document_type = fields.Selection(
        selection=[
            ('01', 'Sales Invoice'),
            ('02', 'Debit Note'),
            ('03', 'Credit Note'),
            ('04', 'Service Billing'),
            ('05', 'Official Receipt'),
        ]
    )
    eis_transaction_class = fields.Selection(
        selection=[
            ('01', 'VATable'),
            ('02', 'Zero-Rated'),
            ('03', 'VAT Exempt'),
            ('04', 'PoS'),  # Not a transaction code per se, but as the document behave differently it helps to simply store the information here.
        ]
    )
    eis_document_lines = fields.One2many(
        comodel_name='eis.document.line',
        inverse_name='eis_document_id',
    )
    # Debit/Credit notes
    eis_correction_code = fields.Selection(
        string='Correction Code',
        selection=[
            ('01', 'Error'),
            ('02', 'Duplication'),
            ('03', 'Addition/reduction'),
            ('04', 'Cancellation'),
            ('05', 'Return'),
            ('09', 'Others'),
        ]
    )
    eis_correction_reason = fields.Char()
    # eis_original
    # Attachment fields
    eis_document_file_id = fields.Many2one(
        comodel_name='ir.attachment',
        compute=lambda self: self._compute_linked_attachment_id('eis_document_file_id', 'eis_document_file'),
        depends=['eis_document_file'],
        export_string_translation=False,
    )
    eis_document_file = fields.Binary(
        string='EIS document file',
        copy=False,
        export_string_translation=False,
    )
    # Export fields
    eis_airway_bill_number = fields.Char()
    eis_airway_bill_number_date = fields.Char()
    eis_bill_of_lading = fields.Char()
    eis_bill_of_lading_date = fields.Char()
    # Related record fields
    name = fields.Char()
    date = fields.Date()
    company_id = fields.Many2one(
        comodel_name='res.company',
    )
    partner_id = fields.Many2one(
        comodel_name='res.partner',
    )
    currency_id = fields.Many2one(
        comodel_name='res.currency',
    )

    # todo document level discounts?

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    def _compute_linked_attachment_id(self, attachment_field, binary_field):
        """Helper to retreive Attachment from Binary fields
        This is needed because fields.Many2one('ir.attachment') makes all
        attachments available to the user.
        """
        attachments = self.env['ir.attachment'].search([
            ('res_model', '=', self._name),
            ('res_id', 'in', self.ids),
            ('res_field', '=', binary_field)
        ])
        move_vals = {att.res_id: att for att in attachments}
        for move in self:
            move[attachment_field] = move_vals.get(move._origin.id, False)

    # -----------------
    # Selection methods
    # -----------------
    
    # ----------------------------
    # Onchange, Constraint methods
    # ----------------------------

    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    def _get_mail_thread_data_attachments(self):
        """ Ensure that the document attachments are displayed in the chatter. """
        res = super()._get_mail_thread_data_attachments()
        return res | self.eis_document_file_id
    
    # --------------
    # Action methods
    # --------------
    
    # ----------------
    # Business methods
    # ----------------

    def _generate_eis_json(self):
        """ Return a list of json objects, with one per invoice.

        Invoice issued by CAS must be issued separately for VATable, VAT Exempt, and Zero Rated.
        It is impossible to issue a mix of VATable, VAT Exempt, and Zero Rated on one invoice item.
        Therefore if VATable, VAT Exempt, and Zero Rated are mixed in one invoice issued by CAS, VATable, VAT
        Exempt, and Zero tax must be issued separately as sep1arate invoices.
        """
        self.ensure_one()
        if self.eis_document_file_id:
            self.eis_document_file_id.write({
                'name': f'{self.eis_document_file_id.name} (OLD)',
                'res_field': False,  # Unlink the old file from the field, but we keep it for reference.
            })

        document_data = {}
        self._make_eis_document_header(document_data)
        self._l10n_ph_edi_make_party_information(document_data, party="seller")
        self._l10n_ph_edi_make_party_information(document_data, party="buyer")  # todo for pos, have the keys but left empty
        if self.eis_transaction_class in ['01', '02', '03']:  # We will add a new classification for PoS transactions, and these do not need line details, only totals.
            for line in self.eis_document_lines:
                line._eis_make_line_information(document_data)
        return document_data  # todo make file instead

    def _make_eis_document_header(self, document_data):
        """ Fill the provided data dict with the general information of the invoice. """
        self.ensure_one()
        issuance_date = self.date.strftime("%Y%m%d")
        eis_certification_id = self.company_id.l10n_ph_edi_accreditation_id
        # Issuance date, certification id and 8 control characters.
        # We keep the 8 rightmost characters of the name, they should be significant enough to avoid collisions.
        self.eis_unique_id = f"{issuance_date}{eis_certification_id}{self.name[-8:]}"
        document_type, previous_unique_id = self._l10n_ph_edi_get_document_type()
        document_data.update({
            "CompInvoiceId": self.name,  # Invoice number
            "IssueDtm": issuance_date,  # Issuance Date with format YYYYMMDD
            "EisUniqueId": self.eis_unique_id,  # Unique invoice ID on the EIS system.
            "DocType": document_type,
            "TransClass": self.eis_transaction_class,
            "CorrYN": "N",
            "CorrectionCd": "",
            "PrevUniqueId": "",
            "Rmk1": "",  # todo if we are adjusting multiple documents at once, first id comes in PrevUniqueId and the rest here along with any reasons/...
        })
        # Manage debit/credit notes
        if document_type in ("02", "03"):
            document_data.update({
                "CorrYN": "Y",
                "CorrectionCd": self.eis_correction_code,
                "PrevUniqueId": previous_unique_id or "0000000000000000000000000",
                "Rmk1": self.eis_correction_reason,
            })

    def _l10n_ph_edi_get_document_type(self):
        """ Return the document type for this invoice as well as the original document.

        01: Sales Invoice
        02: Debit Note
        03: Credit Note
        04: Service Billing - When selling services?  todo
        05: Official Receipt  todo seems deprecated?
        """
        self.ensure_one()
        # Todo adapt for documents. What about refund of an invoice with multiple documents?
        if 'debit_origin_id' in self.env['account.move']._fields and self.debit_origin_id:
            return '02', self.debit_origin_id.l10n_ph_edi_unique_id
        elif self.move_type == 'out_refund':
            return '03', self.reversed_entry_id.l10n_ph_edi_unique_id
        # elif self.move_type == 'out_receipt':
        #     return '05'
        else:
            return '01', ""

    def _l10n_ph_edi_make_party_information(self, invoice_data_dict, party):
        """
        Fill the provided data dict with the information of the given party.
        """
        self.ensure_one()
        # While we don't send bills, by "supporting" its file generation we ensure that
        if party == 'seller':
            partner = self.company_id.partner_id
            key = "SellerInfo"
        else:
            partner = self.partner_id
            key = "BuyerInfo"

        invoice_data_dict[key] = {
            "Tin": re.sub(r'\D+', '', partner.commercial_partner_id.vat or ''),  # Tin as digits only
            "BranchCd": partner.commercial_partner_id.branch_code.rjust(5, '0'),  # Branch code in 5 digits, with 00 to fill
            "RegNm": partner.display_name,
            "BusinessNm": partner.commercial_partner_id.display_name,
            "Email": partner.email,
            "RegAddr": partner.commercial_partner_id.contact_address,  # Business address
        }

        if party == 'seller':
            invoice_data_dict[key]["Type"] = "0" if partner.commercial_partner_id.vat else "1",  # 0 if VAT registered, else 1.
        else:
            invoice_data_dict[key].update({
                "DevAddr": partner.contact_address,  # Delivery address
                "AirNum": self.eis_airway_bill_number,
                "AirNumDt": self.eis_airway_bill_number_date,
                "LadNum": self.eis_bill_of_lading,
                "LadNumDt": self.eis_bill_of_lading_date,
            })
