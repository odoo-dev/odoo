from odoo import _, models


class AccountEdiXmlPint_Jp(models.AbstractModel):
    """ Japanese implementation of Peppol International (PINT) model for Billing (PINT JP, "JP PINT").

    PINT JP is a specialization of the Peppol International model (PINT), not a CIUS of the European norm EN 16931
    nor of Peppol BIS Billing 3.0 (its CustomizationID is 'urn:peppol:pint:billing-1@jp-1'): it inherits the generic
    PINT layer ('account.edi.ubl_pint') and only adds the PINT JP rules (aligned-ibrp-*-jp, aligned-ibr-jp-*).

    * PINT Official documentation: https://docs.peppol.eu/poac/pint/pint/
    * PINT JP Official documentation: https://docs.peppol.eu/poac/jp/pint-jp/
    """
    _name = 'account.edi.xml.pint_jp'
    _inherit = ["account.edi.ubl_pint"]
    _description = "Japanese implementation of Peppol International (PINT) model for Billing"

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        # EXTENDS account_edi_ubl
        return f"{invoice.name.replace('/', '_')}_pint_jp.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl_pint
        if process_type == 'billing':
            return 'urn:peppol:pint:billing-1@jp-1'
        return None

    def _export_get_document_type(self, invoice):
        # EXTENDS account.edi.common
        # PINT JP only knows invoices and credit notes: a debit note is an invoice.
        document_type = super()._export_get_document_type(invoice)
        if document_type == 'debit_note':
            return 'invoice'
        return document_type

    def _init_invoice_export_values(self, invoice):
        # EXTENDS account.edi.ubl
        vals = super()._init_invoice_export_values(invoice)
        # [ibr-027] The Item net price (ibt-146) MUST NOT be negative.
        self._turn_price_unit_positive(vals)
        return vals

    def _get_tax_category_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.common
        # The cash rounding is reported as the Rounding amount (ibt-114), not as a tax breakdown.
        if self._is_cash_rounding_base_line(base_line):
            return None
        return super()._get_tax_category_grouping_key(base_line, tax_data, vals, currency)

    def _ubl_get_tax_subtotal_node(self, vals, tax_subtotal):
        # EXTENDS account.edi.ubl_pint
        tax_subtotal_node = super()._ubl_get_tax_subtotal_node(vals, tax_subtotal)

        # If there is a TaxTotal section in company currency,
        # its TaxSubtotals nodes should contain a 'Percent' node.
        currency = vals['currency']
        company = vals['company']
        if (
            currency != company.currency_id
            and tax_subtotal['currency'] == company.currency_id
        ):
            tax_subtotal_node['cbc:Percent']['_text'] = tax_subtotal['percent']

        return tax_subtotal_node

    def _ubl_tax_totals_node_grouping_key(self, base_line, tax_data, vals, currency):
        # OVERRIDE account.edi.ubl_pint
        # [aligned-ibr-jp-*] The TaxTotal in accounting currency (JPY) keeps its tax breakdown, and the withholding
        # taxes are kept as such: skip the generic PINT behavior.
        return self.env['account.edi.ubl']._ubl_tax_totals_node_grouping_key(base_line, tax_data, vals, currency)

    def _ubl_add_invoice_period_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_invoice_period_nodes(vals)
        nodes = vals['document_node']['cac:InvoicePeriod']
        invoice = vals.get('invoice')

        # [aligned-ibrp-052] An Invoice MUST have an invoice period (ibg-14) or an Invoice line period (ibg-26).
        if invoice and not nodes:
            nodes.update({
                'cbc:StartDate': {'_text': invoice.invoice_date},
                'cbc:EndDate': {'_text': invoice.invoice_date},
            })

    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_party_legal_entity_nodes(vals)
        nodes = vals['party_node']['cac:PartyLegalEntity']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        # optional, if set: scheme_id should be taken from ISO/IEC 6523 list
        if commercial_partner.country_code == 'JP':
            for node in nodes:
                node['cbc:CompanyID'] = None

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.ubl_pint
        constraints = super()._export_document_constraints(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return constraints

        document_node = vals['document_node']
        line_nodes = document_node.get('cac:InvoiceLine') or document_node.get('cac:CreditNoteLine') or []

        # Each invoice line has one and only one line tax information (ibg-30).
        if any(len(line_node['cac:Item']['cac:ClassifiedTaxCategory']) != 1 for line_node in line_nodes):
            constraints['jp_tax_line'] = _("Each invoice line shall have one and only one tax.")

        # [ibr-057] Each Deliver to address (ibg-15) MUST contain a Deliver to country code (ibt-080).
        delivery_node = document_node['cac:Delivery']
        if delivery_node and not delivery_node['cac:DeliveryLocation']['cac:Address']['cac:Country']['cbc:IdentificationCode']['_text']:
            constraints['jp_delivery_address'] = self._check_required_fields(vals['delivery'], 'country_id')

        return constraints
