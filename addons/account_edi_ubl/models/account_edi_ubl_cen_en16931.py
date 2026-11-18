from odoo import _, models
from odoo.tools import html2plaintext

from odoo.addons.account.tools import dict_to_xml


class AccountEdiUBLCenEn16931(models.AbstractModel):
    """ The EN 16931-3-2 UBL syntax binding: the European semantic data model of an electronic invoice (EN 16931-1,
    'account.edi.cen_en16931') expressed in UBL 2.1 ('account.edi.ubl'). The parts of the binding that PINT shares
    with EN 16931 are in 'account.edi.ubl_core_invoice'.

    This layer only holds what the norm mandates or recommends in UBL, i.e. what is checked by the CEN validation
    artefacts of the UBL binding (EN16931-UBL-validation.sch):
    * UBL-CR-*: the UBL elements that are not part of the semantic model shall not be used (warnings);
    * UBL-SR-*: the UBL elements whose cardinality is restricted by the semantic model (fatal);
    * BR-*: the business rules of EN 16931-1 that depend on the way the values are reported in UBL.

    The CIUS / extensions of EN 16931 that are not transported as Peppol BIS (e.g. French UBL 2.1 FR, CIUS-RO, HR-CIUS,
    Serbian SRBDT) inherit this layer directly; the European Peppol formats get it through PINT EU
    ('account.edi.ubl_pint_eu', thus Peppol BIS Billing 3.0 and its national CIUS).

    * EN 16931 validation artefacts: https://github.com/ConnectingEurope/eInvoicing-EN16931
    * UBL syntax binding: https://github.com/ConnectingEurope/eInvoicing-EN16931/tree/master/ubl
    """
    _name = 'account.edi.ubl_cen_en16931'
    _inherit = ['account.edi.cen_en16931', 'account.edi.ubl_core_invoice']
    _description = "EN 16931 UBL syntax binding"

    # -------------------------------------------------------------------------
    # EXPORT: HEADER NODES
    # -------------------------------------------------------------------------

    def _ubl_add_notes_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Invoice note (BT-22): the terms and conditions of the invoice, preceded by the explanation of the Paid
        # amount (BT-113) coming from the withholding taxes, if any.
        super()._ubl_add_notes_nodes(vals)
        notes = vals['document_node']['cbc:Note']
        # PINT (thus PINT EU) already reports this text as its single note (dict instead of list).
        if not isinstance(notes, list) or not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return

        invoice = vals['invoice']
        texts = []
        if withholding_note := self._ubl_get_tax_withholding_note(vals):
            texts.append(withholding_note)
        if invoice.narration and (terms_and_conditions := html2plaintext(invoice.narration)):
            texts.append(terms_and_conditions)
        if texts:
            notes.append({'_text': self._edi_truncate(' '.join(texts), 'BT-22')})

    def _ubl_add_tax_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl
        # VAT accounting currency code (BT-6): only used when the VAT accounting currency differs from the Invoice
        # currency, together with the Invoice total VAT amount in accounting currency (BT-111, [BR-53]).
        super()._ubl_add_tax_currency_code_node(vals)
        company_currency = vals['company'].currency_id
        if vals['currency'] != company_currency:
            vals['document_node']['cbc:TaxCurrencyCode']['_text'] = company_currency.name

    # -------------------------------------------------------------------------
    # EXPORT: PARTY NODES
    # -------------------------------------------------------------------------

    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-06]/[BR-07] Seller/Buyer name (BT-27/BT-44) = cac:PartyLegalEntity/cbc:RegistrationName.
        # Seller/Buyer legal registration identifier (BT-30/BT-47), whose scheme is an ISO 6523 ICD ([BR-CL-11]).
        # [UBL-SR-11]/[UBL-SR-17] at most one legal registration identifier: not added when already reported
        # (e.g. by PINT for PINT EU).
        super()._ubl_add_party_legal_entity_nodes(vals)
        if not vals['party_node']['cac:PartyLegalEntity']:
            self._ubl_add_party_legal_entity_nodes_iso_6523_icd(vals)

    # -------------------------------------------------------------------------
    # EXPORT: DELIVERY NODES
    # -------------------------------------------------------------------------

    def _ubl_add_delivery_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # [UBL-SR-24] Deliver to information (BG-13) shall occur maximum once.
        super()._ubl_add_delivery_nodes(vals)
        document_node = vals['document_node']
        if (
            self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note')
            and isinstance(document_node['cac:Delivery'], list)  # not already done (e.g. by PINT for PINT EU)
        ):
            document_node['cac:Delivery'] = document_node['cac:Delivery'][0] if document_node['cac:Delivery'] else None

    def _ubl_get_delivery_node_from_delivery_address(self, vals):
        # EXTENDS account.edi.ubl
        # [BR-IC-11] In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
        # "Intra-community supply" the Actual delivery date (BT-72) or the Invoicing period (BG-14) shall not be blank:
        # without delivery date, the invoice date is reported.
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)
        if (
            self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note')
            and not node['cbc:ActualDeliveryDate']['_text']
            and (
                self._is_intracommunity_supply(vals)
                or any('K' in codes for _base_line, codes in self._get_exported_line_tax_categories(vals))
            )
        ):
            node['cbc:ActualDeliveryDate']['_text'] = vals['invoice'].invoice_date
        return node

    # -------------------------------------------------------------------------
    # EXPORT: PAYMENT NODES
    # -------------------------------------------------------------------------

    def _ubl_add_payment_means_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_payment_means_nodes(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return

        # DIRECT DEBIT (BG-19), when a usable SEPA mandate exists: Payment means type code (BT-81) 59, Mandate
        # reference identifier (BT-89), Bank assigned creditor identifier (BT-90, seller identifier with the scheme
        # 'SEPA', [UBL-SR-29]) and Debited account identifier (BT-91).
        invoice = vals['invoice']
        if (
            self.module_installed('account_sepa_direct_debit')
            and (sdd_mandate := invoice._get_usable_mandate(mandate_type='sepa'))
            and sdd_mandate.partner_bank_id.account_number
            and sdd_mandate.company_id.sdd_creditor_identifier
        ):
            vals['document_node']['cac:AccountingSupplierParty']['cac:Party']['cac:PartyIdentification'].append({
                'cbc:ID': {'_text': sdd_mandate.company_id.sdd_creditor_identifier, 'schemeID': 'SEPA'},
            })
            for node in vals['document_node']['cac:PaymentMeans']:
                node['cbc:PaymentMeansCode']['_text'] = 59
                node['cbc:PaymentMeansCode']['name'] = 'sepa direct debit'
                node['cac:PaymentMandate'] = self._ubl_get_payment_means_payment_mandate_node_from_mandate(vals, sdd_mandate)
                node['cac:PayeeFinancialAccount'] = None

    # -------------------------------------------------------------------------
    # EXPORT: LINE NODES
    # -------------------------------------------------------------------------

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Invoice line allowances (BG-27) and charges (BG-28): the line discount ([BR-27] the Item net price can't be
        # negative), the recycling contributions and the excises (which are not VAT, so not part of the VAT breakdown).
        # They are part of the Invoice line net amount (BT-131).
        super()._ubl_add_line_allowance_charge_nodes(vals)
        # Not when already done (e.g. by PINT for PINT EU): the helpers would give the same nodes again.
        if not vals['line_node']['cac:AllowanceCharge']:
            self._ubl_add_line_allowance_charge_nodes_for_discount(vals)
            self._ubl_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(vals)
            self._ubl_add_line_allowance_charge_nodes_for_excise_taxes(vals)

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
            and dict_to_xml(document_node['cac:Delivery']['cac:DeliveryLocation']['cac:Address']['cac:Country']['cbc:IdentificationCode'], nsmap=nsmap, tag='cbc:IdentificationCode') is None
        ):
            constraints['cen_en16931_delivery_address'] = self._check_required_fields(vals['delivery'], 'country_id')

        return constraints
