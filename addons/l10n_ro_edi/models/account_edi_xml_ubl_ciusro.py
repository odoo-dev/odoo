from odoo import models, _

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
    over Peppol. The format is thus built on the EN 16931 UBL syntax binding ('account.edi.ubl_cen_en16931') and only
    adds the CIUS-RO rules (BR-RO-*).

    * Specification (Ordinul MF 1366/2021, CIUS-RO): https://mfinante.gov.ro/web/efactura/informatii-tehnice
    * EN 16931 validation artefacts: https://github.com/ConnectingEurope/eInvoicing-EN16931
    """
    _name = 'account.edi.xml.ubl_ro'
    _inherit = ['account.edi.ubl_cen_en16931']
    _description = "CIUS RO"

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_cius_ro.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl
        if process_type == 'billing':
            return 'urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1'
        return super()._get_customization_id(process_type=process_type)

    def _get_business_term_max_lengths(self):
        # EXTENDS account.edi.common
        # [BR-RO-L300] CIUS-RO limits the Invoice note (BT-22) to 300 characters.
        return {
            **super()._get_business_term_max_lengths(),
            'BT-22': 300,
        }

    def _get_document_type_code_node(self, invoice, invoice_data):
        # [UBL-SR-43] DocumentTypeCode should only show up on a CreditNote XML with the value '50'
        if invoice.move_type == 'out_refund':
            return {'_text': '50'}

    # -------------------------------------------------------------------------
    # EXPORT: Header nodes
    # -------------------------------------------------------------------------

    def _ubl_add_version_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # The UBL version is not part of the EN 16931 semantic model: not reported (UBL-CR-002 tolerates '2.1').
        super()._ubl_add_version_id_node(vals)
        vals['document_node']['cbc:UBLVersionID']['_text'] = None

    def _ubl_add_tax_currency_code_node(self, vals):
        # OVERRIDE account.edi.ubl_cen_en16931
        # VAT accounting currency code (BT-6): always the company currency (RON) for ANAF, even for an invoice in RON.
        self._ubl_add_tax_currency_code_node_company_currency(vals)

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
        # EXTENDS account.edi.ubl_cen_en16931
        node = super()._ubl_get_partner_address_node(vals, partner)
        if not partner.state_id:
            return node

        # [BR-RO-110/BR-RO-111] The country subdivision is the ISO 3166-2:RO code ('RO-B', 'RO-CJ', ...).
        node['cbc:CountrySubentity']['_text'] = f'{partner.country_code}-{partner.state_id.code}'

        # [BR-RO-100] Romania requires the CityName to be in the format of "SECTORX" if the address state is in Bucharest.
        if partner.state_id.code == 'B' and partner.city:
            node['cbc:CityName']['_text'] = get_formatted_sector_ro(partner.city)

        return node

    def _ubl_add_party_identification_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Seller/Buyer identifier (BT-29/BT-46): the internal reference of the partner.
        super()._ubl_add_party_identification_nodes(vals)
        commercial_partner = vals['party_vals']['partner'].commercial_partner_id
        if commercial_partner.ref:
            vals['party_node']['cac:PartyIdentification'].append({
                'cbc:ID': {'_text': commercial_partner.ref, 'schemeID': None},
            })

    def _ubl_add_line_item_name_description_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-RO-L100] Item name (BT-153) max 100 characters, [BR-RO-L200] Item description (BT-154) max 200 characters.
        super()._ubl_add_line_item_name_description_nodes(vals)
        item_node = vals['item_node']

        if name := item_node['cbc:Name'] and item_node['cbc:Name'].get('_text'):
            item_node['cbc:Name']['_text'] = name[:100]
        if description := item_node['cbc:Description'] and item_node['cbc:Description'].get('_text'):
            item_node['cbc:Description']['_text'] = description[:200]

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
        # EXTENDS account.edi.ubl_cen_en16931
        constraints = super()._export_document_constraints(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return constraints

        # [BR-CO-09] only applies to the VAT identifiers: an identifier without country prefix (Romanian CUI of a
        # company not registered for VAT) is reported with the 'NOT_EU_VAT' tax scheme, i.e. as a tax registration
        # identifier (BT-32), not as a VAT identifier (see '_ubl_add_accounting_*_party_tax_scheme_nodes').
        constraints.pop('cen_en16931_supplier_vat_country_code', None)
        constraints.pop('cen_en16931_customer_vat_country_code', None)

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
