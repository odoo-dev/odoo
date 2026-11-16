from odoo import _, models
from odoo.addons.account.tools import dict_to_xml


class AccountEdiUBLPintEU(models.AbstractModel):
    """ Peppol International (PINT) specialization for the European Union, aligned on the European norm EN 16931.

    It is PINT ('account.edi.ubl_pint') in the EN 16931 UBL syntax binding ('account.edi.ubl_cen_en16931', which holds
    the EN 16931 rules) and holds the Peppol rules shared by the European Peppol formats (PINT EU, Peppol BIS Billing
    3.0 and its national CIUS), including the national rules of the Peppol BIS (NL-R-*, DK-R-*, ...).

    * Specification: https://docs.peppol.eu/poac/eu/pint-eu/
    """
    _name = "account.edi.ubl_pint_eu"
    _inherit = ['account.edi.ubl_cen_en16931', 'account.edi.ubl_pint']
    _description = "UBL PINT EU"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl_pint
        if process_type == 'billing':
            return 'urn:peppol:pint:billing-1@eu-1'
        if process_type == 'selfbilling':
            return 'urn:peppol:pint:selfbilling-1@eu-1'
        return super()._get_customization_id(process_type=process_type)

    def _ubl_add_party_identification_nodes_national(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_party_identification_nodes_national(vals)
        commercial_partner = vals['party_vals']['partner'].commercial_partner_id
        # [PEPPOL-COMMON-R043] Belgian enterprise number.
        if commercial_partner.country_code == 'BE' and (be_en := commercial_partner._get_additional_identifier('BE_EN')):
            vals['party_node']['cac:PartyIdentification'].append({
                'cbc:ID': {
                    '_text': be_en,
                    'schemeID': '0208',
                },
            })

    def _ubl_use_partner_ref_as_party_identification(self, vals):
        # EXTENDS account.edi.ubl_pint
        # [DK-R-013] For Danish suppliers, a party identifier without scheme is not allowed.
        if vals['party_vals']['partner'].commercial_partner_id.country_code == 'DK':
            return False
        return super()._ubl_use_partner_ref_as_party_identification(vals)

    def _ubl_add_accounting_supplier_party_tax_scheme_nodes(self, vals):
        super()._ubl_add_accounting_supplier_party_tax_scheme_nodes(vals)
        nodes = vals['party_node']['cac:PartyTaxScheme']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        country_code = commercial_partner.country_code

        if country_code == 'NO':
            # [NO-R-002] For Norwegian suppliers, most invoice issuers are required to append
            # "Foretaksregisteret" to their invoice.
            nodes.append({
                'cbc:CompanyID': {'_text': "Foretaksregisteret"},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': "TAX"},
                },
            })
        elif country_code == 'SE':
            # [SE-R-005] For Swedish suppliers, when using Seller tax registration identifier,
            # 'Godkänd för F-skatt' must be stated
            nodes.append({
                'cbc:CompanyID': {'_text': "GODKÄND FÖR F-SKATT"},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': "TAX"},
                },
            })

    def _ubl_add_payment_means_nodes(self, vals):
        super()._ubl_add_payment_means_nodes(vals)

        if self._is_document(vals, 'invoice', 'self_invoice', 'credit_note', 'self_credit_note'):
            nodes = vals['document_node']['cac:PaymentMeans']
            customer = vals['customer'].commercial_partner_id

            # [DK] In Denmark payment code 30 is not allowed. Hardcode to 1 ("unknown")
            # as we cannot deduce this information from the invoice.
            # The SEPA direct debit (59, see account.edi.ubl_cen_en16931) is kept.
            if customer.country_code == 'DK':
                for node in nodes:
                    if node['cbc:PaymentMeansCode']['_text'] != 59:
                        node['cbc:PaymentMeansCode']['_text'] = 1
                        node['cbc:PaymentMeansCode']['name'] = 'unknown'

    def _ubl_add_billing_reference_nodes(self, vals):
        super()._ubl_add_billing_reference_nodes(vals)

        if self._is_document(vals, 'credit_note'):
            # [NL-R-001] For suppliers in the Netherlands, if the document is a creditnote, the document MUST
            # contain an invoice reference (cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID)
            credit_note = vals['invoice']
            nodes = vals['document_node']['cac:BillingReference']
            if (
                vals['supplier'].country_code == 'NL'
                and credit_note.ref
                and not nodes
            ):
                nodes.append({
                    'cac:InvoiceDocumentReference': {
                        'cbc:ID': {'_text': credit_note.ref},
                    }
                })

    def _export_document_constraints(self, vals):
        constraints = super()._export_document_constraints(vals)
        document_node = vals['document_node']
        nsmap = document_node['_nsmap']

        if self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            if self.env.context.get('from_peppol'):
                # [PEPPOL-EN16931-R010] Buyer electronic address MUST be provided.
                if not document_node['cac:AccountingCustomerParty']['cac:Party']['cbc:EndpointID']['_text']:
                    constraints['ubl_peppol_en16931-r010'] = _(
                        "[PEPPOL-EN16931-R010] An electronic address (EAS) must be provided on the customer '%s'.",
                        vals['customer'].display_name,
                    )

                # [PEPPOL-EN16931-R020] Seller electronic address MUST be provided.
                if not document_node['cac:AccountingSupplierParty']['cac:Party']['cbc:EndpointID']['_text']:
                    constraints['ubl_peppol_en16931-r020'] = _(
                        "[PEPPOL-EN16931-R020] An electronic address (EAS) must be provided on the company '%s'.",
                        vals['supplier'].display_name,
                    )

        if self._is_document(vals, 'invoice', 'self_invoice', 'credit_note', 'self_credit_note'):
            # PEPPOL-EN16931-R003: A buyer reference or purchase order reference MUST be provided.
            if (
                not vals['document_node']['cbc:BuyerReference']
                and not vals['document_node']['cac:OrderReference']
            ):
                constraints['cen_en16931_buyer_reference_and_order_reference_must_not_be_both_present'] = _("A buyer reference or purchase order reference must be provided.")

        if (
            self._is_document(vals, 'invoice', 'credit_note')
            and document_node['cac:AccountingSupplierParty']['cac:Party']['cac:PostalAddress']['cac:Country']['cbc:IdentificationCode']['_text'] == 'NL'
        ):

            # [NL-R-002] For suppliers in the Netherlands the supplier's address (cac:AccountingSupplierParty/cac:Party
            # /cac:PostalAddress) MUST contain street name (cbc:StreetName), city (cbc:CityName) and post code (cbc:PostalZone)
            constraints.update({
                'nl_r_002_street': self._check_required_fields(vals['supplier'], 'street'),
                'nl_r_002_zip': self._check_required_fields(vals['supplier'], 'zip'),
                'nl_r_002_city': self._check_required_fields(vals['supplier'], 'city'),
            })

            # [NL-R-003] For suppliers in the Netherlands, the legal entity identifier MUST be either a
            # KVK or OIN number (schemeID 0106 or 0190)
            if all((node.get('cbc:CompanyID') or {}).get('schemeID') not in ('0106', '0190') for node in document_node['cac:AccountingSupplierParty']['cac:Party']['cac:PartyLegalEntity']):
                constraints['nl_r_003'] = _("%s should have a KVK or OIN number set.", vals['supplier'].display_name)

            # [NL-R-007] For suppliers in the Netherlands, the supplier MUST provide a means of payment
            # (cac:PaymentMeans) if the payment is from customer to supplier
            if not document_node['cac:PaymentMeans']:
                constraints['nl_r_007'] = self._check_required_fields(vals['invoice'], 'partner_bank_id')

            if document_node['cac:AccountingCustomerParty']['cac:Party']['cac:PostalAddress']['cac:Country']['cbc:IdentificationCode']['_text'] == 'NL':
                # [NL-R-004] For suppliers in the Netherlands, if the customer is in the Netherlands, the customer
                # address (cac:AccountingCustomerParty/cac:Party/cac:PostalAddress) MUST contain the street name
                # (cbc:StreetName), the city (cbc:CityName) and post code (cbc:PostalZone)
                constraints.update({
                    'nl_r_004_street': self._check_required_fields(vals['customer'], 'street'),
                    'nl_r_004_city': self._check_required_fields(vals['customer'], 'city'),
                    'nl_r_004_zip': self._check_required_fields(vals['customer'], 'zip'),
                })

                # [NL-R-005] For suppliers in the Netherlands, if the customer is in the Netherlands,
                # the customer's legal entity identifier MUST be either a KVK or OIN number (schemeID 0106 or 0190)
                if all((node.get('cbc:CompanyID') or {}).get('schemeID') not in ('0106', '0190') for node in document_node['cac:AccountingCustomerParty']['cac:Party']['cac:PartyLegalEntity']):
                    constraints['nl_r_005'] = _("%s should have a KVK or OIN number set.", vals['customer'].display_name)

        if (
            self._is_document(vals, 'credit_note')
            and document_node['cac:AccountingSupplierParty']['cac:Party']['cac:PostalAddress']['cac:Country']['cbc:IdentificationCode']['_text'] == 'NL'
            and all(
                dict_to_xml(bill_ref_node['cac:InvoiceDocumentReference']['cbc:ID'], nsmap=nsmap, tag='cbc:ID') is None
                for bill_ref_node in document_node['cac:BillingReference']
            )
        ):
            # [NL-R-001] For suppliers in the Netherlands, if the document is a creditnote, the document MUST contain
            # an invoice reference.
            constraints['nl_r_001'] = self._check_required_fields(vals['invoice'], 'ref')

        return constraints
