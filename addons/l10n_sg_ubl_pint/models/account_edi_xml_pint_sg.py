# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, _


SG_TAX_CATEGORIES = {'SR', 'SRCA-S', 'SRCA-C', 'SROVR-RS', 'SRRC', 'SROVR-LVG', 'SRLVG', 'ZR', 'ES33', 'ESN33', 'DS', 'OS', 'NG', 'NA'}
SG_GST_CODES_REQUIRING_ADDRESS = {'SR', 'SRCA-S', 'SRCA-C', 'ZR', 'SRRC', 'SROVR-RS', 'SROVR-LVG', 'SRLVG', 'NA'}


class AccountEdiXmlPint_Sg(models.AbstractModel):
    """ Singapore implementation of Peppol International (PINT) model for Billing (PINT SG).

    PINT SG is a specialization of the Peppol International model (PINT), not a CIUS of the European norm EN 16931
    nor of Peppol BIS Billing 3.0 (its CustomizationID is 'urn:peppol:pint:billing-1@sg-1'): it inherits the generic
    PINT layer ('account.edi.ubl_pint') and only adds the PINT SG rules (GST categories, UUID, ...).

    * PINT Official documentation: https://docs.peppol.eu/poac/pint/pint/
    * PINT SG Official documentation: https://docs.peppol.eu/poac/sg/pint-sg/
    """
    _name = 'account.edi.xml.pint_sg'
    _inherit = ["account.edi.ubl_pint"]
    _description = "Singapore implementation of Peppol International (PINT) model for Billing"

    def _export_invoice_filename(self, invoice):
        # OVERRIDE account_edi_ubl
        return f"{invoice.name.replace('/', '_')}_pint_sg.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl_pint
        if process_type == 'billing':
            return 'urn:peppol:pint:billing-1@sg-1'
        return None

    # -------------------------------------------------------------------------
    # EXPORT: Values
    # -------------------------------------------------------------------------

    def _export_get_document_type(self, invoice):
        # EXTENDS account.edi.common
        # PINT SG only knows invoices and credit notes: a debit note is an invoice.
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

    # -------------------------------------------------------------------------
    # EXPORT: Templates
    # -------------------------------------------------------------------------

    def _get_tax_category_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.common
        # The cash rounding is reported as the Rounding amount (ibt-114), not as a tax breakdown.
        if self._is_cash_rounding_base_line(base_line):
            return None
        return super()._get_tax_category_grouping_key(base_line, tax_data, vals, currency)

    def _ubl_add_id_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_id_node(vals)
        # [BR-109-GST-SG] Universally unique invoice identifier (BT-SG-003).
        # see https://docs.peppol.eu/poac/sg/pint-sg/bis/#_bis_identifiers
        if self._is_document(vals, 'invoice', 'credit_note'):
            vals['document_node']['cbc:UUID'] = {'_text': vals['invoice']._l10n_sg_get_uuid()}

    def _ubl_add_order_reference_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_order_reference_node(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return

        invoice = vals['invoice']
        if invoice.currency_id != invoice.company_id.currency_id:
            # [BR-53-GST-SG] - If the GST accounting currency code (BT-6-GST) is present, then the Invoice total GST
            # amount (BT-111-GST), Invoice total including GST amount and Invoice Total excluding GST amount in
            # accounting currency shall be provided.
            amounts_in_accounting_currency = (
                ('sgdtotal-excl-gst', invoice.amount_untaxed_signed),
                ('sgdtotal-incl-gst', invoice.amount_total_signed),
            )
            vals['document_node']['cac:AdditionalDocumentReference'] = [
                {
                    'cbc:ID': {'_text': invoice.company_id.currency_id.name},
                    'cbc:DocumentTypeCode': {'_text': code},
                    'cbc:DocumentDescription': {'_text': amount},
                }
                for code, amount in amounts_in_accounting_currency
            ]

    # -------------------------------------------------------------------------
    # EXPORT: Constraints
    # -------------------------------------------------------------------------

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.ubl_pint
        constraints = super()._export_document_constraints(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return constraints

        document_node = vals['document_node']
        line_nodes = document_node.get('cac:InvoiceLine') or document_node.get('cac:CreditNoteLine') or []

        # Each invoice line has one and only one line tax information (ibg-30).
        if any(len(line_node['cac:Item']['cac:ClassifiedTaxCategory']) != 1 for line_node in line_nodes):
            constraints['sg_tax_line'] = _("Each invoice line shall have one and only one tax.")

        # [PEPPOL-EN16931-R003-SG] A buyer reference or purchase order reference MUST be provided.
        if not document_node['cbc:BuyerReference']['_text'] and not document_node['cac:OrderReference']['cbc:ID']['_text']:
            constraints['sg_buyer_reference_or_order_reference'] = _("A buyer reference or purchase order reference must be provided.")

        # [ibr-057] Each Deliver to address (ibg-15) MUST contain a Deliver to country code (ibt-080).
        delivery_node = document_node['cac:Delivery']
        if delivery_node and not delivery_node['cac:DeliveryLocation']['cac:Address']['cac:Country']['cbc:IdentificationCode']['_text']:
            constraints['sg_delivery_address'] = self._check_required_fields(vals['delivery'], 'country_id')

        # Tax category must be filled on the line, with a value from SG categories.
        for tax_total_node in document_node['cac:TaxTotal']:
            for tax_subtotal_node in tax_total_node['cac:TaxSubtotal']:
                for tax_category_node in tax_subtotal_node['cac:TaxCategory']:
                    if tax_category_node['cbc:ID']['_text'] not in SG_TAX_CATEGORIES:
                        constraints['sg_vat_category_required'] = _("You must set a Singaporean tax category on each taxes of the invoice.")

                    # Invoice with GST category code of value 'SR', 'SRCA-S', 'SRCA-C', 'ZR', 'SRRC',
                    # 'SROVR-RS', 'SROVR-LVG', 'SRLVG', 'NA' should contain seller address line and seller
                    # post code
                    if tax_category_node['cbc:ID']['_text'] in SG_GST_CODES_REQUIRING_ADDRESS:
                        constraints['sg_seller_street_addr_required'] = \
                            self._check_required_fields(vals['supplier'], 'street')
                        constraints['sg_seller_post_code_required'] = \
                            self._check_required_fields(vals['supplier'], 'zip')

        return constraints
