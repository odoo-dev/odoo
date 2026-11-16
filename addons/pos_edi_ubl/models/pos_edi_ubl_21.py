from lxml import etree

from odoo import fields, models
from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt
from odoo.addons.account_edi_ubl.tools import CreditNote, Invoice


class PosEdiXmlUBL21(models.AbstractModel):
    """ Generic UBL 2.1 export of a point of sale order (pos.order), built on the UBL 2.1 syntax layer
    'account.edi.ubl' (OASIS UBL 2.1: https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.html).

    It is not tied to any customization (no CustomizationID): localizations (Jordan, Colombia, Saudi Arabia, ...)
    extend it with their own rules.

    The POS orders are exported with two dedicated document types (see '_export_pos_order_get_document_type'):
        * 'pos_invoice':        a regular order, rendered as an UBL 'Invoice'.
        * 'pos_credit_note':    a refund order, rendered as an UBL 'CreditNote'.
    They are distinct from the account.move types ('invoice', 'credit_note', ...) because the generic builders of
    account.edi.ubl read vals['invoice'] (an account.move) for those types; here vals['pos_order'] is available
    instead.

    Entry points:
        * '_export_pos_order(pos_order)'                -> (xml bytes, set of errors)
        * '_init_pos_order_export_values(pos_order)'    -> the neutral 'vals' (see account.edi.common)
    """
    _name = 'pos.edi.xml.ubl_21'
    _inherit = ['account.edi.ubl']
    _description = 'PoS Order UBL 2.1 builder'

    # -------------------------------------------------------------------------
    # EXPORT: ENTRY POINTS
    # -------------------------------------------------------------------------

    def _export_pos_order_filename(self, pos_order):
        return f"{pos_order.name.replace('/', '_')}_{self._name.rsplit('.', 1)[-1]}.xml"

    def _export_pos_order(self, pos_order):
        """ Generate the UBL XML of a POS order.

        :param pos_order:   The pos.order to export.
        :return:            A tuple (xml_content as bytes, set of error messages).
        """
        self._validate_taxes(pos_order.lines.tax_ids_after_fiscal_position)

        vals = self._init_pos_order_export_values(pos_order)
        self._export_document(vals)

        xml_content = dict_to_xml(
            vals['document_node'],
            nsmap=vals['document_node']['_nsmap'],
            template=vals['document_node']['_template'],
        )
        return etree.tostring(xml_content, xml_declaration=True, encoding='UTF-8'), vals['errors']

    # -------------------------------------------------------------------------
    # EXPORT: VALUES
    # -------------------------------------------------------------------------

    def _export_pos_order_get_document_type(self, pos_order):
        """ 'pos_invoice' for a regular order, 'pos_credit_note' for a refund. """
        return 'pos_invoice' if pos_order.amount_total >= 0 else 'pos_credit_note'

    def _export_pos_order_get_parties(self, vals):
        """ Return the (supplier, customer, delivery) partners of the POS order. """
        pos_order = vals['pos_order']
        return pos_order.company_id.partner_id.commercial_partner_id, pos_order.partner_id, None

    def _pos_order_prepare_base_lines(self, vals):
        """ Compute vals['base_lines'] of the POS order (with their rounded tax details).
        Hook to customize the base lines (e.g. their precision) before the UBL processing.
        """
        pos_order = vals['pos_order']
        AccountTax = self.env['account.tax']
        base_lines = pos_order.lines._prepare_base_lines_for_taxes_computation()
        AccountTax._add_tax_details_in_base_lines(base_lines, pos_order.company_id)
        AccountTax._round_base_lines_tax_details(base_lines, pos_order.company_id)
        vals['base_lines'] = base_lines
        vals['tax_lines'] = []

    def _init_pos_order_export_values(self, pos_order):
        """ Collect the neutral values describing the POS order (counterpart of '_init_invoice_export_values').

        The returned dictionary contains: 'pos_order', the document type ('pos_invoice' / 'pos_credit_note'),
        'company', 'currency', 'company_currency', 'supplier', 'customer', 'delivery' (None), 'base_lines',
        'tax_lines' ([]) and the '_ubl_values' dictionaries.
        """
        vals = {'pos_order': pos_order.with_context(lang=pos_order.partner_id.lang)}
        self._define_document_type(vals, self._export_pos_order_get_document_type(pos_order))
        vals['company'] = pos_order.company_id
        vals['currency'] = pos_order.currency_id
        vals['company_currency'] = pos_order.company_id.currency_id
        vals['supplier'], vals['customer'], vals['delivery'] = self._export_pos_order_get_parties(vals)
        self._pos_order_prepare_base_lines(vals)

        # Same processing as account.edi.ubl._init_invoice_export_values.
        self._ubl_prepare_base_lines(vals)
        vals['_ubl_values'] = {}
        for base_line in vals['base_lines']:
            base_line['_ubl_values'] = {}
        self._round_base_lines_tax_details(vals)
        return vals

    # -------------------------------------------------------------------------
    # EXPORT: DOCUMENT STRUCTURE
    # -------------------------------------------------------------------------

    def _fill_template_values(self, vals):
        # EXTENDS account.edi.ubl
        super()._fill_template_values(vals)
        if self._is_document(vals, 'pos_invoice'):
            vals['document_node']['_template'] = Invoice
        elif self._is_document(vals, 'pos_credit_note'):
            vals['document_node']['_template'] = CreditNote

    def _fill_nsmap_values(self, vals):
        # EXTENDS account.edi.ubl
        super()._fill_nsmap_values(vals)
        nsmap = vals['document_node']['_nsmap']
        if self._is_document(vals, 'pos_invoice'):
            nsmap[None] = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
        elif self._is_document(vals, 'pos_credit_note'):
            nsmap[None] = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"

    def _fill_document_values(self, vals):
        # EXTENDS account.edi.ubl
        super()._fill_document_values(vals)
        if self._is_document(vals, 'pos_invoice'):
            self._fill_document_values_invoice(vals)
        elif self._is_document(vals, 'pos_credit_note'):
            self._fill_document_values_credit_note(vals)

    # -------------------------------------------------------------------------
    # EXPORT: HEADER NODES
    # -------------------------------------------------------------------------

    def _ubl_add_version_id_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_version_id_node(vals)
        if self._is_document(vals, 'pos_invoice', 'pos_credit_note'):
            vals['document_node']['cbc:UBLVersionID']['_text'] = '2.1'

    def _ubl_add_id_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_id_node(vals)
        if self._is_document(vals, 'pos_invoice', 'pos_credit_note'):
            vals['document_node']['cbc:ID']['_text'] = vals['pos_order'].name

    def _ubl_add_issue_date_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_issue_date_node(vals)
        if self._is_document(vals, 'pos_invoice', 'pos_credit_note'):
            pos_order = vals['pos_order']
            # cbc:IssueDate is a xsd:date: express the order datetime (UTC) in the timezone of the user.
            vals['document_node']['cbc:IssueDate']['_text'] = fields.Datetime.context_timestamp(pos_order, pos_order.date_order).date()

    def _ubl_add_invoice_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_invoice_type_code_node(vals)
        if self._is_document(vals, 'pos_invoice'):
            vals['document_node']['cbc:InvoiceTypeCode']['_text'] = 380

    def _ubl_add_credit_note_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_credit_note_type_code_node(vals)
        if self._is_document(vals, 'pos_credit_note'):
            vals['document_node']['cbc:CreditNoteTypeCode']['_text'] = 381

    def _ubl_add_notes_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_notes_nodes(vals)
        if self._is_document(vals, 'pos_invoice', 'pos_credit_note') and (note := vals['pos_order'].general_customer_note):
            vals['document_node']['cbc:Note'].append({'_text': note})

    def _ubl_add_document_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_document_currency_code_node(vals)
        if self._is_document(vals, 'pos_invoice', 'pos_credit_note'):
            vals['document_node']['cbc:DocumentCurrencyCode']['_text'] = vals['currency'].name

    def _ubl_add_order_reference_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_order_reference_node(vals)
        if self._is_document(vals, 'pos_invoice', 'pos_credit_note'):
            vals['document_node']['cac:OrderReference']['cbc:ID']['_text'] = vals['pos_order'].name

    # -------------------------------------------------------------------------
    # EXPORT: PARTY NODES
    # -------------------------------------------------------------------------

    def _ubl_add_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_tax_scheme_nodes(vals)
        if self._is_document(vals, 'pos_invoice', 'pos_credit_note') and self._should_export_party_tax_scheme(vals):
            self._ubl_add_party_tax_scheme_nodes_vat_gst(vals)

    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_legal_entity_nodes(vals)
        if self._is_document(vals, 'pos_invoice', 'pos_credit_note'):
            self._ubl_add_party_legal_entity_nodes_iso_6523_icd(vals)

    # -------------------------------------------------------------------------
    # EXPORT: LINE NODES
    # -------------------------------------------------------------------------

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_line_allowance_charge_nodes(vals)
        if self._is_document(vals, 'pos_invoice', 'pos_credit_note'):
            self._ubl_add_line_allowance_charge_nodes_for_discount(vals)
            self._ubl_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(vals)
            self._ubl_add_line_allowance_charge_nodes_for_excise_taxes(vals)

    # -------------------------------------------------------------------------
    # EXPORT: MONETARY TOTAL
    # -------------------------------------------------------------------------

    def _ubl_add_legal_monetary_total_prepaid_payable_amount_node(self, vals, in_foreign_currency=True):
        # EXTENDS account.edi.ubl
        super()._ubl_add_legal_monetary_total_prepaid_payable_amount_node(vals, in_foreign_currency=in_foreign_currency)
        if self._is_document(vals, 'pos_invoice', 'pos_credit_note'):
            pos_order = vals['pos_order']
            currency = vals['currency'] if in_foreign_currency else vals['company_currency']
            node = vals['legal_monetary_total_node']
            # A refund is expressed as a CreditNote with positive amounts.
            sign = -1 if self._is_document(vals, 'pos_credit_note') else 1
            amount_paid = sign * pos_order.amount_paid
            if not in_foreign_currency:
                amount_paid = currency.round(amount_paid / (pos_order.currency_rate or 1.0))
            node['cbc:PrepaidAmount']['_text'] = FloatFmt(amount_paid, min_dp=currency.decimal_places)
            node['cbc:PayableAmount']['_text'] = FloatFmt(
                node['cbc:PayableAmount']['_text'] - amount_paid,
                min_dp=currency.decimal_places,
            )
