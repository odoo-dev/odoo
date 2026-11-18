from odoo import models

from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt


class AccountEdiUBLCoreInvoice(models.AbstractModel):
    """ The UBL binding shared by the EN 16931 semantic model ('account.edi.ubl_cen_en16931') and the Peppol
    International (PINT) one ('account.edi.ubl_pint'), PINT being derived from the EN 16931 core invoice.

    Both semantic models restrict UBL 2.1 the same way on these points: what is reported (or not) in the header, the
    party, delivery, payment and tax totals nodes. The rules are referenced with their EN 16931 identifiers (BT-*,
    BR-*, UBL-CR-*); the PINT ones (ibt-*, ibr-*) are the same with an 'i' prefix.

    Both layers inherit this one, so that PINT EU ('account.edi.ubl_pint_eu', inheriting both) applies it once.
    """
    _name = 'account.edi.ubl_core_invoice'
    _inherit = ['account.edi.ubl']
    _description = "UBL binding shared by EN 16931 and PINT"

    # -------------------------------------------------------------------------
    # EXPORT: VALUES
    # -------------------------------------------------------------------------

    def _ubl_report_withholding_taxes_as_prepaid_amount(self, vals):
        # EXTENDS account.edi.ubl
        # [UBL-CR-513]/[UBL-CR-562] cac:WithholdingTaxTotal is not part of EN 16931 nor PINT: the withheld amount is
        # reported as a Paid amount (BT-113), so that the Amount due for payment (BT-115) stays consistent ([BR-CO-16]).
        return True

    # -------------------------------------------------------------------------
    # EXPORT: HEADER NODES
    # -------------------------------------------------------------------------

    def _ubl_add_invoice_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-04] An Invoice shall have an Invoice type code (BT-3) (UNCL 1001 subset, [BR-CL-01]):
        # 380 (commercial invoice), 389 (self-billed invoice).
        super()._ubl_add_invoice_type_code_node(vals)
        node = vals['document_node']['cbc:InvoiceTypeCode']
        if self._is_document(vals, 'invoice'):
            node['_text'] = 380
        elif self._is_document(vals, 'self_invoice'):
            node['_text'] = 389

    def _ubl_add_credit_note_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-04] An Invoice shall have an Invoice type code (BT-3) (UNCL 1001 subset, [BR-CL-01]):
        # 381 (credit note), 261 (self-billed credit note).
        super()._ubl_add_credit_note_type_code_node(vals)
        node = vals['document_node']['cbc:CreditNoteTypeCode']
        if self._is_document(vals, 'credit_note'):
            node['_text'] = 381
        elif self._is_document(vals, 'self_credit_note'):
            node['_text'] = 261

    def _ubl_add_document_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-05] An Invoice shall have an Invoice currency code (BT-5), coded using ISO 4217 alpha-3 ([BR-CL-04]).
        super()._ubl_add_document_currency_code_node(vals)
        vals['document_node']['cbc:DocumentCurrencyCode']['_text'] = vals['currency'].name

    def _ubl_add_buyer_reference_node(self, vals):
        # EXTENDS account.edi.ubl
        # Buyer reference (BT-10): the reference of the customer.
        super()._ubl_add_buyer_reference_node(vals)
        customer = vals['customer']
        if customer_ref := customer.ref or customer.commercial_partner_id.ref:
            vals['document_node']['cbc:BuyerReference']['_text'] = customer_ref

    # -------------------------------------------------------------------------
    # EXPORT: PARTY NODES
    # -------------------------------------------------------------------------

    def _ubl_get_partner_address_node(self, vals, partner):
        # EXTENDS account.edi.ubl
        # The country subdivision code and the country name are not part of the semantic model: only the Country
        # subdivision (BT-39/BT-54/BT-68/BT-79) and the Country code (BT-40/BT-55/BT-69/BT-80) are.
        # [UBL-CR-162]/[UBL-CR-166]/[UBL-CR-225]/[UBL-CR-229]/[UBL-CR-319]/[UBL-CR-323]/[UBL-CR-374]/[UBL-CR-378]
        node = super()._ubl_get_partner_address_node(vals, partner)
        node['cbc:CountrySubentityCode'] = None
        node['cac:Country']['cbc:Name'] = None
        return node

    def _ubl_add_party_endpoint_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # Seller/Buyer electronic address (BT-34/BT-49) with its Scheme identifier ([BR-62]/[BR-63], EAS code list
        # [BR-CL-25]): the routing identifier of the partner.
        super()._ubl_add_party_endpoint_id_node(vals)
        partner = vals['party_vals']['partner']
        if identifier_vals := partner._get_preferred_routing_identifier_vals():
            normalized_value = self.env['res.partner']._validate_identifier_by_scheme(identifier_vals['scheme'], identifier_vals['value']).get('value')
            vals['party_node']['cbc:EndpointID']['_text'] = normalized_value
            vals['party_node']['cbc:EndpointID']['schemeID'] = identifier_vals['scheme']

    # -------------------------------------------------------------------------
    # EXPORT: DELIVERY NODES
    # -------------------------------------------------------------------------

    # DELIVER TO PARTY: only the Deliver to party name (BT-70) is part of the semantic model.
    # [UBL-CR-390]/[UBL-CR-392]/[UBL-CR-394]/[UBL-CR-396]/[UBL-CR-397]/[UBL-CR-398]

    def _ubl_add_delivery_party_endpoint_id_node(self, vals):
        # OVERRIDE account.edi.ubl
        return

    def _ubl_add_delivery_party_identification_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        return

    def _ubl_add_delivery_party_postal_address_node(self, vals):
        # OVERRIDE account.edi.ubl
        return

    def _ubl_add_delivery_party_tax_scheme_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        return

    def _ubl_add_delivery_party_legal_entity_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        return

    def _ubl_add_delivery_party_contact_node(self, vals):
        # OVERRIDE account.edi.ubl
        return

    # -------------------------------------------------------------------------
    # EXPORT: PAYMENT NODES
    # -------------------------------------------------------------------------

    def _ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(self, vals, partner_bank):
        # EXTENDS account.edi.ubl
        # Payment service provider identifier (BT-86): the BIC, without scheme ([UBL-CR-655]) nor financial
        # institution ([UBL-CR-664]).
        node = super()._ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(vals, partner_bank)
        if node:
            node['cbc:ID']['schemeID'] = None
            node['cac:FinancialInstitution'] = None
        return node

    # -------------------------------------------------------------------------
    # EXPORT: TAX TOTALS NODES
    # -------------------------------------------------------------------------

    def _ubl_get_tax_subtotal_node(self, vals, tax_subtotal):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_tax_subtotal_node(vals, tax_subtotal)

        # [UBL-CR-499] The VAT category rate (BT-119) is cac:TaxCategory/cbc:Percent, not cac:TaxSubtotal/cbc:Percent.
        node['cbc:Percent']['_text'] = None

        # [BR-S-08]/[BR-AE-08]/[BR-E-08]/[BR-Z-08]/[BR-G-08]/[BR-IC-08]/[BR-O-08]/... The VAT category taxable amount
        # (BT-116) shall equal the sum of the Invoice line net amounts (BT-131) minus the Document level allowance
        # amounts (BT-92) plus the Document level charge amounts (BT-99) of this VAT category: computed from the nodes
        # to avoid any rounding discrepancy.
        def same_category(category_node, other_category_node):
            return (
                category_node['cbc:ID']['_text'] == other_category_node['cbc:ID']['_text']
                and category_node['cbc:Percent']['_text'] == other_category_node['cbc:Percent']['_text']
                and category_node['_currency'] == other_category_node['_currency']
            )

        document_node = vals['document_node']
        tax_category_nodes = node['cac:TaxCategory']
        amounts = [
            line_node['cbc:LineExtensionAmount']['_text']
            for tax_category_node in tax_category_nodes
            for line_key in ('cac:InvoiceLine', 'cac:CreditNoteLine')
            for line_node in document_node.get(line_key, [])
            for line_tax_category_node in line_node['cac:Item']['cac:ClassifiedTaxCategory']
            if same_category(line_tax_category_node, tax_category_node)
        ] + [
            -allowance_node['cbc:Amount']['_text']
            for tax_category_node in tax_category_nodes
            for allowance_node in document_node['cac:AllowanceCharge']
            if allowance_node['cbc:ChargeIndicator']['_text'] == 'false'
            for allowance_tax_category_node in allowance_node['cac:TaxCategory']
            if same_category(allowance_tax_category_node, tax_category_node)
        ] + [
            charge_node['cbc:Amount']['_text']
            for tax_category_node in tax_category_nodes
            for charge_node in document_node['cac:AllowanceCharge']
            if charge_node['cbc:ChargeIndicator']['_text'] == 'true'
            for charge_tax_category_node in charge_node['cac:TaxCategory']
            if same_category(charge_tax_category_node, tax_category_node)
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

        # The Invoice total VAT amount in accounting currency (BT-111) is a cac:TaxTotal without cac:TaxSubtotal: the
        # VAT breakdown (BG-23) is only expressed in the Invoice currency ([BR-CO-14], [BR-53]).
        company_currency = vals['company'].currency_id
        if (
            tax_total_keys['tax_subtotal_key']
            and company_currency != vals['currency']
            and tax_total_keys['tax_subtotal_key']['currency'] == company_currency
        ):
            tax_total_keys['tax_subtotal_key'] = None

        return tax_total_keys
