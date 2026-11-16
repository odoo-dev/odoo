from odoo import models
from odoo.tools.business_data import split_vat


class AccountEdiXmlUBL21RS(models.AbstractModel):
    """ Serbian CIUS of the European norm EN 16931 (SRBDT 2022) and its extension (SRBDT-EXT 2022), in UBL 2.1, as
    accepted by the Serbian e-invoicing system SEF (Sistem E-Faktura).

    The CustomizationID 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022#conformant#urn:mfin.gov.rs:srbdtext:2022'
    declares the compliance with EN 16931 and the Serbian CIUS/extension only (no Peppol BIS Billing 3.0): the documents
    are sent directly to the SEF API. The format is thus built on the EN 16931 UBL syntax binding
    ('account.edi.ubl_cen_en16931') and only adds the Serbian specifics.

    * Specification: SEF technical documentation, Ministry of Finance of Serbia: https://www.efaktura.gov.rs
      (e.g. "Elektronsko fakturisanje - UBL 2.1 specifikacija", https://www.efaktura.gov.rs/tekst/356/tehnicka-dokumentacija.php)
    * EN 16931 validation artefacts: https://github.com/ConnectingEurope/eInvoicing-EN16931
    """
    _name = "account.edi.xml.ubl.rs"
    _inherit = ['account.edi.ubl_cen_en16931']
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

    def _ubl_add_buyer_reference_node(self, vals):
        # EXTENDS account.edi.ubl_cen_en16931
        # Buyer reference (BT-10): only the reference of the commercial partner (not the one of the invoice address).
        super()._ubl_add_buyer_reference_node(vals)
        vals['document_node']['cbc:BuyerReference']['_text'] = vals['customer'].commercial_partner_id.ref or None

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
        vals['party_node']['cac:PartyLegalEntity'] = [{
            'cbc:RegistrationName': {'_text': partner.name},
            'cbc:CompanyID': {'_text': partner.l10n_rs_edi_registration_number},
        }]

    def _ubl_get_delivery_node_from_delivery_address(self, vals):
        # EXTENDS account.edi.ubl_cen_en16931
        # DELIVERY INFORMATION (BG-13): the actual delivery date (BT-72) and the deliver to address (BG-15), without
        # Deliver to party name (BT-70).
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)
        node['cac:DeliveryParty'] = None
        # SEF: a credit note has no delivery date, the date of supply is the one of the corrected invoice.
        if self._is_document(vals, 'credit_note'):
            node['cbc:ActualDeliveryDate'] = None
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
