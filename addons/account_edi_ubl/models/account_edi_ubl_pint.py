from odoo import models
from odoo.tools import html2plaintext
from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt


class AccountEdiUBLPint(models.AbstractModel):
    _name = "account.edi.ubl_pint"
    _inherit = 'account.edi.ubl_core_invoice'
    _description = "UBL PINT"

    # -------------------------------------------------------------------------
    # EXPORT: NODES
    # -------------------------------------------------------------------------

    def _ubl_add_version_id_node(self, vals):
        # [UBL-CR-001] (EN 16931) / PINT: the UBL version is not part of the semantic model.
        super()._ubl_add_version_id_node(vals)
        vals['document_node']['cbc:UBLVersionID']['_text'] = None

    def _ubl_add_profile_id_node(self, vals):
        # Business process type (IBT-023), shared by every PINT jurisdiction.
        # https://docs.peppol.eu/poac/pint/pint/trn-invoice/semantic-model/ibt-023/
        super()._ubl_add_profile_id_node(vals)

        if self._is_document(vals, 'invoice', 'credit_note'):
            vals['document_node']['cbc:ProfileID']['_text'] = 'urn:peppol:bis:billing'
        elif self._is_document(vals, 'self_invoice', 'self_credit_note'):
            vals['document_node']['cbc:ProfileID']['_text'] = 'urn:peppol:bis:selfbilling'

    def _ubl_add_notes_nodes_all_invoices(self, vals):
        invoice = vals['invoice']
        notes = []

        # The explanation of the PrepaidAmount coming from the withholding taxes.
        if withholding_note := self._ubl_get_tax_withholding_note(vals):
            notes.append(withholding_note)

        terms_and_condition = html2plaintext(invoice.narration) if invoice.narration else None
        if terms_and_condition:
            notes.append(terms_and_condition)

        vals['document_node']['cbc:Note'] = {'_text': ' '.join(notes) if notes else None}

    def _ubl_add_notes_nodes(self, vals):
        # [ibr-sr-51]-Note (ibt-022) MUST occur maximum once
        super()._ubl_add_notes_nodes(vals)

        if self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            self._ubl_add_notes_nodes_all_invoices(vals)

    def _ubl_add_delivery_nodes(self, vals):
        # [ibr-107]-Deliver to information (ibg-13) MUST occur maximum once.
        super()._ubl_add_delivery_nodes(vals)

        if self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            document_node = vals['document_node']
            if document_node['cac:Delivery']:
                document_node['cac:Delivery'] = document_node['cac:Delivery'][0]
            else:
                document_node['cac:Delivery'] = None

    def _ubl_add_tax_currency_code_node(self, vals):
        # The currency used for TAX accounting and reporting purposes as accepted or required in the country of the Seller.
        # [ibr-077]-Tax accounting currency code (ibt-006) MUST be different from invoice currency code (ibt-005) when provided.
        # [ibr-cl-05]-Tax currency code (ibt-006) MUST be coded using ISO code list 4217 alpha-3
        super()._ubl_add_tax_currency_code_node(vals)
        company_currency = vals['company'].currency_id
        if vals['document_node']['cbc:DocumentCurrencyCode']['_text'] != company_currency.name:
            vals['document_node']['cbc:TaxCurrencyCode']['_text'] = company_currency.name

    def _ubl_add_billing_reference_nodes(self, vals):
        # A group of business terms providing information on one or more preceding Invoices.
        # [ibr-055]-Each Preceding Invoice reference (ibg-03) MUST contain a Preceding Invoice reference (ibt-025).
        # [ibr-sr-06]-Preceding invoice reference (ibt-025) MUST occur maximum once
        super()._ubl_add_billing_reference_nodes(vals)

        if self._is_document(vals, 'credit_note', 'self_credit_note'):
            credit_note = vals['invoice']
            payment_term_lines = credit_note.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable')
            preceding_invoice_names = [
                preceding_invoice_name
                for preceding_invoice_name in (
                    payment_term_lines
                    .matched_credit_ids.credit_move_id.move_id
                    .mapped('name')
                )
                if preceding_invoice_name and preceding_invoice_name != '/'
            ]

            nodes = vals['document_node']['cac:BillingReference']
            for preceding_invoice_name in preceding_invoice_names:
                nodes.append({
                    'cac:InvoiceDocumentReference': {
                        'cbc:ID': {'_text': preceding_invoice_name},
                    }
                })

    def _should_export_early_payment_discount_as_line(self, vals):
        # Early payment discount lines should not appear as lines but as allowances/charges.
        return False

    def _should_export_global_discount_as_line(self, vals):
        # Global discount lines should not appear as lines but as allowances/charges ([ibr-027] no negative net price).
        return False

    def _should_export_cash_rounding_as_line(self, vals):
        # Cash rounding lines should not appear as lines but in PayableRoundingAmount.
        return False

    def _ubl_add_party_identification_nodes(self, vals):
        super()._ubl_add_party_identification_nodes(vals)

        nodes = vals['party_node']['cac:PartyIdentification']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        self._ubl_add_party_identification_nodes_national(vals)

        if not nodes and commercial_partner.ref and self._ubl_use_partner_ref_as_party_identification(vals):
            nodes.append({
                'cbc:ID': {
                    '_text': commercial_partner.ref,
                    'schemeID': None,
                },
            })

    def _ubl_add_party_identification_nodes_national(self, vals):
        """ Hook to add the party identifiers required by a jurisdiction (before falling back on the partner's ref). """
        return

    def _ubl_use_partner_ref_as_party_identification(self, vals):
        """ Whether the internal reference of the partner is reported as party identifier when there is no other one. """
        return True

    def _ubl_add_party_tax_scheme_nodes(self, vals):
        super()._ubl_add_party_tax_scheme_nodes(vals)

        if not self._should_export_party_tax_scheme(vals):
            return

        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        nodes = vals['party_node']['cac:PartyTaxScheme']
        if not nodes and commercial_partner.routing_scheme and commercial_partner.routing_endpoint:
            # TaxScheme based on partner's Scheme/Endpoint. (removed with multi-id)
            nodes.append({
                'cbc:CompanyID': {'_text': commercial_partner.routing_endpoint},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': commercial_partner.routing_scheme},
                },
            })

    def _ubl_add_party_legal_entity_nodes(self, vals):
        super()._ubl_add_party_legal_entity_nodes(vals)
        self._ubl_add_party_legal_entity_nodes_iso_6523_icd(vals)

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Invoice line allowances (ibg-27) and charges (ibg-28): the line discount, the recycling contributions and
        # the excises (not part of the tax breakdown). Without them, the line net amount (ibt-131) of a discounted line
        # would be its gross amount.
        super()._ubl_add_line_allowance_charge_nodes(vals)
        self._ubl_add_line_allowance_charge_nodes_for_discount(vals)
        self._ubl_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(vals)
        self._ubl_add_line_allowance_charge_nodes_for_excise_taxes(vals)

    def _ubl_should_export_emptying_taxes_as_lines(self, vals):
        # EXTENDS account.edi.ubl
        # The emptying taxes (e.g. deposits on bottles) are reported as separated lines.
        return True

    def _export_document_constraints(self, vals):
        """
        Validates invoice constraints for PINT payload
        https://docs.peppol.eu/poac/pint/v1.1.1/pint/trn-invoice/businessrule/
        """
        constraints = super()._export_document_constraints(vals)

        document_node = vals['document_node']
        is_invoice = self._is_document(vals, 'invoice', 'self_invoice')

        # -----------------------------------------------------------------
        # 1. Specification, Process & Document Identification
        # -----------------------------------------------------------------
        # [IBR-003] - An Invoice MUST have an Invoice issue date (ibt-002).
        if not document_node['cbc:IssueDate']['_text']:
            constraints['ibr_003_issue_date_required'] = self.env._(
                "Invoice Issue Date is missing [IBR-003]."
            )

        # [IBR-005] - An Invoice MUST have an Invoice currency code (ibt-005).
        if not document_node['cbc:DocumentCurrencyCode']['_text']:
            constraints['ibr_005_currency_code_required'] = self.env._(
                "Currency Code is missing [IBR-005]."
            )

        # -----------------------------------------------------------------
        # 2. Accounting Supplier Party (Seller / ibg-04)
        # -----------------------------------------------------------------
        supplier_party = document_node['cac:AccountingSupplierParty']['cac:Party']

        # [IBR-006] - An Invoice MUST contain the Seller name (ibt-027).
        if not supplier_party['cac:PartyName']['cbc:Name']['_text']:
            constraints['ibr_006_seller_name_required'] = self.env._(
                "Seller Name is missing [IBR-006]."
            )

        # [IBR-008] - An Invoice MUST contain the Seller postal address (ibg-05).
        # [IBR-009] - The Seller postal address (ibg-05) MUST contain a Seller country code (ibt-040).
        supplier_country = supplier_party['cac:PostalAddress']['cac:Country']['cbc:IdentificationCode']['_text']
        if not supplier_country:
            constraints['ibr_009_seller_country_required'] = self.env._(
                "Seller Country Code is missing [IBR-009]."
            )

        # [IBR-081] - The Seller electronic address (ibt-034) MUST be provided.
        # [IBR-062] - The Seller electronic address (ibt-034) MUST have a Scheme identifier.
        seller_endpoint = supplier_party.get('cbc:EndpointID', {})
        if not seller_endpoint.get('_text'):
            constraints['ibr_081_seller_endpoint_required'] = self.env._(
                "Seller Electronic Address / Endpoint ID is missing [IBR-081]."
            )
        if not seller_endpoint.get('schemeID'):
            constraints['ibr_062_seller_endpoint_scheme_required'] = self.env._(
                "Seller Electronic Address Scheme Identifier is missing [IBR-062]."
            )

        # -----------------------------------------------------------------
        # 3. Accounting Customer Party (Buyer / ibg-08)
        # -----------------------------------------------------------------
        customer_party = document_node['cac:AccountingCustomerParty']['cac:Party']

        # [IBR-007] - An Invoice MUST contain the Buyer name (ibt-044).
        if not customer_party['cac:PartyName']['cbc:Name']['_text']:
            constraints['ibr_007_buyer_name_required'] = self.env._(
                "Buyer Name is missing [IBR-007]."
            )

        # [IBR-010] - An Invoice MUST contain the Buyer postal address (ibg-08).
        # [IBR-011] - The Buyer postal address (ibg-08) MUST contain a Buyer country code (ibt-055).
        customer_country = customer_party['cac:PostalAddress']['cac:Country']['cbc:IdentificationCode']['_text']
        if not customer_country:
            constraints['ibr_011_buyer_country_required'] = self.env._(
                "Buyer Country Code is missing [IBR-011]."
            )

        # [IBR-080] - The Buyer electronic address (ibt-049) MUST be provided.
        # [IBR-063] - The Buyer electronic address (ibt-049) MUST have a Scheme identifier.
        buyer_endpoint = customer_party.get('cbc:EndpointID', {})
        if not buyer_endpoint.get('_text'):
            constraints['ibr_080_buyer_endpoint_required'] = self.env._(
                "Buyer Electronic Address / Endpoint ID is missing [IBR-080]."
            )
        if not buyer_endpoint.get('schemeID'):
            constraints['ibr_063_buyer_endpoint_scheme_required'] = self.env._(
                "Buyer Electronic Address Scheme Identifier is missing [IBR-063]."
            )

        # -----------------------------------------------------------------
        # 4. Invoice Lines (ibg-25)
        # -----------------------------------------------------------------
        line_key = 'cac:InvoiceLine' if is_invoice else 'cac:CreditNoteLine'
        invoice_lines = document_node[line_key]

        # [IBR-016] - An Invoice MUST have at least one Invoice line (ibg-25).
        if not invoice_lines:
            constraints['ibr_016_invoice_line_required'] = self.env._(
                "At least one Invoice Line is required [IBR-016]."
            )

        for line_idx, line in enumerate(invoice_lines, start=1):

            # [IBR-022] - Each Invoice line (ibg-25) MUST have an invoiced quantity (ibt-129).
            qty_node = line['cbc:InvoicedQuantity'] if is_invoice else line.get('cbc:CreditedQuantity', {})
            if qty_node.get('_text') is None:
                constraints[f'ibr_022_line_qty_required_{line_idx}'] = self.env._(
                    "Line %s: Invoiced quantity is missing [IBR-022].", line_idx
                )

            # [IBR-023] - An Invoice line (ibg-25) MUST have an Invoiced quantity unit of measure code (ibt-130).
            if not qty_node.get('unitCode'):
                constraints[f'ibr_023_line_unit_code_required_{line_idx}'] = self.env._(
                    "Line %s: Invoiced quantity unit of measure code is missing [IBR-023].", line_idx
                )

            # [IBR-024] - Each Invoice line (ibg-25) MUST have an Invoice line net amount (ibt-131).
            if not isinstance(line['cbc:LineExtensionAmount']['_text'], FloatFmt):
                constraints[f'ibr_024_line_net_amount_required_{line_idx}'] = self.env._(
                    "Line %s: Invoice line net amount is missing [IBR-024].", line_idx
                )

            line_item = line['cac:Item']
            # [IBR-025] - Each Invoice line (ibg-25) MUST contain the Item name (ibt-153).
            if not (line_item.get('cbc:Name') or {}).get('_text'):
                constraints[f'ibr_025_item_name_required_{line_idx}'] = self.env._(
                    "Line %s: Item name is missing [IBR-025].", line_idx
                )

            # [IBR-026] - Each Invoice line (ibg-25) MUST contain the Item net price (ibt-146).
            # [IBR-027] - The Item net price (ibt-146) MUST NOT be negative.
            net_price = line['cac:Price']['cbc:PriceAmount']['_text']
            if not isinstance(net_price, FloatFmt):
                constraints[f'ibr_026_price_amount_required_{line_idx}'] = self.env._(
                    "Line %s: Item net price is missing [IBR-026].", line_idx
                )
            elif float(net_price) < 0:
                constraints[f'ibr_027_price_amount_negative_{line_idx}'] = self.env._(
                    "Line %s: Item net price MUST NOT be negative [IBR-027].", line_idx
                )

            # [IBR-SR-58] - The Invoiced item TAX category code (ibt-151) MUST be present.
            if not all(tax_category['cbc:ID']['_text'] for tax_category in line_item['cac:ClassifiedTaxCategory']):
                constraints[f'ibr_sr_58_line_tax_category_required_{line_idx}'] = self.env._(
                    "Line %s: Item tax category code is missing [IBR-SR-58].", line_idx
                )

            # -----------------------------------------------------------------
            # 5. Allowances and Charges (ibg-20, ibg-21, ibg-27, ibg-28)
            # -----------------------------------------------------------------
            doc_allowances = line['cac:AllowanceCharge']

            for charge_idx, allow_node in enumerate(doc_allowances, start=1):
                is_charge = allow_node['cbc:ChargeIndicator']['_text'] == 'true'
                amount = allow_node['cbc:Amount']['_text']
                reason_text = (allow_node.get('cbc:AllowanceChargeReason') or {}).get('_text')
                reason_code = (allow_node.get('cbc:AllowanceChargeReasonCode') or {}).get('_text')

                if is_charge:
                    # [IBR-036] - Charge (ibg-21) MUST have a charge amount (ibt-099).
                    if not isinstance(amount, FloatFmt):
                        constraints[f'ibr_036_charge_amount_required_{charge_idx}'] = self.env._(
                            "Document Charge %(charge)s of line %(line)s: Amount is missing [IBR-036].", charge=charge_idx, line=line_idx
                        )
                    # [IBR-038] - Each Document level charge (ibg-21) MUST have a reason or reason code.
                    if not reason_text and not reason_code:
                        constraints[f'ibr_038_charge_reason_required_{charge_idx}'] = self.env._(
                            "Document Charge %(charge)s of line %(line)s: Reason or Reason Code is required [IBR-038].", charge=charge_idx, line=line_idx
                        )
                else:
                    # [IBR-031] - Allowance (ibg-20) MUST have an allowance amount (ibt-092).
                    if not isinstance(amount, FloatFmt):
                        constraints[f'ibr_031_allowance_amount_required_{charge_idx}'] = self.env._(
                            "Document Allowance %(charge)s of line %(line)s: Amount is missing [IBR-031].", charge=charge_idx, line=line_idx
                        )
                    # [IBR-033] - Each Document level allowance (ibg-20) MUST have a reason or reason code.
                    if not reason_text and not reason_code:
                        constraints[f'ibr_033_allowance_reason_required_{charge_idx}'] = self.env._(
                            "Document Allowance %(charge)s of line %(line)s: Reason or Reason Code is required [IBR-033].", charge=charge_idx, line=line_idx
                        )

        return constraints

