from odoo import models
from odoo.tools import html2plaintext
from odoo.tools.business_data import split_vat

from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt


class AccountEdiXmlUBL21RS(models.AbstractModel):
    """ Serbian CIUS of the European norm EN 16931 (SRBDT 2022) and its extension (SRBDT-EXT 2022), in UBL 2.1, as
    accepted by the Serbian e-invoicing system SEF (Sistem E-Faktura).

    The CustomizationID 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022#conformant#urn:mfin.gov.rs:srbdtext:2022'
    declares the compliance with EN 16931 and the Serbian CIUS/extension only (no Peppol BIS Billing 3.0): the documents
    are sent directly to the SEF API. The format is thus built on the EN 16931 rules mixed with the UBL syntax.

    * Specification: SEF technical documentation, Ministry of Finance of Serbia: https://www.efaktura.gov.rs
      (e.g. "Elektronsko fakturisanje - UBL 2.1 specifikacija", https://www.efaktura.gov.rs/tekst/356/tehnicka-dokumentacija.php)
    * EN 16931 validation artefacts: https://github.com/ConnectingEurope/eInvoicing-EN16931
    """
    _name = "account.edi.xml.ubl.rs"
    _inherit = ['account.edi.cen_en16931', 'account.edi.ubl']
    _description = "UBL 2.1 (RS eFaktura)"

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_ubl_rs.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl
        if process_type == 'billing':
            return 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022#conformant#urn:mfin.gov.rs:srbdtext:2022'
        return super()._get_customization_id(process_type=process_type)

    # -------------------------------------------------------------------------
    # EXPORT: Header nodes
    # -------------------------------------------------------------------------

    def _ubl_add_invoice_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-04] Invoice type code (BT-3).
        super()._ubl_add_invoice_type_code_node(vals)
        if self._is_document(vals, 'invoice'):
            vals['document_node']['cbc:InvoiceTypeCode']['_text'] = 380

    def _ubl_add_credit_note_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_credit_note_type_code_node(vals)
        if self._is_document(vals, 'credit_note'):
            vals['document_node']['cbc:CreditNoteTypeCode']['_text'] = 381

    def _ubl_add_notes_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Invoice note (BT-22).
        super()._ubl_add_notes_nodes(vals)
        if self._is_document(vals, 'invoice', 'credit_note'):
            invoice = vals['invoice']
            if invoice.narration:
                vals['document_node']['cbc:Note'].append({'_text': self._edi_truncate(html2plaintext(invoice.narration), 'BT-22')})

    def _ubl_add_document_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-05] An Invoice shall have an Invoice currency code (BT-5).
        self._ubl_add_document_currency_code_node_foreign_currency(vals)

    def _ubl_add_tax_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # VAT accounting currency code (BT-6), only when different from the invoice currency.
        super()._ubl_add_tax_currency_code_node(vals)
        if vals['currency'] != vals['company_currency']:
            vals['document_node']['cbc:TaxCurrencyCode']['_text'] = vals['company_currency'].name

    def _ubl_add_buyer_reference_node(self, vals):
        # EXTENDS account.edi.ubl
        # Buyer reference (BT-10).
        super()._ubl_add_buyer_reference_node(vals)
        if customer_ref := vals['customer'].commercial_partner_id.ref:
            vals['document_node']['cbc:BuyerReference']['_text'] = customer_ref

    def _ubl_add_invoice_period_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Value added tax point date code (BT-8): 3 (issue date), 35 (delivery date) or 432 (paid to date).
        # SEF expects '0' on credit notes (the tax point is the one of the corrected invoice).
        super()._ubl_add_invoice_period_nodes(vals)
        if self._is_document(vals, 'invoice', 'credit_note'):
            invoice = vals['invoice']
            vals['document_node']['cac:InvoicePeriod'] = {
                'cbc:DescriptionCode': {
                    '_text': '0' if invoice.move_type == 'out_refund' else invoice.l10n_rs_tax_date_obligations_code,
                },
            }

    def _ubl_add_billing_reference_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # PRECEDING INVOICE REFERENCE (BG-3): the corrected invoice (BT-25) and its issue date (BT-26).
        super()._ubl_add_billing_reference_nodes(vals)
        if self._is_document(vals, 'credit_note') and (reversed_entry := vals['invoice'].reversed_entry_id):
            vals['document_node']['cac:BillingReference'].append({
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {'_text': reversed_entry.name},
                    'cbc:IssueDate': {'_text': reversed_entry.invoice_date},
                },
            })

    # -------------------------------------------------------------------------
    # EXPORT: Party nodes
    # -------------------------------------------------------------------------

    def _ubl_get_partner_address_node(self, vals, partner):
        # EXTENDS account.edi.ubl
        # The country subdivision code and the country name are not part of EN 16931 (UBL-CR-* warnings).
        node = super()._ubl_get_partner_address_node(vals, partner)
        node['cbc:CountrySubentityCode'] = None
        node['cac:Country']['cbc:Name'] = None
        return node

    def _ubl_add_party_endpoint_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # Seller/Buyer electronic address (BT-34/BT-49): the PIB (Serbian tax number), scheme 9948.
        super()._ubl_add_party_endpoint_id_node(vals)
        partner = vals['party_vals']['partner']
        _vat_country, vat_number = split_vat(partner.commercial_partner_id.vat, default_country_code='RS')
        vals['party_node']['cbc:EndpointID'].update({
            '_text': vat_number,
            'schemeID': '9948',
        })

    def _ubl_add_party_identification_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # SRBDT-EXT: the public funds beneficiary number (JBKJS) of the Serbian public sector parties.
        super()._ubl_add_party_identification_nodes(vals)
        partner = vals['party_vals']['partner'].commercial_partner_id
        if partner.country_code == 'RS' and partner.l10n_rs_edi_public_funds:
            vals['party_node']['cac:PartyIdentification'].append({
                'cbc:ID': {'_text': f'JBKJS: {partner.l10n_rs_edi_public_funds}'},
            })

    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Seller/Buyer legal registration name and identifier (BT-27/BT-30, BT-44/BT-47): the registration number
        # (Matični broj) assigned by the Serbian Business Registers Agency.
        super()._ubl_add_party_legal_entity_nodes(vals)
        partner = vals['party_vals']['partner'].commercial_partner_id
        vals['party_node']['cac:PartyLegalEntity'].append({
            'cbc:RegistrationName': {'_text': partner.name},
            'cbc:CompanyID': {'_text': partner.l10n_rs_edi_registration_number},
        })

    def _ubl_get_delivery_node_from_delivery_address(self, vals):
        # EXTENDS account.edi.ubl
        # DELIVERY INFORMATION (BG-13): the actual delivery date (BT-72) and the deliver to address (BG-15).
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)
        node['cac:DeliveryParty'] = None
        # SEF: a credit note has no delivery date, the date of supply is the one of the corrected invoice.
        if self._is_document(vals, 'credit_note'):
            node['cbc:ActualDeliveryDate'] = None
        return node

    def _ubl_add_delivery_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # DELIVERY INFORMATION (BG-13) occurs at most once.
        super()._ubl_add_delivery_nodes(vals)
        document_node = vals['document_node']
        document_node['cac:Delivery'] = document_node['cac:Delivery'][0] if document_node['cac:Delivery'] else None

    def _ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(self, vals, partner_bank):
        # EXTENDS account.edi.ubl
        # Payment service provider identifier (BT-86): the BIC only (no scheme, no financial institution).
        node = super()._ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(vals, partner_bank)
        if node:
            node['cbc:ID']['schemeID'] = None
            node['cac:FinancialInstitution'] = None
        return node

    # -------------------------------------------------------------------------
    # EXPORT: Line nodes
    # -------------------------------------------------------------------------

    def _ubl_add_line_quantity_unit_code_rs(self, vals, tag):
        # SEF uses H87 (piece) instead of C62 (one).
        quantity_node = vals['line_node'][tag]
        if quantity_node['unitCode'] == 'C62':
            quantity_node['unitCode'] = 'H87'

    def _ubl_add_line_invoiced_quantity_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_line_invoiced_quantity_node(vals)
        self._ubl_add_line_quantity_unit_code_rs(vals, 'cbc:InvoicedQuantity')

    def _ubl_add_line_credited_quantity_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_line_credited_quantity_node(vals)
        self._ubl_add_line_quantity_unit_code_rs(vals, 'cbc:CreditedQuantity')

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Invoice line allowances (BG-27) and charges (BG-28).
        super()._ubl_add_line_allowance_charge_nodes(vals)
        self._ubl_add_line_allowance_charge_nodes_for_discount(vals)
        self._ubl_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(vals)
        self._ubl_add_line_allowance_charge_nodes_for_excise_taxes(vals)

    # -------------------------------------------------------------------------
    # EXPORT: Tax totals
    # -------------------------------------------------------------------------

    def _ubl_get_tax_subtotal_node(self, vals, tax_subtotal):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_tax_subtotal_node(vals, tax_subtotal)
        # TaxSubtotal/Percent is not part of EN 16931 (UBL-CR-* warning): the rate is TaxCategory/Percent (BT-119).
        node['cbc:Percent'] = None

        # [BR-S-08]/[BR-E-08]/[BR-Z-08]/... The VAT category taxable amount (BT-116) shall equal the sum of the
        # line net amounts plus the document level charges minus the document level allowances of that category.
        currency = tax_subtotal['currency']
        if currency != vals['currency']:
            return node
        document_node = vals['document_node']

        def same_category(tax_category_node, other_tax_category_node):
            return (
                other_tax_category_node['cbc:ID']['_text'] == tax_category_node['cbc:ID']['_text']
                and other_tax_category_node['cbc:Percent']['_text'] == tax_category_node['cbc:Percent']['_text']
            )

        amounts = []
        for tax_category_node in node['cac:TaxCategory']:
            for line_key in ('cac:InvoiceLine', 'cac:CreditNoteLine'):
                for line_node in document_node.get(line_key, []):
                    if any(same_category(tax_category_node, n) for n in line_node['cac:Item']['cac:ClassifiedTaxCategory']):
                        amounts.append(line_node['cbc:LineExtensionAmount']['_text'])
            for allowance_charge_node in document_node['cac:AllowanceCharge']:
                if any(same_category(tax_category_node, n) for n in allowance_charge_node['cac:TaxCategory']):
                    sign = 1 if allowance_charge_node['cbc:ChargeIndicator']['_text'] == 'true' else -1
                    amounts.append(sign * allowance_charge_node['cbc:Amount']['_text'])
        if amounts:
            node['cbc:TaxableAmount']['_text'] = FloatFmt(sum(amounts), min_dp=currency.decimal_places)
        return node

    def _ubl_tax_totals_node_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.ubl
        tax_total_keys = super()._ubl_tax_totals_node_grouping_key(base_line, tax_data, vals, currency)
        # The Invoice total VAT amount in accounting currency (BT-111) is a TaxTotal without TaxSubtotal.
        if (
            tax_total_keys['tax_subtotal_key']
            and vals['company_currency'] != vals['currency']
            and tax_total_keys['tax_subtotal_key']['currency'] == vals['company_currency']
        ):
            tax_total_keys['tax_subtotal_key'] = None
        return tax_total_keys
