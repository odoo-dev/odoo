from odoo import models, _
from odoo.tools import html2plaintext

from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt

DEFAULT_VAT = '0000000000000'
SECTOR_RO_CODES = ('SECTOR1', 'SECTOR2', 'SECTOR3', 'SECTOR4', 'SECTOR5', 'SECTOR6')


def get_formatted_sector_ro(city: str):
    return city.upper().replace(' ', '')


def _has_vat(vat):
    return bool(vat and len(vat) > 1)


def _get_customer_vat(commercial_partner):
    # SPV checks an identifier without country prefix as a Romanian CUI
    vat = commercial_partner.vat or commercial_partner._get_additional_identifier('RO_VAT')
    country_code = commercial_partner.country_code
    if vat and country_code and country_code != 'RO' and not vat[:2].isalpha():
        return ('EL' if country_code == 'GR' else country_code) + vat
    return vat


class AccountEdiXmlUbl_Ro(models.AbstractModel):
    """ Romanian CIUS of the European norm EN 16931 (CIUS-RO), in UBL 2.1, exchanged through the ANAF RO e-Factura
    system (SPV).

    The CustomizationID 'urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1' declares the
    compliance with EN 16931 and CIUS-RO only: it is not a Peppol BIS Billing 3.0 extension and is not transported
    over Peppol. The format is thus built on the EN 16931 rules mixed with the UBL syntax; the few EN 16931 UBL
    binding behaviors it needs (previously inherited from Peppol BIS 3) are explicitly re-added below.

    * Specification (Ordinul MF 1366/2021, CIUS-RO): https://mfinante.gov.ro/web/efactura/informatii-tehnice
    * EN 16931 validation artefacts: https://github.com/ConnectingEurope/eInvoicing-EN16931
    """
    _name = 'account.edi.xml.ubl_ro'
    _inherit = ['account.edi.cen_en16931', 'account.edi.ubl']
    _description = "CIUS RO"

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_cius_ro.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl
        if process_type == 'billing':
            return 'urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1'
        return super()._get_customization_id(process_type=process_type)

    def _get_document_type_code_node(self, invoice, invoice_data):
        # [UBL-SR-43] DocumentTypeCode should only show up on a CreditNote XML with the value '50'
        if invoice.move_type == 'out_refund':
            return {'_text': '50'}

    # -------------------------------------------------------------------------
    # EXPORT: EN 16931 UBL binding
    # (generic EN 16931 behaviors previously inherited from Peppol BIS 3 / PINT EU)
    # -------------------------------------------------------------------------

    def _ubl_add_invoice_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-04] Invoice type code (BT-3): 380 (Commercial invoice).
        super()._ubl_add_invoice_type_code_node(vals)
        if self._is_document(vals, 'invoice'):
            vals['document_node']['cbc:InvoiceTypeCode']['_text'] = 380

    def _ubl_add_credit_note_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-04] Invoice type code (BT-3): 381 (Credit note).
        super()._ubl_add_credit_note_type_code_node(vals)
        if self._is_document(vals, 'credit_note'):
            vals['document_node']['cbc:CreditNoteTypeCode']['_text'] = 381

    def _ubl_add_version_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # [UBL-CR-001] The UBL version is not part of EN 16931 (warning): not reported.
        super()._ubl_add_version_id_node(vals)
        vals['document_node']['cbc:UBLVersionID']['_text'] = None

    def _ubl_add_notes_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Invoice note (BT-22): the terms and conditions of the invoice.
        # [BR-RO-L300] CIUS-RO limits the note to 300 characters.
        super()._ubl_add_notes_nodes(vals)
        if self._is_document(vals, 'invoice', 'credit_note'):
            invoice = vals['invoice']
            note = html2plaintext(invoice.narration) if invoice.narration else None
            vals['document_node']['cbc:Note'] = {'_text': note[:300] if note else None}

    def _ubl_add_document_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-05] An Invoice shall have an Invoice currency code (BT-5).
        self._ubl_add_document_currency_code_node_foreign_currency(vals)

    def _ubl_add_tax_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # VAT accounting currency code (BT-6): always the company currency (RON) for ANAF.
        self._ubl_add_tax_currency_code_node_company_currency(vals)

    def _ubl_add_buyer_reference_node(self, vals):
        # EXTENDS account.edi.ubl
        # Buyer reference (BT-10).
        super()._ubl_add_buyer_reference_node(vals)
        customer = vals['customer']
        if customer_ref := customer.ref or customer.commercial_partner_id.ref:
            vals['document_node']['cbc:BuyerReference']['_text'] = customer_ref

    def _ubl_add_billing_reference_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Preceding invoice reference (BG-3): the invoices reconciled with the credit note.
        super()._ubl_add_billing_reference_nodes(vals)
        if self._is_document(vals, 'credit_note'):
            credit_note = vals['invoice']
            payment_term_lines = credit_note.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable')
            nodes = vals['document_node']['cac:BillingReference']
            for name in payment_term_lines.matched_credit_ids.credit_move_id.move_id.mapped('name'):
                if name and name != '/':
                    nodes.append({'cac:InvoiceDocumentReference': {'cbc:ID': {'_text': name}}})

    def _ubl_get_partner_address_node(self, vals, partner):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_partner_address_node(vals, partner)
        # The country subdivision code and the country name are not part of EN 16931 (UBL-CR-* warnings).
        node['cbc:CountrySubentityCode'] = None
        node['cac:Country']['cbc:Name'] = None

        if not partner.state_id:
            return node

        # [BR-RO-110/BR-RO-111] The country subdivision is the ISO 3166-2:RO code ('RO-B', 'RO-CJ', ...).
        node['cbc:CountrySubentity']['_text'] = f'{partner.country_code}-{partner.state_id.code}'

        # [BR-RO-100] Romania requires the CityName to be in the format of "SECTORX" if the address state is in Bucharest.
        if partner.state_id.code == 'B' and partner.city:
            node['cbc:CityName']['_text'] = get_formatted_sector_ro(partner.city)

        return node

    def _ubl_add_party_endpoint_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # Seller/Buyer electronic address (BT-34/BT-49), from the routing identifier of the partner.
        super()._ubl_add_party_endpoint_id_node(vals)
        partner = vals['party_vals']['partner']
        if identifier_vals := partner._get_preferred_routing_identifier_vals():
            normalized_value = self.env['res.partner']._validate_identifier_by_scheme(identifier_vals['scheme'], identifier_vals['value']).get('value')
            vals['party_node']['cbc:EndpointID']['_text'] = normalized_value
            vals['party_node']['cbc:EndpointID']['schemeID'] = identifier_vals['scheme']

    def _ubl_add_party_identification_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Seller/Buyer identifier (BT-29/BT-46): the internal reference of the partner.
        super()._ubl_add_party_identification_nodes(vals)
        commercial_partner = vals['party_vals']['partner'].commercial_partner_id
        if commercial_partner.ref:
            vals['party_node']['cac:PartyIdentification'].append({
                'cbc:ID': {'_text': commercial_partner.ref, 'schemeID': None},
            })

    def _ubl_add_delivery_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # DELIVERY INFORMATION (BG-13) occurs at most once.
        super()._ubl_add_delivery_nodes(vals)
        document_node = vals['document_node']
        document_node['cac:Delivery'] = document_node['cac:Delivery'][0] if document_node['cac:Delivery'] else None

    def _ubl_get_delivery_node_from_delivery_address(self, vals):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)
        # [BR-IC-11] Intra-community supply: the actual delivery date (BT-72) or the invoicing period is required.
        if self._is_document(vals, 'invoice', 'credit_note') and self._is_intracommunity_supply(vals):
            node['cbc:ActualDeliveryDate']['_text'] = vals['invoice'].invoice_date
        # Only the Deliver to party name (BT-70) is part of EN 16931.
        node['cac:DeliveryParty'].update({
            'cbc:EndpointID': None,
            'cac:PartyIdentification': [],
            'cac:PostalAddress': None,
            'cac:PartyTaxScheme': [],
            'cac:PartyLegalEntity': [],
            'cac:Contact': None,
        })
        return node

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Invoice line allowances (BG-27) and charges (BG-28).
        super()._ubl_add_line_allowance_charge_nodes(vals)
        self._ubl_add_line_allowance_charge_nodes_for_discount(vals)
        self._ubl_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(vals)
        self._ubl_add_line_allowance_charge_nodes_for_excise_taxes(vals)

    def _ubl_add_line_item_name_description_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-RO-L100] Item name (BT-153) max 100 characters, [BR-RO-L200] Item description (BT-154) max 200 characters.
        super()._ubl_add_line_item_name_description_nodes(vals)
        item_node = vals['item_node']

        if name := item_node['cbc:Name'] and item_node['cbc:Name'].get('_text'):
            item_node['cbc:Name']['_text'] = name[:100]
        if description := item_node['cbc:Description'] and item_node['cbc:Description'].get('_text'):
            item_node['cbc:Description']['_text'] = description[:200]

    def _ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(self, vals, partner_bank):
        # EXTENDS account.edi.ubl
        # Payment service provider identifier (BT-86): the BIC only (no scheme, no financial institution).
        node = super()._ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(vals, partner_bank)
        if node:
            node['cbc:ID']['schemeID'] = None
            node['cac:FinancialInstitution'] = None
        return node

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

    # -------------------------------------------------------------------------
    # EXPORT: CIUS-RO party identifiers
    # -------------------------------------------------------------------------

    def _ubl_add_accounting_supplier_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_accounting_supplier_party_tax_scheme_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        ro_vat = commercial_partner.vat or commercial_partner._get_additional_identifier('RO_VAT')
        if not _has_vat(ro_vat):
            company_id = commercial_partner._get_additional_identifier('RO_EN')
        else:
            company_id = ro_vat

        vals['party_node']['cac:PartyTaxScheme'] = [{
            'cbc:CompanyID': {'_text': company_id},
            'cac:TaxScheme': {
                'cbc:ID': {'_text': 'VAT' if company_id[:2].isalpha() else 'NOT_EU_VAT'},
            },
        }] if company_id else []

    def _ubl_add_accounting_supplier_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_accounting_supplier_party_legal_entity_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        ro_vat = commercial_partner.vat or commercial_partner._get_additional_identifier('RO_VAT')
        # RO legal registration id is the (RO-prefixed) VAT, not the bare CUI/RO_EN.
        value = ro_vat if _has_vat(ro_vat) else commercial_partner._get_additional_identifier('RO_EN')
        vals['party_node']['cac:PartyLegalEntity'] = [{
            'cbc:RegistrationName': {'_text': commercial_partner.name},
            'cbc:CompanyID': {
                '_text': value,
                'schemeID': None,
            },
        }] if value else []

    def _ubl_add_accounting_customer_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_accounting_customer_party_tax_scheme_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        ro_vat = _get_customer_vat(commercial_partner)
        company_id = ro_vat if _has_vat(ro_vat) else DEFAULT_VAT

        vals['party_node']['cac:PartyTaxScheme'] = [{
            'cbc:CompanyID': {'_text': company_id},
            'cac:TaxScheme': {
                'cbc:ID': {'_text': 'VAT' if company_id[:2].isalpha() else 'NOT_EU_VAT'},
            },
        }]

    def _ubl_add_accounting_customer_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_accounting_customer_party_legal_entity_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        ro_vat = _get_customer_vat(commercial_partner)
        # RO legal registration id is the (RO-prefixed) VAT, not the bare CUI/RO_EN.
        vals['party_node']['cac:PartyLegalEntity'] = [{
            'cbc:RegistrationName': {'_text': commercial_partner.name},
            'cbc:CompanyID': {
                '_text': ro_vat if _has_vat(ro_vat) else DEFAULT_VAT,
                'schemeID': None,
            },
        }]

    # -------------------------------------------------------------------------
    # EXPORT: Constraints
    # -------------------------------------------------------------------------

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.cen_en16931
        constraints = super()._export_document_constraints(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return constraints

        # Default VAT is only allowed for the receiver (customer), not the provider (supplier)
        supplier = vals['supplier'].commercial_partner_id
        if (
            not _has_vat(supplier.vat)
            and not supplier._get_additional_identifier('RO_EN')
        ):
            constraints["ciusro_supplier_tax_identifier_required"] = _(
                "The following partner doesn't have a VAT nor any other Peppol-routable identifier: %s. "
                "At least one of them is required. ",
                vals['supplier'].display_name)

        for partner_type in ('supplier', 'customer'):
            partner = vals[partner_type]

            constraints.update({
                f"ciusro_{partner_type}_city_required": self._check_required_fields(partner, 'city'),
                f"ciusro_{partner_type}_street_required": self._check_required_fields(partner, 'street'),
                f"ciusro_{partner_type}_state_id_required": self._check_required_fields(partner, 'state_id'),
            })

            if (partner.country_code == 'RO'
                    and partner.state_id
                    and partner.state_id.code == 'B'
                    and partner.city
                    and get_formatted_sector_ro(partner.city) not in SECTOR_RO_CODES):
                constraints[f"ciusro_{partner_type}_invalid_city_name"] = _(
                    "The following partner's city name is invalid: %s. "
                    "If partner's state is București, the city name must be 'SECTORX', "
                    "where X is a number between 1-6.",
                    partner.display_name)

        return constraints

    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _import_ubl_invoice_add_customer_values(self, collected_values):
        # EXTENDS account.edi.ubl
        super()._import_ubl_invoice_add_customer_values(collected_values)
        customer_values = collected_values['customer_values']
        # ANAF allows for endpoints to be an email address; we don't want to create
        # a partner whose routing endpoint is an email, so drop it in that case.
        if '@' in (customer_values.get('routing_endpoint') or ''):
            customer_values.pop('routing_scheme', None)
            customer_values.pop('routing_endpoint', None)
