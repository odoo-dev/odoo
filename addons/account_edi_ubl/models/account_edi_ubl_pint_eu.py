from odoo import _, models
from odoo.addons.account.tools import dict_to_xml
from odoo.addons.base.models.res_country import EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES


class AccountEdiUBLPintEU(models.AbstractModel):
    """ Peppol International (PINT) specialization for the European Union, aligned on the European norm EN 16931.

    It holds the rules shared by the European Peppol formats (PINT EU, Peppol BIS Billing 3.0 and its national CIUS),
    including the national rules of the Peppol BIS (NL-R-*, DK-R-*, ...).

    * Specification: https://docs.peppol.eu/poac/eu/pint-eu/
    """
    _name = "account.edi.ubl_pint_eu"
    _inherit = ['account.edi.cen_en16931', 'account.edi.ubl_pint']
    _description = "UBL PINT EU"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl_pint
        if process_type == 'billing':
            return 'urn:peppol:pint:billing-1@eu-1'
        if process_type == 'selfbilling':
            return 'urn:peppol:pint:selfbilling-1@eu-1'
        return super()._get_customization_id(process_type=process_type)

    def _ubl_get_delivery_node_from_delivery_address(self, vals):
        # Intracom delivery inside European area.
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)

        if self._is_document(vals, 'invoice', 'self_invoice', 'credit_note', 'self_credit_note'):
            invoice = vals['invoice']
            customer = vals['customer']
            supplier = vals['supplier']
            if (
                customer.country_id.code in EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES
                and supplier.country_id.code in EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES
                and supplier.country_id != customer.country_id
            ):
                node['cbc:ActualDeliveryDate']['_text'] = invoice.invoice_date

        return node

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        super()._ubl_add_line_allowance_charge_nodes(vals)

        # Discount.
        self._ubl_add_line_allowance_charge_nodes_for_discount(vals)

        # Recycling contribution taxes.
        self._ubl_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(vals)

        # Excise taxes.
        self._ubl_add_line_allowance_charge_nodes_for_excise_taxes(vals)

    def _ubl_add_payment_means_nodes(self, vals):
        super()._ubl_add_payment_means_nodes(vals)

        if self._is_document(vals, 'invoice', 'self_invoice', 'credit_note', 'self_credit_note'):
            nodes = vals['document_node']['cac:PaymentMeans']
            invoice = vals['invoice']
            customer = vals['customer'].commercial_partner_id

            # [DK] In Denmark payment code 30 is not allowed. Hardcode to 1 ("unknown")
            # as we cannot deduce this information from the invoice.
            if customer.country_code == 'DK':
                for node in nodes:
                    node['cbc:PaymentMeansCode']['_text'] = 1
                    node['cbc:PaymentMeansCode']['name'] = 'unknown'

            # Set up SEPA Direct Debit payment means and mandate node if a usable mandate exists

            if (
                self.module_installed('account_sepa_direct_debit')
                and (sdd_mandate := invoice._get_usable_mandate(mandate_type='sepa'))
                and sdd_mandate.partner_bank_id.account_number
                and sdd_mandate.company_id.sdd_creditor_identifier
            ):
                # If the group "DIRECT DEBIT" (BG-19) is delivered, the element "Debited account identifier" (BT-91) shall be provided.
                # If the group "DIRECT DEBIT" (BG-19) is delivered, the element "Bank assigned creditor identifier" (BT-90) shall be provided
                vals['document_node']['cac:AccountingSupplierParty']['cac:Party']['cac:PartyIdentification'].append({
                    'cbc:ID': {'_text': sdd_mandate.company_id.sdd_creditor_identifier, 'schemeID': 'SEPA'},
                })
                for node in nodes:
                    node['cbc:PaymentMeansCode']['_text'] = 59
                    node['cbc:PaymentMeansCode']['name'] = 'sepa direct debit'
                    node['cac:PaymentMandate'] = self._ubl_get_payment_means_payment_mandate_node_from_mandate(vals, sdd_mandate)
                    node['cac:PayeeFinancialAccount'] = None

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
            invoice = vals['invoice']

            # [BR-IC-11]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
            # "Intra-community supply" the Actual delivery date (BT-72) or the Invoicing period (BG-14)
            # shall not be blank.
            if (
                self._is_intracommunity_supply(vals)
                and dict_to_xml((document_node['cac:Delivery'] or {}).get('cbc:ActualDeliveryDate'), nsmap=nsmap, tag='cbc:ActualDeliveryDate') is None
                and dict_to_xml(document_node['cac:InvoicePeriod'], nsmap=nsmap, tag='cac:InvoicePeriod') is None
            ):
                constraints['cen_en16931_delivery_date_invoicing_period'] = _("For intracommunity supply, the actual delivery date or the invoicing period should be included.")

            # [BR-61]-If the Payment means type code (BT-81) means SEPA credit transfer, Local credit transfer or
            # Non-SEPA international credit transfer, the Payment account identifier (BT-84) shall be present.
            for node in document_node['cac:PaymentMeans']:
                if node['cbc:PaymentMeansCode']['_text'] in (30, 58):
                    constraints['cen_en16931_payment_account_identifier'] = self._check_required_fields(invoice, 'partner_bank_id')

            # [BR-57]-Each Deliver to address (BG-15) shall contain a Deliver to country code (BT-80).
            if (
                document_node['cac:Delivery']
                and dict_to_xml(document_node['cac:Delivery']['cac:DeliveryLocation']['cac:Address']['cac:Country']['cbc:IdentificationCode'], nsmap=nsmap, tag='cbc:IdentificationCode') is None
            ):
                constraints['cen_en16931_delivery_address'] = self._check_required_fields(invoice.partner_shipping_id, 'country_id')

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
