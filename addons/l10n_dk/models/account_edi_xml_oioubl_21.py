from odoo import _, models
from odoo.tools import html2plaintext
from odoo.tools.business_data import street_split

from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt

DANISH_NATIONAL_IT_AND_TELECOM_AGENCY_ID = '320'

UBL_TO_OIOUBL_TAX_CATEGORY_ID_MAPPING = {
    # Simple mapping between tax type provided in UBL and what is accepted in OIOUBL
    # https://docs.peppol.eu/poacc/billing/3.0/codelist/UNCL5305/
    # https://www.oioubl.info/codelists/en/urn_oioubl_id_taxcategoryid-1.1.html
    'AE': 'ReverseCharge',
    'E': 'ZeroRated',
    'S': 'StandardRated',
    'Z': 'ZeroRated',
    'G': 'ZeroRated',
    'O': 'ZeroRated',
    'K': 'ReverseCharge',
    'L': 'ZeroRated',
    'M': 'ZeroRated',
}

SCHEME_ID_MAPPING = {
    '0088': 'GLN',
    '0184': 'DK:CVR',
    '9918': 'IBAN',
    '0198': 'DK:SE',
}

# https://www.oioubl.info/Classes/en/TaxScheme.html
OIOUBL_TAX_SCHEME = {
    'cbc:ID': {
        '_text': 63,
        'schemeID': 'urn:oioubl:id:taxschemeid-1.5',
    },
    'cbc:Name': {'_text': 'Moms'},
}


def format_vat_number(partner, vat):
    vat = (vat or '').replace(' ', '')
    if vat[:2].isnumeric():
        vat = partner.country_code.upper() + vat
    return vat


