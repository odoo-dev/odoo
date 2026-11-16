from odoo import _, api, models
from odoo.tools import html2plaintext
from odoo.tools.misc import NON_BREAKING_SPACE, formatLang

from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt

PDP_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr'  # Not accepted by SuperPDP due to missing validator

CPRO_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr'
CPRO_INVOICE_IDENTIFIER = f'busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##{CPRO_CUSTOMIZATION_ID}::2.1'

PAID_STATES = frozenset({'in_payment', 'paid'})


class AccountEdiXmlUbl21Fr(models.AbstractModel):
    """ French e-invoicing reform (B2B "facturation électronique"): UBL 2.1 syntax of the French CIUS / extension of
    the European norm EN 16931 (norm XP Z12-012, "Socle" external specifications of the DGFiP, v3.x).

    The French format is a CIUS (and extension) of EN 16931 directly, it is NOT a Peppol BIS Billing 3.0 CIUS:
    its CustomizationID is 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr' and its
    ProfileID is the "cadre de facturation" (BT-23: B1, S1, M1, B2, ...). Hence, it is built on the EN 16931
    business rules and the UBL 2.1 syntax only, the Peppol (BIS 3 / PINT) rules are not applicable.

    * Specifications: https://www.impots.gouv.fr/specifications-externes-b2b
    * Validation artefacts (BR-FR-*): https://github.com/DGFiP/facturation-electronique (schematrons of the "Socle")
    * EN 16931 UBL binding: https://github.com/ConnectingEurope/eInvoicing-EN16931
    """
    _name = "account.edi.xml.ubl_21_fr"
    _inherit = ['account.edi.cen_en16931', 'account.edi.ubl']
    _description = "France UBL 2.1 E-Invoicing Format"

    @api.model
    def _pdp_can_invoice_b2g(self, customer):
        # We use fields added in this module for B2G
        return self.env['ir.module.module']._get('l10n_fr_facturx_chorus_pro').state == 'installed'

    @api.model
    def _pdp_is_b2g(self, customer):
        # We put the identifier for chorus pro invoices in `peppol_supported_documents`
        # to mark the partner as B2G / "behind Chorus Pro"
        return CPRO_INVOICE_IDENTIFIER in (customer.peppol_supported_documents or [])

    @api.model
    def _pdp_needs_b2g_fields(self, customer):
        return self._pdp_can_invoice_b2g(customer) and self._pdp_is_b2g(customer)

    # -------------------------------------------------------------------------
    # EXPORT: VALUES
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_ubl_21_fr.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl
        # BT-24: the same specification identifier is used for the B2B, the B2G (Chorus Pro) and the self-billed
        # documents (the self-billing is expressed by the type codes 389/261, BR-FR-04).
        if process_type in ('billing', 'selfbilling'):
            return PDP_CUSTOMIZATION_ID
        return super()._get_customization_id(process_type=process_type)

    def _get_business_term_max_lengths(self):
        # EXTENDS account.edi.cen_en16931
        # [BR-FR-MAP-17/18/19] The French CIUS caps the length of some business terms.
        return {
            **super()._get_business_term_max_lengths(),
            'BT-22': 1024,  # Invoice note
            'BT-35': 255,  # Address line 1 (BT-35, BT-50, BT-75, ...)
            'BT-36': 255,  # Address line 2
            'BT-37': 255,  # City
            'BT-38': 10,  # Post code
            'BT-39': 255,  # Country subdivision
            'BT-153': 255,  # Item name
        }

    def _ubl_prepare_base_lines(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_prepare_base_lines(vals)
        # The emptying taxes (e.g. deposits on bottles) are not VAT: they are reported as separated lines.
        vals['base_lines'] = self._turn_emptying_taxes_as_new_base_lines(
            base_lines=vals['base_lines'],
            company=vals['company'],
            vals=vals,
        )

    def _l10n_fr_pdp_get_tax_withholding_amount(self, vals):
        """ The amount of the withholding taxes of the document, reported as a prepaid amount (BT-113) since EN 16931
        doesn't know withholding taxes ([UBL-CR-?] cac:WithholdingTaxTotal is not part of the EN 16931 UBL binding).
        """
        ubl_values = vals['_ubl_values']
        if 'tax_withholding_amount' not in ubl_values:
            AccountTax = self.env['account.tax']
            currency = vals['currency']

            def grouping_function(base_line, tax_data):
                if not tax_data:
                    return None
                tax_grouping_key = self._get_tax_category_grouping_key(base_line, tax_data, vals, currency)
                if not tax_grouping_key:
                    return None
                return tax_grouping_key['is_withholding']

            base_lines_aggregated_values = AccountTax._aggregate_base_lines_tax_details(vals['base_lines'], grouping_function)
            values_per_grouping_key = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_values)
            ubl_values['tax_withholding_amount'] = -sum(
                values['tax_amount_currency']
                for grouping_key, values in values_per_grouping_key.items()
                if grouping_key
            )
        return ubl_values['tax_withholding_amount']

    # -------------------------------------------------------------------------
    # EXPORT: HEADER NODES
    # -------------------------------------------------------------------------

    def _ubl_add_version_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # UBLVersionID is optional and not part of the EN 16931 semantic model: don't report it.
        super()._ubl_add_version_id_node(vals)
        vals['document_node']['cbc:UBLVersionID']['_text'] = None

    def _ubl_add_profile_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # BT-23: "cadre de facturation" (BR-FR-08).
        super()._ubl_add_profile_id_node(vals)
        if self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            vals['document_node']['cbc:ProfileID']['_text'] = self._l10n_fr_pdp_get_profile_id(vals)

    def _ubl_add_due_date_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_due_date_node(vals)
        # [BR-FR-CO-09/BT-23] : Si le cadre de facturation (BT-23) est B2, S2 ou M2, alors la date d'échéance (BT-9) doit
        # être renseignée et correspondre à la date de paiement.
        # For credit notes, this is handled in `_ubl_add_payment_means_nodes` instead (cac:PaymentMeans/cbc:PaymentDueDate).
        if self._is_document(vals, 'invoice', 'self_invoice') and self._l10n_fr_pdp_get_profile_id(vals) in ('B2', 'S2', 'M2'):
            invoice = vals['invoice']
            vals['document_node']['cbc:DueDate']['_text'] = invoice._pdp_get_payment_date() or invoice.invoice_date

    def _ubl_add_invoice_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-FR-04] 380 (commercial invoice), 389 (self-billed invoice), 386 (down payment invoice).
        super()._ubl_add_invoice_type_code_node(vals)
        node = vals['document_node']['cbc:InvoiceTypeCode']
        if self._is_document(vals, 'invoice'):
            node['_text'] = 386 if vals['invoice']._is_downpayment() else 380
        elif self._is_document(vals, 'self_invoice'):
            node['_text'] = 389

    def _ubl_add_credit_note_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-FR-04] 381 (credit note), 261 (self-billed credit note), 503 (down payment credit note).
        super()._ubl_add_credit_note_type_code_node(vals)
        node = vals['document_node']['cbc:CreditNoteTypeCode']
        if self._is_document(vals, 'credit_note'):
            node['_text'] = 503 if vals['invoice']._is_downpayment() else 381
        elif self._is_document(vals, 'self_credit_note'):
            node['_text'] = 261

    def _ubl_add_notes_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_notes_nodes(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return

        invoice = vals['invoice']
        currency = vals['currency']
        notes = vals['document_node']['cbc:Note']

        # The terms and conditions (and the explanation of the prepaid amount coming from the withholding taxes).
        main_note = []
        tax_withholding_amount = self._l10n_fr_pdp_get_tax_withholding_amount(vals)
        if not currency.is_zero(tax_withholding_amount):
            main_note.append(_(
                "The prepaid amount of %s corresponds to the withholding tax applied.",
                formatLang(self.env, tax_withholding_amount, currency_obj=currency).replace(NON_BREAKING_SPACE, ''),
            ))
        if invoice.narration and (terms_and_conditions := html2plaintext(invoice.narration)):
            main_note.append(terms_and_conditions)
        if main_note:
            notes.append({'_text': ' '.join(main_note)})

        # [BR-FR-05] Mandatory notes (subject code BT-21 + text BT-22) with their defaults.
        for code, default_content in self._get_default_notes(vals).items():
            notes.append({'_text': f"#{code}#{default_content}"})

        # [BR-FR-MAP-18] The Note (BT-22) is capped to 1024 characters.
        for note in notes:
            note['_text'] = self._edi_truncate(note['_text'], 'BT-22')

    def _ubl_add_document_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-5] An Invoice shall have an Invoice currency code (BT-5).
        self._ubl_add_document_currency_code_node_foreign_currency(vals)

    def _ubl_add_tax_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # BT-6: the VAT accounting currency, only when different from the invoice currency (BR-CO-?/[UBL-CR-?]).
        if vals['currency'] != vals['company_currency']:
            self._ubl_add_tax_currency_code_node_company_currency(vals)
        else:
            self._ubl_add_tax_currency_code_node_empty(vals)

    def _ubl_add_buyer_reference_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_buyer_reference_node(vals)
        customer = vals['customer']
        node = vals['document_node']['cbc:BuyerReference']
        if self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note') and self._pdp_needs_b2g_fields(customer.commercial_partner_id):
            # B2G: the "Code de Service" of Chorus Pro.
            node['_text'] = vals['invoice'].buyer_reference or None
        elif customer_ref := customer.ref or customer.commercial_partner_id.ref:
            node['_text'] = customer_ref

    def _ubl_add_order_reference_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_order_reference_node(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return
        invoice = vals['invoice']
        if self._pdp_needs_b2g_fields(vals['customer'].commercial_partner_id) and invoice.purchase_order_reference:
            # B2G: the "Engagement Juridique" of Chorus Pro.
            vals['document_node']['cac:OrderReference'] = {
                'cbc:ID': {'_text': invoice.purchase_order_reference},
            }

    def _ubl_add_billing_reference_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_billing_reference_nodes(vals)
        nodes = vals['document_node']['cac:BillingReference']
        invoice = vals['invoice']

        # Règles de gestion G1.52 / [BR-FR-CO-04]: a credit note references the invoice it corrects.
        if self._is_document(vals, 'credit_note', 'self_credit_note'):
            nodes[:] = [{
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {'_text': invoice.reversed_entry_id.name},
                    'cbc:IssueDate': {'_text': invoice.reversed_entry_id.invoice_date},
                },
            }]

        # Profile ID X4 - Final invoice with downpayments: reference the down payment invoices.
        if self._is_document(vals, 'invoice', 'self_invoice') and self._l10n_fr_pdp_get_profile_id(vals) in ('B4', 'S4', 'M4'):
            downpayment_moves = invoice.invoice_line_ids._get_downpayment_lines().move_id.filtered(lambda m: m != invoice)
            nodes[:] = [
                {
                    'cac:InvoiceDocumentReference': {
                        'cbc:ID': {'_text': downpayment_move.name},
                        'cbc:IssueDate': {'_text': downpayment_move.invoice_date},
                    },
                }
                for downpayment_move in downpayment_moves
            ]

    # -------------------------------------------------------------------------
    # EXPORT: PARTY NODES
    # -------------------------------------------------------------------------

    def _ubl_get_partner_address_node(self, vals, partner):
        # EXTENDS account.edi.ubl
        # The country subdivision code and the country name are not part of the EN 16931 UBL binding
        # ([UBL-CR-?] cac:Country/cbc:Name, cbc:CountrySubentityCode).
        node = super()._ubl_get_partner_address_node(vals, partner)
        node['cbc:CountrySubentityCode'] = None
        node['cac:Country']['cbc:Name'] = None
        return node

    def _ubl_add_party_endpoint_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # BT-34/BT-49: electronic address of the seller/buyer ([BR-FR-12]/[BR-FR-13]), typically the "0225" French
        # e-invoicing identifier (SIREN[_SIRET][_suffix]) registered in the directory ("annuaire").
        super()._ubl_add_party_endpoint_id_node(vals)
        partner = vals['party_vals']['partner']
        if identifier_vals := partner._get_preferred_routing_identifier_vals():
            normalized_value = self.env['res.partner']._validate_identifier_by_scheme(identifier_vals['scheme'], identifier_vals['value']).get('value')
            vals['party_node']['cbc:EndpointID']['_text'] = normalized_value
            vals['party_node']['cbc:EndpointID']['schemeID'] = identifier_vals['scheme']

    def _ubl_add_party_identification_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # BT-29/BT-46: the SIRET (scheme 0009) of the seller/buyer when known.
        super()._ubl_add_party_identification_nodes(vals)
        nodes = vals['party_node']['cac:PartyIdentification']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        if identifier_vals := commercial_partner._get_preferred_legal_entity_identifier_vals():
            # [UBL-SR-16] Buyer identifier shall occur maximum once
            nodes[:] = [{
                'cbc:ID': {'_text': identifier_vals['value'], 'schemeID': identifier_vals['scheme']},
            }]
        elif commercial_partner.ref:
            nodes[:] = [{
                'cbc:ID': {'_text': commercial_partner.ref, 'schemeID': None},
            }]

    def _ubl_add_accounting_supplier_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_accounting_supplier_party_tax_scheme_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        siret = commercial_partner._get_additional_identifier('FR_SIRET')

        # BT-32: Seller tax registration identifier, when the seller has no VAT number.
        if (not commercial_partner.vat or commercial_partner.vat == '/') and siret:
            vals['party_node']['cac:PartyTaxScheme'] = [{
                'cbc:CompanyID': {'_text': siret},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'TAX'},
                },
            }]

    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # BT-30/BT-47: the SIREN (scheme 0002) of the seller/buyer ([BR-FR-10]/[BR-FR-11]).
        super()._ubl_add_party_legal_entity_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        vals['party_node']['cac:PartyLegalEntity'] = {
            'cbc:RegistrationName': {'_text': commercial_partner.name},
            'cbc:CompanyID': {
                '_text': commercial_partner._l10n_fr_pdp_get_siren(),
                'schemeID': '0002',
            },
        }

    # -------------------------------------------------------------------------
    # EXPORT: DELIVERY NODES
    # -------------------------------------------------------------------------

    def _ubl_add_delivery_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # [UBL-SR-?] Deliver to information (BG-13) shall occur maximum once.
        super()._ubl_add_delivery_nodes(vals)
        if self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            document_node = vals['document_node']
            document_node['cac:Delivery'] = document_node['cac:Delivery'][0] if document_node['cac:Delivery'] else None

    def _ubl_get_delivery_node_from_delivery_address(self, vals):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)
        # [BR-IC-11] Intra-community supply: the actual delivery date (BT-72) or the invoicing period (BG-14) shall
        # be provided.
        if (
            self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note')
            and not node['cbc:ActualDeliveryDate']['_text']
            and self._is_intracommunity_supply(vals)
        ):
            node['cbc:ActualDeliveryDate']['_text'] = vals['invoice'].invoice_date
        return node

    # The Deliver to party (BG-13) only holds the Deliver to party name (BT-70) in EN 16931.

    def _ubl_add_delivery_party_endpoint_id_node(self, vals):
        pass

    def _ubl_add_delivery_party_identification_nodes(self, vals):
        pass

    def _ubl_add_delivery_party_postal_address_node(self, vals):
        pass

    def _ubl_add_delivery_party_tax_scheme_nodes(self, vals):
        pass

    def _ubl_add_delivery_party_legal_entity_nodes(self, vals):
        pass

    def _ubl_add_delivery_party_contact_node(self, vals):
        pass

    # -------------------------------------------------------------------------
    # EXPORT: PAYMENT NODES
    # -------------------------------------------------------------------------

    def _ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(self, vals, partner_bank):
        # EXTENDS account.edi.ubl
        # BT-86: Payment service provider identifier (BIC), without scheme ([UBL-CR-?]) nor financial institution
        # ([UBL-CR-664]).
        node = super()._ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(vals, partner_bank)
        if node:
            node['cbc:ID']['schemeID'] = None
            node['cac:FinancialInstitution'] = None
        return node

    def _ubl_add_payment_means_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_payment_means_nodes(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return

        nodes = vals['document_node']['cac:PaymentMeans']
        invoice = vals['invoice']

        # BG-19: SEPA direct debit, when a usable mandate exists.
        if (
            self.module_installed('account_sepa_direct_debit')
            and (sdd_mandate := invoice._get_usable_mandate(mandate_type='sepa'))
            and sdd_mandate.partner_bank_id.account_number
            and sdd_mandate.company_id.sdd_creditor_identifier
        ):
            # [BR-63] The Bank assigned creditor identifier (BT-90) shall be provided.
            # [BR-64] The Debited account identifier (BT-91) shall be provided.
            supplier_identification = vals['document_node']['cac:AccountingSupplierParty']['cac:Party']['cac:PartyIdentification']
            if isinstance(supplier_identification, dict):
                supplier_identification = vals['document_node']['cac:AccountingSupplierParty']['cac:Party']['cac:PartyIdentification'] = [supplier_identification]
            supplier_identification.append({
                'cbc:ID': {'_text': sdd_mandate.company_id.sdd_creditor_identifier, 'schemeID': 'SEPA'},
            })
            for node in nodes:
                node['cbc:PaymentMeansCode']['_text'] = 59
                node['cbc:PaymentMeansCode']['name'] = 'sepa direct debit'
                node['cac:PaymentMandate'] = self._ubl_get_payment_means_payment_mandate_node_from_mandate(vals, sdd_mandate)
                node['cac:PayeeFinancialAccount'] = None

        # [BR-FR-CO-09/BT-23] : Si le cadre de facturation (BT-23) est B2, S2 ou M2, alors la date d'échéance (BT-9)
        # doit être renseignée et correspondre à la date de paiement.
        if self._is_document(vals, 'credit_note', 'self_credit_note') and self._l10n_fr_pdp_get_profile_id(vals) in ('B2', 'S2', 'M2'):
            payment_due_date = invoice._pdp_get_payment_date() or invoice.invoice_date
            for node in nodes:
                node['cbc:PaymentDueDate'] = {'_text': payment_due_date}

    # -------------------------------------------------------------------------
    # EXPORT: TAXES & TOTALS NODES
    # -------------------------------------------------------------------------

    def _ubl_get_tax_subtotal_node(self, vals, tax_subtotal):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_tax_subtotal_node(vals, tax_subtotal)

        # The VAT category rate is reported in the tax category only ([UBL-CR-?] cac:TaxSubtotal/cbc:Percent).
        node['cbc:Percent']['_text'] = None

        # [BR-S-08]/[BR-E-08]/[BR-Z-08]/... The VAT category taxable amount (BT-116) shall equal the sum of the line
        # net amounts (BT-131) minus the document level allowances (BT-92) plus the document level charges (BT-99) of
        # this VAT category. Recompute it from the nodes to avoid any rounding discrepancy.
        def same_category(category_node, other_category_node):
            return (
                category_node['cbc:ID']['_text'] == other_category_node['cbc:ID']['_text']
                and category_node['cbc:Percent']['_text'] == other_category_node['cbc:Percent']['_text']
                and category_node['_currency'] == other_category_node['_currency']
            )

        document_node = vals['document_node']
        amounts = []
        for tax_category_node in node['cac:TaxCategory']:
            amounts += [
                line_node['cbc:LineExtensionAmount']['_text']
                for line_key in ('cac:InvoiceLine', 'cac:CreditNoteLine')
                for line_node in document_node.get(line_key, [])
                for line_tax_category_node in line_node['cac:Item']['cac:ClassifiedTaxCategory']
                if same_category(line_tax_category_node, tax_category_node)
            ]
            amounts += [
                (1 if allowance_node['cbc:ChargeIndicator']['_text'] == 'true' else -1) * allowance_node['cbc:Amount']['_text']
                for allowance_node in document_node['cac:AllowanceCharge']
                for allowance_tax_category_node in allowance_node['cac:TaxCategory']
                if same_category(allowance_tax_category_node, tax_category_node)
            ]
        if amounts:
            currency = tax_subtotal['currency']
            node['cbc:TaxableAmount'] = {
                '_text': FloatFmt(sum(amounts), min_dp=currency.decimal_places),
                'currencyID': currency.name,
            }
        return node

    def _ubl_tax_totals_node_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.ubl
        tax_total_keys = super()._ubl_tax_totals_node_grouping_key(base_line, tax_data, vals, currency)

        # cac:WithholdingTaxTotal is not part of EN 16931: the withholding taxes are reported as a prepaid amount.
        if tax_total_keys['tax_total_key'] and tax_total_keys['tax_total_key']['is_withholding']:
            tax_total_keys['tax_total_key'] = None

        # [BR-53]/[UBL-SR-?] The TaxTotal expressed in VAT accounting currency (BT-111) has no TaxSubtotal.
        company_currency = vals['company_currency']
        if (
            tax_total_keys['tax_subtotal_key']
            and company_currency != vals['currency']
            and tax_total_keys['tax_subtotal_key']['currency'] == company_currency
        ):
            tax_total_keys['tax_subtotal_key'] = None

        return tax_total_keys

    def _ubl_add_legal_monetary_total_payable_rounding_amount_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_legal_monetary_total_payable_rounding_amount_node(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return

        # The withholding taxes are reported in the PrepaidAmount, not in the PayableRoundingAmount.
        currency = vals['currency']
        node = vals['legal_monetary_total_node']['cbc:PayableRoundingAmount']
        if tax_withholding_amount := self._l10n_fr_pdp_get_tax_withholding_amount(vals):
            payable_rounding_amount = (node['_text'] or 0.0) + tax_withholding_amount
            if currency.is_zero(payable_rounding_amount):
                node['_text'] = None
                node['currencyID'] = None
            else:
                node['_text'] = FloatFmt(payable_rounding_amount, min_dp=currency.decimal_places)
                node['currencyID'] = currency.name

    def _ubl_add_legal_monetary_total_prepaid_payable_amount_node(self, vals, in_foreign_currency=True):
        # EXTENDS account.edi.ubl
        super()._ubl_add_legal_monetary_total_prepaid_payable_amount_node(vals, in_foreign_currency=in_foreign_currency)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return

        # BT-113: the withholding taxes are reported as a prepaid amount.
        currency = vals['currency'] if in_foreign_currency else vals['company_currency']
        node = vals['legal_monetary_total_node']['cbc:PrepaidAmount']
        node['_text'] = FloatFmt(
            node['_text'] + self._l10n_fr_pdp_get_tax_withholding_amount(vals),
            min_dp=currency.decimal_places,
        )

    # -------------------------------------------------------------------------
    # EXPORT: LINE NODES
    # -------------------------------------------------------------------------

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_line_allowance_charge_nodes(vals)
        # BG-27/BG-28: line allowances (discount) and charges (recycling contributions, excises).
        self._ubl_add_line_allowance_charge_nodes_for_discount(vals)
        self._ubl_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(vals)
        self._ubl_add_line_allowance_charge_nodes_for_excise_taxes(vals)

    def _ubl_add_line_price_node(self, vals, in_foreign_currency=True):
        # OVERRIDE account.edi.ubl
        # BT-146 (net price), BT-147 (price discount) and BT-148 (gross price): the line discount is reported as a line
        # allowance (BG-27), the price discount is then always 0.
        line_node = vals['line_node']
        base_line = vals['line_vals']['base_line']
        suffix = '_currency' if in_foreign_currency else ''
        currency = base_line['currency_id'] if in_foreign_currency else vals['company_currency']
        price_amount = base_line['tax_details'][f'raw_gross_price_unit{suffix}']

        line_node['cac:Price'] = {
            'cbc:PriceAmount': {
                '_text': FloatFmt(price_amount, min_dp=1, max_dp=6),
                'currencyID': currency.name,
            },
            'cac:AllowanceCharge': {
                "cbc:ChargeIndicator": [{
                    "_text": 'false',
                }],
                # Discount amount
                "cbc:Amount": [{
                    "_text": FloatFmt(0, min_dp=1, max_dp=6),
                    "currencyID": currency.name,
                }],
                # Pre-discount amount
                'cbc:BaseAmount': {
                    '_text': FloatFmt(price_amount, min_dp=1, max_dp=6),
                    'currencyID': currency.name,
                },
            }
        }

    # -------------------------------------------------------------------------
    # EXPORT: CONSTRAINTS
    # -------------------------------------------------------------------------

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.cen_en16931
        constraints = super()._export_document_constraints(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return constraints

        invoice = vals['invoice']
        document_node = vals['document_node']
        nsmap = document_node['_nsmap']

        # [BR-IC-11] In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
        # "Intra-community supply" the Actual delivery date (BT-72) or the Invoicing period (BG-14) shall not be blank.
        if (
            self._is_intracommunity_supply(vals)
            and dict_to_xml((document_node['cac:Delivery'] or {}).get('cbc:ActualDeliveryDate'), nsmap=nsmap, tag='cbc:ActualDeliveryDate') is None
            and dict_to_xml(document_node['cac:InvoicePeriod'], nsmap=nsmap, tag='cac:InvoicePeriod') is None
        ):
            constraints['cen_en16931_delivery_date_invoicing_period'] = _("For intracommunity supply, the actual delivery date or the invoicing period should be included.")

        # [BR-61] If the Payment means type code (BT-81) means SEPA credit transfer, Local credit transfer or
        # Non-SEPA international credit transfer, the Payment account identifier (BT-84) shall be present.
        for node in document_node['cac:PaymentMeans']:
            if node['cbc:PaymentMeansCode']['_text'] in (30, 58):
                constraints['cen_en16931_payment_account_identifier'] = self._check_required_fields(invoice, 'partner_bank_id')

        # [BR-57] Each Deliver to address (BG-15) shall contain a Deliver to country code (BT-80).
        if (
            document_node['cac:Delivery']
            and not document_node['cac:Delivery']['cac:DeliveryLocation']['cac:Address']['cac:Country']['cbc:IdentificationCode']['_text']
        ):
            constraints['cen_en16931_delivery_address'] = self._check_required_fields(vals['delivery'], 'country_id')

        for partner_type in ('supplier', 'customer'):
            partner = vals[partner_type]
            commercial_partner = partner.commercial_partner_id
            if commercial_partner.routing_scheme != '0225' or not commercial_partner.routing_endpoint:
                constraints[f"ubl_21_fr_{partner_type}_pdp_identifier_required"] = self.env._("The following partner's French e-invoicing identifier is missing: %s", commercial_partner.display_name)
            identifier_vals = commercial_partner._get_preferred_routing_identifier_vals()
            if not identifier_vals.get('scheme') or not identifier_vals.get('value'):
                constraints[f"ubl_21_fr_{partner_type}_siret_required"] = self.env._("The following partner's SIREN or SIRET is missing: %s", commercial_partner.display_name)

        if self._is_document(vals, 'credit_note', 'self_credit_note') and not (invoice.reversed_entry_id.name or invoice.reversed_entry_id.invoice_date):
            constraints["ubl_21_fr_refund_invoice_reference"] = self.env._("You cannot create a Credit Note without an original invoice: %s", invoice.name)

        customer = vals['customer'].commercial_partner_id
        if self._pdp_is_b2g(customer) and not self._pdp_can_invoice_b2g(customer):
            cpro_module_name = self.env['ir.module.module'].sudo()._get('l10n_fr_facturx_chorus_pro').display_name
            constraints["ubl_21_fr_cpro_module_missing"] = self.env._("This partner is behind Chorus PRO. Please install the module '%s'", cpro_module_name)

        return constraints

    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _import_ubl_invoice_add_customer_values(self, collected_values):
        super()._import_ubl_invoice_add_customer_values(collected_values)
        party_tag = "AccountingCustomerParty" if collected_values['odoo_document_type'] == 'sale' else "AccountingSupplierParty"
        collected_values['customer_values']['siret'] = collected_values['tree'].findtext(
            f"./{{*}}{party_tag}/{{*}}Party/{{*}}PartyIdentification/{{*}}ID[@schemeID='0009']"
        )

    def _import_ubl_retrieve_customer_search_plan(self, collected_values):
        return [
            self.env['res.partner']._import_retrieve_customer_from_siret,
            *super()._import_ubl_retrieve_customer_search_plan(collected_values),
        ]

    def _import_ubl_invoice_add_prepaid_amount(self, collected_values):
        # imported invoice is a final invoice following downpayments.
        # We assume all billing references are references to downpayments.
        invoice = collected_values['invoice']
        currency = collected_values['currency_values']['currency']
        tree = collected_values['tree']
        if tree.findtext('./{*}ProfileID') in ('B4', 'S4', 'M4'):
            prepaid_amount = float(tree.findtext('./{*}LegalMonetaryTotal/{*}PrepaidAmount') or 0)
            collected_values['prepaid_amount'] = prepaid_amount
            if not invoice.currency_id.is_zero(prepaid_amount):
                downpayments_names = tree.findall('./{*}BillingReference/{*}InvoiceDocumentReference/{*}ID')
                # groups downpayments by ref to avoid a downpayment being duplicated in the db being substracted multiple times
                grouped_downpayments = self.env['account.move'].search([('ref', 'in', [downpayment.text for downpayment in downpayments_names])]).grouped('ref')

                downpayment_lines = self.env['account.move.line']
                for downpayments in grouped_downpayments.values():
                    downpayment = downpayments[0]
                    for line in downpayment.invoice_line_ids:
                        downpayment_lines |= line.copy({'quantity': -line.quantity if downpayment.move_type == 'in_invoice' else line.quantity})
                collected_values['downpayment_lines'] = downpayment_lines

                # logging
                formatted_amount = formatLang(self.env, prepaid_amount, currency_obj=currency)
                collected_values['logs'].append(_("A downpayment of %s was detected.", formatted_amount))
                for downpayment_name in downpayments_names:
                    if downpayment_name.text not in grouped_downpayments:
                        collected_values['logs'].append(_("Downpayment %s not found. Imported amounts will probably be incorrect.", downpayment_name.text))
        super()._import_ubl_invoice_add_prepaid_amount(collected_values)

    def _import_ubl_invoice_fix_untaxed_amount(self, collected_values):
        # Downpayments may be reported as a prepaid amount.
        # In this case, the final invoice untaxed amount, tax amount and total amount
        # correspond to the amounts without any downpayments made.
        # We need to add the downpayment lines as negative lines in the final invoice
        # because we already imported and accounted for the downpayments.
        super()._import_ubl_invoice_fix_untaxed_amount(collected_values)
        invoice = collected_values['invoice']
        if downpayment_lines := collected_values.get('downpayment_lines'):
            container = {'records': invoice}
            with (
                invoice._check_balanced(container),
                invoice._disable_discount_precision(),
                invoice._sync_dynamic_lines(container),
            ):
                downpayment_lines.move_id = invoice.id