class AccountEdiXmlOIOUBL21(models.AbstractModel):
    """ OIOUBL 2.1, the Danish national customization of UBL 2.1, exchanged through Nemhandel (NemHandel / eDelivery).

    The CustomizationID 'OIOUBL-2.1' (ProfileID 'Procurement-BilSim-1.0', scheme 'urn:oioubl:id:profileid-1.6') is a
    national UBL customization which predates and is not compliant with the European norm EN 16931 (e.g.
    LegalMonetaryTotal/TaxExclusiveAmount holds the total tax amount, specific code lists for the tax categories and the
    tax scheme, structured Danish addresses...). It is therefore built on the UBL 2.1 syntax layer only.

    * Specification: https://www.oioubl.info (OIOUBL 2.1 classes and code lists)
    * Schematron: https://rep.erst.dk/git/openebusiness/common/-/tree/master/resources/Schematrons/OIOUBL
    """
    _name = "account.edi.xml.oioubl_21"
    _inherit = 'account.edi.ubl'
    _description = "OIOUBL 2.1"

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_oioubl_21.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl
        if process_type == 'billing':
            return 'OIOUBL-2.1'
        return super()._get_customization_id(process_type=process_type)

    def _export_get_document_type(self, invoice):
        # EXTENDS account.edi.common
        # OIOUBL has no DebitNote document: a debit note is an invoice.
        document_type = super()._export_get_document_type(invoice)
        if document_type == 'debit_note':
            return 'invoice'
        return document_type

    def _get_document_type_code_node(self, invoice, invoice_data):
        # EXTENDS account.edi.ubl
        # http://www.datypic.com/sc/ubl20/e-cbc_DocumentTypeCode.html
        return {
            '_text': '380' if invoice.move_type == 'out_invoice' else '381',
            'listAgencyID': '6',
            'listID': 'UN/ECE 1001',
        }

    # -------------------------------------------------------------------------
    # EXPORT: Values
    # -------------------------------------------------------------------------

    def _ubl_should_export_emptying_taxes_as_lines(self, vals):
        # EXTENDS account.edi.ubl
        # The emptying taxes (e.g. deposits on bottles) are reported as separated lines.
        return True

    def _should_export_early_payment_discount_as_line(self, vals):
        # EXTENDS account.edi.common
        # The early payment discount is a document level allowance/charge.
        return False

    def _should_export_cash_rounding_as_line(self, vals):
        # EXTENDS account.edi.common
        # The cash rounding is reported in LegalMonetaryTotal/PayableRoundingAmount.
        return False

    def _get_tax_category_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.common
        # The cash rounding is not taxed: it is reported in LegalMonetaryTotal/PayableRoundingAmount.
        if self._is_cash_rounding_base_line(base_line):
            return None
        return super()._get_tax_category_grouping_key(base_line, tax_data, vals, currency)

    # -------------------------------------------------------------------------
    # EXPORT: Document
    # -------------------------------------------------------------------------

    def _fill_document_values(self, vals):
        # EXTENDS account.edi.ubl
        super()._fill_document_values(vals)
        # OIOUBL needs the amounts to be formatted with 2 decimals, whatever the precision of the currency.
        self._oioubl_format_amounts(vals['document_node'])

    def _oioubl_format_amounts(self, node, tag=None):
        if isinstance(node, list):
            for sub_node in node:
                self._oioubl_format_amounts(sub_node, tag=tag)
        elif isinstance(node, dict):
            if (
                tag != 'cbc:PriceAmount'
                and node.get('currencyID')
                and isinstance(node.get('_text'), float)
            ):
                node['_text'] = FloatFmt(node['_text'], min_dp=2, max_dp=2)
            for sub_tag, sub_node in node.items():
                if not sub_tag.startswith('_'):
                    self._oioubl_format_amounts(sub_node, tag=sub_tag)

    # -------------------------------------------------------------------------
    # EXPORT: Header nodes
    # -------------------------------------------------------------------------

    def _ubl_add_profile_id_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_profile_id_node(vals)
        vals['document_node']['cbc:ProfileID'] = {
            '_text': 'Procurement-BilSim-1.0',
            'schemeID': 'urn:oioubl:id:profileid-1.6',
            'schemeAgencyID': DANISH_NATIONAL_IT_AND_TELECOM_AGENCY_ID,
        }

    def _ubl_add_invoice_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_invoice_type_code_node(vals)
        if self._is_document(vals, 'invoice'):
            vals['document_node']['cbc:InvoiceTypeCode'] = {
                '_text': 380,
                'listID': 'urn:oioubl:codelist:invoicetypecode-1.2',
                'listAgencyID': DANISH_NATIONAL_IT_AND_TELECOM_AGENCY_ID,
            }

    def _ubl_add_credit_note_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_credit_note_type_code_node(vals)
        if self._is_document(vals, 'credit_note'):
            vals['document_node']['cbc:CreditNoteTypeCode'] = {
                '_text': 381,
                'listID': 'urn:oioubl:codelist:invoicetypecode-1.2',
                'listAgencyID': DANISH_NATIONAL_IT_AND_TELECOM_AGENCY_ID,
            }

    def _ubl_add_notes_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_notes_nodes(vals)
        if self._is_document(vals, 'invoice', 'credit_note') and (narration := vals['invoice'].narration):
            vals['document_node']['cbc:Note'].append({'_text': html2plaintext(narration)})

    def _ubl_add_document_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl
        self._ubl_add_document_currency_code_node_foreign_currency(vals)

    def _ubl_add_buyer_reference_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_buyer_reference_node(vals)
        if self._is_document(vals, 'invoice', 'credit_note'):
            vals['document_node']['cbc:BuyerReference']['_text'] = vals['invoice'].commercial_partner_id.ref

    # -------------------------------------------------------------------------
    # EXPORT: Party nodes
    # -------------------------------------------------------------------------

    def _oioubl_add_address_values(self, node, street):
        # https://www.oioubl.info/Classes/en/Address.html
        address = street_split(street)
        node.update({
            'cbc:AddressFormatCode': {
                # could be 'UN/CEFACT codelist 3477' instead of StructuredDK' for partner out of DK
                # not implemented yet because `StructuredDK` seems more than enough
                '_text': 'StructuredDK',
                'listAgencyID': DANISH_NATIONAL_IT_AND_TELECOM_AGENCY_ID,
                'listID': 'urn:oioubl:codelist:addressformatcode-1.1',
            },
            'cbc:StreetName': {'_text': address.get('street_name')},
            'cbc:BuildingNumber': {'_text': address.get('street_number')},
        })
        return node

    def _ubl_get_partner_address_node(self, vals, partner):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_partner_address_node(vals, partner)
        return self._oioubl_add_address_values(node, partner.street)

    def _ubl_get_partner_bank_address_node(self, vals, partner_bank):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_partner_bank_address_node(vals, partner_bank)
        return self._oioubl_add_address_values(node, partner_bank.street)

    def _oioubl_get_party_values(self, partner):
        commercial_partner = partner.commercial_partner_id
        vat = format_vat_number(commercial_partner, commercial_partner.vat)
        # Legal registration id, country-prefixed (DK CVR, FR SIRET, …); fall back to the VAT.
        legal_value = commercial_partner._get_preferred_legal_entity_identifier_vals().get('value')
        cvr = format_vat_number(commercial_partner, legal_value) or vat
        return commercial_partner, vat, cvr

    def _ubl_add_party_endpoint_id_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_endpoint_id_node(vals)
        partner = vals['party_vals']['partner'].commercial_partner_id
        if partner.nemhandel_identifier_type and partner.nemhandel_identifier_value:
            prefix = 'DK' if partner.nemhandel_identifier_type in {'0184', '0198'} else ''
            vals['party_node']['cbc:EndpointID'] = {
                '_text': f'{prefix}{partner.nemhandel_identifier_value}',
                'schemeID': SCHEME_ID_MAPPING.get(partner.nemhandel_identifier_type),
            }

    def _ubl_add_party_identification_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_identification_nodes(vals)
        partner = vals['party_vals']['partner'].commercial_partner_id
        if partner.nemhandel_identifier_value or partner.ref:
            prefix = 'DK' if partner.nemhandel_identifier_type in {'0184', '0198'} else ''
            vals['party_node']['cac:PartyIdentification'].append({
                'cbc:ID': {
                    '_text': f'{prefix}{partner.nemhandel_identifier_value or partner.ref}',
                    'schemeID': SCHEME_ID_MAPPING.get(partner.nemhandel_identifier_type),
                },
            })

    def _ubl_add_party_tax_scheme_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        # Only DK:SE for PartyTaxScheme https://oioubl21.oioubl.dk/Classes/da/PartyTaxScheme.html
        commercial_partner, vat, _cvr = self._oioubl_get_party_values(vals['party_vals']['partner'])
        nodes = vals['party_node']['cac:PartyTaxScheme'] = []
        if vat and vat != '/':
            nodes.append({
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': vat,
                    'schemeID': 'DK:SE' if vat[:2] == 'DK' else 'ZZZ',
                },
                'cac:RegistrationAddress': self._ubl_get_partner_address_node(vals, commercial_partner),
                'cac:TaxScheme': OIOUBL_TAX_SCHEME,
            })

    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_legal_entity_nodes(vals)
        commercial_partner, vat, cvr = self._oioubl_get_party_values(vals['party_vals']['partner'])
        vals['party_node']['cac:PartyLegalEntity'].append({
            'cbc:RegistrationName': {'_text': commercial_partner.name},
            # Even if not enforced by Schematron, only CVR (CPR which we don't use) can be used
            # https://oioubl21.oioubl.dk/Classes/da/PartyLegalEntity.html
            'cbc:CompanyID': {
                '_text': cvr,
                'schemeID': 'DK:CVR' if vat[:2] == 'DK' else 'ZZZ',
            },
            'cac:RegistrationAddress': self._ubl_get_partner_address_node(vals, commercial_partner),
        })

    def _ubl_add_party_contact_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_contact_node(vals)
        vals['party_node']['cac:Contact']['cbc:ID']['_text'] = vals['party_vals']['partner'].id

    def _ubl_get_delivery_node_from_delivery_address(self, vals):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)
        node['cac:DeliveryParty'] = None
        return node

    # -------------------------------------------------------------------------
    # EXPORT: Payment nodes
    # -------------------------------------------------------------------------

    def _ubl_add_payment_means_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_payment_means_nodes(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return

        invoice = vals['invoice']
        supplier = vals['supplier']
        for node in vals['document_node']['cac:PaymentMeans']:
            # https://www.oioubl.info/codelists/en/urn_oioubl_codelist_paymentmeanscode-1.1.html
            node['cbc:PaymentMeansCode'] = {
                '_text': 1,
                'name': 'unknown',
            }
            node['cbc:PaymentDueDate'] = {'_text': invoice.invoice_date_due or invoice.invoice_date}
            node['cbc:InstructionID'] = {'_text': invoice.payment_reference}
            if (
                invoice.partner_bank_id in supplier.bank_ids
                and (financial_institution := ((node.get('cac:PayeeFinancialAccount') or {}).get('cac:FinancialInstitutionBranch') or {}).get('cac:FinancialInstitution'))
            ):
                financial_institution['cac:Address'] = None

    def _ubl_add_payment_terms_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # One PaymentTerms per installment: https://www.oioubl.info/Classes/en/PaymentTerms.html
        super()._ubl_add_payment_terms_nodes(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return

        invoice = vals['invoice']
        nodes = vals['document_node']['cac:PaymentTerms'] = []
        if payment_term := invoice.invoice_payment_term_id:
            sign = 1 if invoice.is_inbound(include_receipts=True) else -1
            for line in invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term').sorted('date_maturity'):
                nodes.append({
                    'cbc:ID': {'_text': line.id},
                    'cbc:Note': {'_text': html2plaintext(payment_term.note)},
                    'cbc:Amount': {
                        '_text': FloatFmt(sign * line.amount_currency, min_dp=2, max_dp=2),
                        'currencyID': line.currency_id.name,
                    },
                    'cac:SettlementPeriod': {
                        'cbc:StartDate': {'_text': invoice.invoice_date},
                        'cbc:EndDate': {'_text': line.date_maturity},
                    },
                })

    def _ubl_get_allowance_charge_early_payment_node(self, vals, early_payment_values):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_allowance_charge_early_payment_node(vals, early_payment_values)
        node['cbc:AllowanceChargeReasonCode']['_text'] = 'ZZZ' if early_payment_values['is_charge'] else '66'
        return node

    def _ubl_get_allowance_charge_early_payment_tax_category_node(self, vals, tax_category):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_allowance_charge_early_payment_tax_category_node(vals, tax_category)
        return self._oioubl_adapt_tax_category_node(node)

    def _ubl_get_allowance_charge_global_discount_tax_category_node(self, vals, tax_category):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_allowance_charge_global_discount_tax_category_node(vals, tax_category)
        return self._oioubl_adapt_tax_category_node(node)

    # -------------------------------------------------------------------------
    # EXPORT: Tax nodes
    # -------------------------------------------------------------------------

    def _oioubl_adapt_tax_category_node(self, node):
        # TaxCategory https://www.oioubl.info/Classes/en/TaxCategory.html
        node['cbc:ID'] = {
            '_text': UBL_TO_OIOUBL_TAX_CATEGORY_ID_MAPPING.get(node['cbc:ID']['_text']),
            'schemeID': 'urn:oioubl:id:taxcategoryid-1.3',
            'schemeAgencyID': DANISH_NATIONAL_IT_AND_TELECOM_AGENCY_ID,
        }
        node['cac:TaxScheme'] = OIOUBL_TAX_SCHEME
        # OIOUBL can't contain name for category
        # [W-LIB230] Name should only be used within NES profiles
        node['cbc:Name'] = None
        return node

    def _ubl_get_tax_category_node(self, vals, tax_category):
        # EXTENDS account.edi.ubl
        return self._oioubl_adapt_tax_category_node(super()._ubl_get_tax_category_node(vals, tax_category))

    def _ubl_get_line_item_node_classified_tax_category_node(self, vals, tax_category):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_line_item_node_classified_tax_category_node(vals, tax_category)
        node['cbc:TaxExemptionReasonCode']['_text'] = tax_category.get('tax_exemption_reason_code')
        node['cbc:TaxExemptionReason']['_text'] = tax_category.get('tax_exemption_reason')
        return self._oioubl_adapt_tax_category_node(node)

    def _ubl_get_tax_subtotal_node(self, vals, tax_subtotal):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_tax_subtotal_node(vals, tax_subtotal)
        # No 'percent' node in OIOUBL https://www.oioubl.info/Classes/en/TaxSubtotal.html
        node['cbc:Percent'] = None
        return node

    def _ubl_add_tax_totals_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_tax_totals_nodes(vals)
        # Only the totals expressed in the document currency.
        document_node = vals['document_node']
        for key in ('cac:TaxTotal', 'cac:WithholdingTaxTotal'):
            document_node[key] = [node for node in document_node[key] if node['_currency'] == vals['currency']]

    # -------------------------------------------------------------------------
    # EXPORT: Monetary totals
    # -------------------------------------------------------------------------

    def _ubl_add_legal_monetary_total_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_legal_monetary_total_node(vals)
        currency = vals['currency']
        node = vals['document_node']['cac:LegalMonetaryTotal']
        # In OIOUBL context, TaxExclusiveAmount means "tax only".
        node['cbc:TaxExclusiveAmount']['_text'] = FloatFmt(
            node['cbc:TaxInclusiveAmount']['_text'] - node['cbc:TaxExclusiveAmount']['_text'],
            min_dp=currency.decimal_places,
        )
        # PrepaidAmount must not be present if equal to 0
        if (prepaid_node := node.get('cbc:PrepaidAmount')) and currency.is_zero(prepaid_node['_text']):
            node['cbc:PrepaidAmount'] = None

    # -------------------------------------------------------------------------
    # EXPORT: Line nodes
    # -------------------------------------------------------------------------

    def _ubl_get_line_allowance_charge_discount_node(self, vals, discount_values):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_line_allowance_charge_discount_node(vals, discount_values)
        node.update({
            'cbc:MultiplierFactorNumeric': None,
            'cbc:AllowanceChargeReason': None,
            'cbc:BaseAmount': None,
        })
        node['cbc:AllowanceChargeReasonCode']['_text'] = '95'
        # https://www.oioubl.info/Classes/en/AllowanceCharge.html: the tax category is mandatory.
        AccountTax = self.env['account.tax']
        base_line = vals['line_vals']['base_line']
        currency = discount_values['currency']
        aggregated_values = AccountTax._aggregate_base_line_tax_details(
            base_line=base_line,
            grouping_function=lambda base_line, tax_data: self._get_line_tax_category_grouping_key(base_line, tax_data, vals, currency),
        )
        node['cac:TaxCategory'] = [
            self._ubl_get_tax_category_node(vals, grouping_key)
            for grouping_key in aggregated_values
            if grouping_key
        ]
        return node

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_line_allowance_charge_nodes(vals)
        self._ubl_add_line_allowance_charge_nodes_for_discount(vals)
        self._ubl_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(vals)

    def _ubl_add_line_tax_totals_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # https://www.oioubl.info/Classes/en/InvoiceLine.html: the line TaxTotal is mandatory.
        super()._ubl_add_line_tax_totals_nodes(vals)
        AccountTax = self.env['account.tax']
        base_line = vals['line_vals']['base_line']
        currency = vals['currency']
        aggregated_values = AccountTax._aggregate_base_line_tax_details(
            base_line=base_line,
            grouping_function=lambda base_line, tax_data: self._get_tax_category_grouping_key(base_line, tax_data, vals, currency),
        )
        subtotals = {
            grouping_key: {
                **grouping_key,
                'base_amount': values['base_amount_currency'],
                'tax_amount': values['tax_amount_currency'],
                'tax_categories': {grouping_key: dict(grouping_key)},
            }
            for grouping_key, values in aggregated_values.items()
            if grouping_key and not grouping_key['is_withholding']
        }
        vals['line_node']['cac:TaxTotal'] = [self._ubl_get_tax_total_node(vals, {
            'currency': currency,
            'amount': sum(subtotal['tax_amount'] for subtotal in subtotals.values()),
            'subtotals': subtotals,
        })]

    def _ubl_add_line_price_node(self, vals, in_foreign_currency=True):
        # EXTENDS account.edi.ubl
        # Rule F-INV348 enforces that LineExtensionAmount equals directly PriceAmount * Quantity: the price is the net
        # price (after the line discount).
        super()._ubl_add_line_price_node(vals, in_foreign_currency=in_foreign_currency)
        base_line = vals['line_vals']['base_line']
        price_node = vals['line_node']['cac:Price']['cbc:PriceAmount']
        product_price_dp = self.env['decimal.precision'].precision_get('Product Price')
        price_node['_text'] = FloatFmt(
            price_node['_text'] * (1 - base_line['discount'] / 100),
            min_dp=1,
            max_dp=product_price_dp,
        )

    # -------------------------------------------------------------------------
    # EXPORT: Constraints
    # -------------------------------------------------------------------------

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.ubl
        constraints = super()._export_document_constraints(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return constraints

        for partner_type in ('supplier', 'customer'):
            partner = vals[partner_type]
            building_number = street_split(partner.street).get('street_number')
            if not building_number:
                constraints[f"oioubl21_{partner_type}_building_number_required"] = _("The following partner's street number is missing: %s", partner.display_name)
            if partner.country_code == "FR" and not partner.commercial_partner_id._get_additional_identifier('FR_SIRET'):
                constraints["oioubl21_siret_required_for_french_partner"] = _("A SIRET is required for the french partner: %s", partner.display_name)
            constraints[f'oioubl21_{partner_type}_vat_required'] = self._check_required_fields(partner.commercial_partner_id, 'vat')
        if not vals['supplier']._get_additional_identifier('DK_CVR'):
            constraints['oioubl21_supplier_cvr_required'] = _("The Danish CVR is required for the supplier: %s", vals['supplier'].display_name)

        return constraints

    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _import_ubl_invoice_add_customer_values(self, collected_values):
        # EXTENDS account.edi.ubl
        # The EndpointID uses the OIOUBL schemes ('GLN', 'DK:CVR', ...): turn them into ISO 6523 ICD codes.
        super()._import_ubl_invoice_add_customer_values(collected_values)
        customer_values = collected_values['customer_values']
        scheme = customer_values.get('routing_scheme')
        if not scheme or scheme in SCHEME_ID_MAPPING:
            return
        icd = {oioubl_scheme: icd for icd, oioubl_scheme in SCHEME_ID_MAPPING.items()}.get(scheme)
        if not icd:
            customer_values.pop('routing_scheme')
            customer_values.pop('routing_endpoint', None)
            return
        endpoint = customer_values.get('routing_endpoint') or ''
        if icd in ('0184', '0198') and endpoint.upper().startswith('DK'):
            endpoint = endpoint[2:]
        customer_values['routing_scheme'] = icd
        customer_values['routing_endpoint'] = endpoint
        meta = self.env['res.partner']._get_all_identifiers_metadata_by_scheme().get(icd)
        if meta and meta['key'] in self.env['res.partner']._get_all_additional_identifiers_metadata():
            customer_values.setdefault('additional_identifiers', {})[meta['key']] = endpoint

    def _import_ubl_invoice_fix_untaxed_amount(self, collected_values):
        # EXTENDS account.edi.ubl
        # In OIOUBL, LegalMonetaryTotal/TaxExclusiveAmount is the total tax amount: the untaxed amount expected by the
        # generic check is TaxInclusiveAmount - TaxExclusiveAmount.
        tree = collected_values['tree']
        tax_exclusive_node = tree.find('./{*}LegalMonetaryTotal/{*}TaxExclusiveAmount')
        tax_inclusive_str = tree.findtext('./{*}LegalMonetaryTotal/{*}TaxInclusiveAmount')
        if tax_exclusive_node is None or not tax_exclusive_node.text or not tax_inclusive_str:
            return super()._import_ubl_invoice_fix_untaxed_amount(collected_values)
        tax_amount_str = tax_exclusive_node.text
        try:
            tax_exclusive_node.text = str(float(tax_inclusive_str) - float(tax_amount_str))
            return super()._import_ubl_invoice_fix_untaxed_amount(collected_values)
        finally:
            tax_exclusive_node.text = tax_amount_str

    def _import_ubl_invoice_line_add_price_unit_quantity_discount(self, collected_values):
        # EXTENDS account.edi.ubl
        # In OIOUBL, PriceAmount is the net price (after the line allowances/charges, see F-INV348): the gross price is
        # then retrieved from the line amount and its allowances/charges.
        super()._import_ubl_invoice_line_add_price_unit_quantity_discount(collected_values)
        to_write = collected_values['to_write']
        total_allowances = sum(allowance['amount'] for allowance in collected_values['allowances'])
        total_charges = sum(charge['amount'] for charge in collected_values['charges'])
        line_extension_amount_str = collected_values['line_tree'].findtext('./{*}LineExtensionAmount')
        if not (total_allowances or total_charges) or not line_extension_amount_str or not to_write.get('quantity'):
            return
        line_extension_amount = float(line_extension_amount_str) * collected_values['file_document_sign']
        gross_subtotal = line_extension_amount + total_allowances
        to_write['price_unit'] = gross_subtotal / to_write['quantity']
        to_write['discount'] = (total_allowances * 100 / gross_subtotal) if gross_subtotal else 0.0
