from stdnum.be import vat as be_vat

from odoo import _, models
from odoo.tools import formatLang, html2plaintext, NON_BREAKING_SPACE

from odoo.addons.account_edi_ubl_cii.models.account_edi_common import (
    dispatch_by_document,
    documents,
    FloatFmt,
    GST_COUNTRY_CODES,
)


class AccountEdiUBLPint(models.AbstractModel):
    _name = "account.edi.ubl_pint"
    _inherit = 'account.edi.ubl'
    _description = "UBL PINT"

    # -------------------------------------------------------------------------
    # EXPORT: NODES
    # -------------------------------------------------------------------------

    @dispatch_by_document
    def _ubl_add_notes_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl
        # [ibr-sr-51]-Note (ibt-022) MUST occur maximum once
        super()._ubl_add_notes_nodes(vals)
        vals['document_node']['cbc:Note'] = {'_text': None}

    @dispatch_by_document
    def _ubl_add_document_currency_code_node(self, vals):
        # EXTENDS account.edi.xml.ubl
        # The currency in which the invoice is issued and in which all monetary amounts are expressed.
        # [ibr-005]-An Invoice MUST have an Invoice currency code (ibt-005).
        # [ibr-cl-04]-Invoice currency code (ibt-005) MUST be coded using ISO code list 4217 alpha-3
        super()._ubl_add_document_currency_code_node(vals)
        vals['document_node']['cbc:DocumentCurrencyCode']['_text'] = vals['currency'].name

    @dispatch_by_document
    def _ubl_add_tax_currency_code_node(self, vals):
        # EXTENDS account.edi.xml.ubl
        # The currency used for TAX accounting and reporting purposes as accepted or required in the country of the Seller.
        # [ibr-077]-Tax accounting currency code (ibt-006) MUST be different from invoice currency code (ibt-005) when provided.
        # [ibr-cl-05]-Tax currency code (ibt-006) MUST be coded using ISO code list 4217 alpha-3
        super()._ubl_add_tax_currency_code_node(vals)
        company_currency = vals['company'].currency_id
        if vals['document_node']['cbc:DocumentCurrencyCode']['_text'] != company_currency.name:
            vals['document_node']['cbc:TaxCurrencyCode']['_text'] = company_currency.name

    @dispatch_by_document
    def _ubl_add_buyer_reference_node(self, vals):
        # EXTENDS account.edi.xml.ubl
        super()._ubl_add_buyer_reference_node(vals)

        customer = vals['customer']
        if customer_ref := customer.commercial_partner_id.ref:
            vals['document_node']['cbc:BuyerReference']['_text'] = customer_ref

    @dispatch_by_document
    def _ubl_get_partner_address_node(self, vals, partner):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_partner_address_node(vals, partner)
        node['cbc:CountrySubentityCode'] = None
        node['cac:Country']['cbc:Name'] = None
        return node

    @dispatch_by_document
    def _ubl_add_party_endpoint_id_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_endpoint_id_node(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        if commercial_partner.peppol_endpoint and commercial_partner.peppol_eas:
            vals['party_node']['cbc:EndpointID']['_text'] = commercial_partner.peppol_endpoint
            vals['party_node']['cbc:EndpointID']['schemeID'] = commercial_partner.peppol_eas

    @dispatch_by_document
    def _ubl_add_party_identification_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_identification_nodes(vals)
        nodes = vals['party_node']['cac:PartyIdentification']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        country_code = commercial_partner.country_code

        if country_code == 'BE' and commercial_partner.company_registry:
            nodes.append({
                'cbc:ID': {
                    '_text': be_vat.compact(commercial_partner.company_registry),
                    'schemeID': '0208',
                },
            })
        elif commercial_partner.ref and country_code != 'DK':  # DK-R-013
            nodes.append({
                'cbc:ID': {
                    '_text': commercial_partner.ref,
                    'schemeID': None,
                },
            })

    @dispatch_by_document
    def _ubl_add_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_tax_scheme_nodes(vals)
        nodes = vals['party_node']['cac:PartyTaxScheme']

        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        country_code = commercial_partner.country_code
        if not country_code:
            return

        if commercial_partner.vat and commercial_partner.vat != '/':
            vat = commercial_partner.vat
            country_code = commercial_partner.country_id.code
            if country_code in GST_COUNTRY_CODES:
                tax_scheme_id = 'GST'
            else:
                tax_scheme_id = 'VAT'

            if country_code == 'HU' and not vat.upper().startswith('HU'):
                vat = 'HU' + vat[:8]

            nodes.append({
                'cbc:CompanyID': {'_text': vat},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': tax_scheme_id},
                },
            })
        elif commercial_partner.peppol_endpoint and commercial_partner.peppol_eas:
            # TaxScheme based on partner's EAS/Endpoint.
            nodes.append({
                'cbc:CompanyID': {'_text': commercial_partner.peppol_endpoint},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': commercial_partner.peppol_eas},
                },
            })

    @dispatch_by_document
    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_legal_entity_nodes(vals)
        nodes = vals['party_node']['cac:PartyLegalEntity']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        vat = commercial_partner.vat != '/' and commercial_partner.vat

        if commercial_partner.peppol_eas in ('0106', '0190'):
            nl_id = commercial_partner.peppol_endpoint
        else:
            nl_id = commercial_partner.company_registry

        if commercial_partner.country_code == 'NL' and nl_id:
            # For NL, VAT can be used as a Peppol endpoint, but KVK/OIN has to be used as PartyLegalEntity/CompanyID
            # To implement a workaround on stable, company_registry field is used without recording whether
            # the number is a KVK or OIN, and the length of the number (8 = KVK, 20 = OIN) is used to determine the type
            nodes.append({
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': nl_id,
                    'schemeID': '0190' if len(nl_id) == 20 else '0106',
                },
            })
        elif commercial_partner.country_code == 'LU' and commercial_partner.company_registry:
            nodes.append({
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': commercial_partner.company_registry,
                    'schemeID': None,
                },
            })
        elif commercial_partner.country_code == 'SE' and commercial_partner.company_registry:
            nodes.append({
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': ''.join(char for char in commercial_partner.company_registry if char.isdigit()),
                },
            })
        elif commercial_partner.country_code == 'BE' and commercial_partner.company_registry:
            nodes.append({
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': be_vat.compact(commercial_partner.company_registry),
                    'schemeID': '0208',
                },
            })
        elif (
            commercial_partner.country_code == 'DK'
            and commercial_partner.peppol_eas == '0184'
            and commercial_partner.peppol_endpoint
        ):
            nodes.append({
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': commercial_partner.peppol_endpoint,
                    'schemeID': '0184',
                },
            })
        elif commercial_partner.country_code == 'AU' and vat:
            nodes.append({
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': commercial_partner.vat,
                    'schemeID': '0151',
                },
            })
        elif commercial_partner.country_code == 'NZ' and vat:
            nodes.append({
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': commercial_partner.vat,
                    'schemeID': '0088',
                },
            })
        elif commercial_partner.vat and commercial_partner.vat != '/':
            nodes.append({
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': commercial_partner.vat,
                    'schemeID': None,
                },
            })
        elif commercial_partner.peppol_endpoint:
            nodes.append({
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {
                    '_text': commercial_partner.peppol_endpoint,
                    'schemeID': None,
                },
            })

    @dispatch_by_document
    def _ubl_add_accounting_supplier_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
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

    @dispatch_by_document
    def _ubl_add_accounting_customer_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_accounting_customer_party_tax_scheme_nodes(vals)
        nodes = vals['party_node']['cac:PartyTaxScheme']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        country_code = commercial_partner.country_code

    @dispatch_by_document
    def _ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(self, vals, partner_bank):
        # EXTENDS account.edi.xml.ubl
        node = super()._ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(vals, partner_bank)
        if node:
            node['cbc:ID']['schemeID'] = None
            node['cac:FinancialInstitution'] = None
        return node

    @dispatch_by_document
    def _ubl_default_tax_category_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS
        # Recycling contribution taxes / excises should not appear anywhere as taxes but as allowances/charges.
        # Cash rounding lines should not appear as lines but in PayableRoundingAmount.
        # Since this method produces a default 0% tax automatically when no tax is set on the line by default,
        # we have to do something here to avoid it.
        if (
            self._ubl_is_cash_rounding_base_line(base_line)
            or self._ubl_is_recycling_contribution_tax(tax_data)
            or self._ubl_is_excise_tax(tax_data)
        ):
            return
        return super()._ubl_default_tax_category_grouping_key(base_line, tax_data, vals, currency)

    @dispatch_by_document
    def _ubl_get_tax_subtotal_node(self, vals, tax_subtotal):
        # EXTENDS account.edi.xml.ubl
        node = super()._ubl_get_tax_subtotal_node(vals, tax_subtotal)

        # [BR-S-08] cac:TaxSubtotal -> cbc:TaxableAmount should be computed based on the
        # cbc:LineExtensionAmount of each line linked to the tax when cac:TaxCategory -> cbc:ID is S
        # (Standard Rate).
        currency = tax_subtotal['currency']
        corresponding_line_node_amounts = [
            line_node['cbc:LineExtensionAmount']['_text']
            for tax_category_node in node['cac:TaxCategory']
            if tax_category_node['cbc:ID']['_text'] == 'S'
            for line_key in ('cac:InvoiceLine', 'cac:CreditNoteLine', 'cac:DebitNoteLine')
            for line_node in vals['document_node'].get(line_key, [])
            for line_node_tax_category_node in line_node['cac:Item']['cac:ClassifiedTaxCategory']
            if (
                line_node_tax_category_node['cbc:ID']['_text'] == 'S'
                and line_node_tax_category_node['cbc:Percent']['_text'] == tax_category_node['cbc:Percent']['_text']
                and line_node_tax_category_node['_currency'] == tax_category_node['_currency']
            )
        ] + [
            -allowance_node['cbc:Amount']['_text']
            for tax_category_node in node['cac:TaxCategory']
            if tax_category_node['cbc:ID']['_text'] == 'S'
            for allowance_node in vals['document_node']['cac:AllowanceCharge']
            if allowance_node['cbc:ChargeIndicator']['_text'] == 'false'
            for allowance_node_tax_category_node in allowance_node['cac:TaxCategory']
            if (
                allowance_node_tax_category_node['cbc:ID']['_text'] == 'S'
                and allowance_node_tax_category_node['cbc:Percent']['_text'] == tax_category_node['cbc:Percent']['_text']
                and allowance_node_tax_category_node['_currency'] == tax_category_node['_currency']
            )
        ] + [
            allowance_node['cbc:Amount']['_text']
            for tax_category_node in node['cac:TaxCategory']
            if tax_category_node['cbc:ID']['_text'] == 'S'
            for allowance_node in vals['document_node']['cac:AllowanceCharge']
            if allowance_node['cbc:ChargeIndicator']['_text'] == 'true'
            for allowance_node_tax_category_node in allowance_node['cac:TaxCategory']
            if (
                allowance_node_tax_category_node['cbc:ID']['_text'] == 'S'
                and allowance_node_tax_category_node['cbc:Percent']['_text'] == tax_category_node['cbc:Percent']['_text']
                and allowance_node_tax_category_node['_currency'] == tax_category_node['_currency']
            )
        ]
        if corresponding_line_node_amounts:
            node['cbc:TaxableAmount'] = {
                '_text': FloatFmt(sum(corresponding_line_node_amounts), min_dp=currency.decimal_places),
                'currencyID': currency.name,
            }

        return node

    @dispatch_by_document
    def _ubl_tax_totals_node_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.xml.ubl
        tax_total_keys = super()._ubl_tax_totals_node_grouping_key(base_line, tax_data, vals, currency)

        # WithholdingTaxTotal is not allowed.
        # Instead, withholding tax amounts are reported as a PrepaidAmount.
        if tax_total_keys['tax_total_key'] and tax_total_keys['tax_total_key']['is_withholding']:
            tax_total_keys['tax_total_key'] = None

        # [BR-E-10]-A VAT breakdown (BG-23) with VAT Category code (BT-118) "Exempt from VAT" shall have
        # a VAT exemption reason code (BT-121) or a VAT exemption reason text (BT-120).
        tax_category_key = tax_total_keys['tax_category_key']
        if (
            tax_category_key
            and tax_category_key['tax_category_code'] == 'E'
            and not tax_category_key.get('tax_exemption_reason')
        ):
            tax_category_key['tax_exemption_reason'] = _("Exempt from tax")

        # In case of multi-currencies, there will be 2 TaxTotals but the one expressed in
        # foreign currency must not have any TaxSubtotal.
        company_currency = vals['company'].currency_id
        if (
            tax_total_keys['tax_subtotal_key']
            and company_currency != vals['currency']
            and tax_total_keys['tax_subtotal_key']['currency'] == company_currency
        ):
            tax_total_keys['tax_subtotal_key'] = None

        return tax_total_keys

    @dispatch_by_document
    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl
        super()._ubl_add_line_allowance_charge_nodes(vals)

        # Discount.
        self._ubl_add_line_allowance_charge_nodes_for_discount(vals)

        # Recycling contribution taxes.
        self._ubl_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(vals)

        # Excise taxes.
        self._ubl_add_line_allowance_charge_nodes_for_excise_taxes(vals)

    # -------------------------------------------------------------------------
    # EXPORT: Invoice Nodes helpers
    # -------------------------------------------------------------------------

    def _ubl_invoice_update_id_node(self, vals):
        invoice = vals['invoice']
        vals['document_node']['cbc:ID']['_text'] = invoice.name

    def _ubl_invoice_update_issue_date_node(self, vals):
        invoice = vals['invoice']
        vals['document_node']['cbc:IssueDate']['_text'] = invoice.invoice_date

    def _ubl_invoice_update_due_date_node(self, vals):
        invoice = vals['invoice']
        vals['document_node']['cbc:DueDate']['_text'] = invoice.invoice_date_due

    def _ubl_invoice_update_notes_node(self, vals):
        invoice = vals['invoice']
        notes = []

        # WithholdingTaxTotal is not allowed.
        # Instead, withholding tax amounts are reported as a PrepaidAmount.
        AccountTax = self.env['account.tax']
        base_lines = vals['base_lines']
        currency = vals['currency']

        def grouping_function(base_line, tax_data):
            if not tax_data:
                return
            tax_grouping_key = self._ubl_default_tax_category_grouping_key(base_line, tax_data, vals, currency)
            if not tax_grouping_key:
                return
            return tax_grouping_key['is_withholding']

        base_lines_aggregated_values = AccountTax._aggregate_base_lines_tax_details(base_lines, grouping_function)
        values_per_grouping_key = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_values)
        ubl_values = vals['_ubl_values']
        ubl_values['tax_withholding_amount'] = 0.0
        for grouping_key, values in values_per_grouping_key.items():
            if not grouping_key:
                continue

            tax_amount = values['tax_amount_currency']
            ubl_values['tax_withholding_amount'] -= tax_amount

        if not currency.is_zero(ubl_values['tax_withholding_amount']):
            notes.append(_(
                "The prepaid amount of %s corresponds to the withholding tax applied.",
                formatLang(self.env, ubl_values['tax_withholding_amount'], currency_obj=currency).replace(NON_BREAKING_SPACE, ''),
            ))

        terms_and_condition = html2plaintext(invoice.narration) if invoice.narration else None
        if terms_and_condition:
            notes.append(terms_and_condition)

        if notes:
            vals['document_node']['cbc:Note']['_text'] = ' '.join(notes)

    def _ubl_invoice_update_order_reference_node(self, vals):
        invoice = vals['invoice']
        order_ref_node = vals['document_node']['cac:OrderReference']

        # Purchase order reference
        # An identifier of a referenced purchase order, issued by the Buyer.
        # Suppose the following case:
        # - Buyer does a RFQ to the Seller.
        # - Seller confirms with a SO.
        # - Buyer converts the RFQ to a PO.
        # => There is no automatic tracking of this information.
        # Instead, the user can encode this information on 'Customer Reference' a.k.a the 'ref' field.
        # Since ID is required, the fallback is also fine and avoid to force the encoding of this
        # manual information.
        order_ref_node['cbc:ID']['_text'] = invoice.ref or invoice.name

        # Sales order reference
        # An identifier of a referenced sales order issued by the Seller.
        if self.module_installed('sale'):
            so_names = set(invoice.invoice_line_ids.sale_line_ids.order_id.mapped('name'))
            if so_names:
                order_ref_node['cbc:SalesOrderID']['_text'] = ",".join(so_names)

    @dispatch_by_document
    def _ubl_invoice_update_delivery_node_from_delivery_address(self, vals, node):
        invoice = vals['invoice']
        if invoice.delivery_date:
            node['cbc:ActualDeliveryDate']['_text'] = invoice.delivery_date
        return node

    def _ubl_invoice_update_delivery_nodes(self, vals):
        # [ibr-107]-Deliver to information (ibg-13) MUST occur maximum once.
        document_node = vals['document_node']
        if document_node['cac:Delivery']:
            document_node['cac:Delivery'] = document_node['cac:Delivery'][0]
        else:
            document_node['cac:Delivery'] = None

    def _ubl_invoice_update_legal_monetary_total_prepaid_payable_amount_node(self, vals, in_foreign_currency=True):
        invoice = vals['invoice']
        currency = vals['currency_id'] if in_foreign_currency else vals['company_currency']
        node = vals['legal_monetary_total_node']

        if in_foreign_currency:
            amount_total = invoice.amount_total
            amount_residual = invoice.amount_residual
        else:
            amount_total = invoice.amount_total_signed * -invoice.direction_sign
            amount_residual = invoice.amount_residual_signed * -invoice.direction_sign

        node['cbc:PayableAmount']['_text'] = FloatFmt(
            amount_residual,
            max_dp=currency.decimal_places,
        )
        node['cbc:PrepaidAmount']['_text'] = FloatFmt(
            amount_total
            - amount_residual
            # WithholdingTaxTotal is not allowed.
            # Instead, withholding tax amounts are reported as a PrepaidAmount.
            # Suppose an invoice of 1000 with a tax 21% +100 -100.
            # The super will compute a PrepaidAmount or 0.0 and a PayableAmount or 1000.
            # This extension is there to increase PrepaidAmount to 210 and PayableAmount to 1210.
            + vals['_ubl_values']['tax_withholding_amount'],
            max_dp=currency.decimal_places,
        )

    def _ubl_invoice_update_legal_monetary_total_payable_rounding_amount_node(self, vals):
        currency = vals['currency']
        node = vals['legal_monetary_total_node']
        tax_withholding_amount = vals['_ubl_values']['tax_withholding_amount']

        if not tax_withholding_amount:
            return

        # WithholdingTaxTotal is not allowed.
        # Instead, withholding tax amounts are reported as a PrepaidAmount.
        # Since the UBL layer is putting the difference between TaxInclusiveAmount and the total
        # amount of the base_lines in PayableRoundingAmount, the withholding tax amount ends there.
        # Let's remove them since they are accounted in PrepaidAmount.
        payable_rounding_amount_node = node['cbc:PayableRoundingAmount']
        payable_rounding_amount = (payable_rounding_amount_node['_text'] or 0.0) + tax_withholding_amount
        if currency.is_zero(payable_rounding_amount):
            payable_rounding_amount_node['_text'] = None
            payable_rounding_amount_node['currencyID'] = None
        else:
            payable_rounding_amount_node['_text'] = FloatFmt(payable_rounding_amount, min_dp=currency.decimal_places)
            payable_rounding_amount_node['currencyID'] = currency.name

    @dispatch_by_document
    def _ubl_invoice_update_add_payment_means_nodes(self, vals):
        invoice = vals['invoice']
        nodes = vals['document_node']['cac:PaymentMeans']

        if invoice.move_type == 'out_invoice':
            if invoice.partner_bank_id:
                payment_means_code, payment_means_name = 30, 'credit transfer'
            else:
                payment_means_code, payment_means_name = 'ZZZ', 'mutually defined'
        else:
            payment_means_code, payment_means_name = 57, 'standing agreement'

        partner_bank = invoice.partner_bank_id
        payment_means_node = {
            'cbc:PaymentMeansCode': {
                '_text': payment_means_code,
                'name': payment_means_name,
            },
            'cbc:PaymentID': {'_text': invoice.payment_reference or invoice.name},
        }

        if partner_bank:
            payment_means_node['cac:PayeeFinancialAccount'] = self._ubl_get_payment_means_payee_financial_account_node_from_partner_bank(vals, partner_bank)
        else:
            payment_means_node['cac:PayeeFinancialAccount'] = None

        nodes.append(payment_means_node)

    def _ubl_invoice_update_add_payment_terms_nodes(self, vals):
        invoice = vals['invoice']
        if node := self._ubl_get_payment_terms_node_from_payment_term(vals, invoice.invoice_payment_term_id):
            vals['document_node']['cac:PaymentTerms'].append(node)

    def _ubl_invoice_update_add_allowance_charge_nodes(self, vals):
        # Early payment discount lines are treated as allowances/charges.
        self._ubl_add_allowance_charge_nodes_early_payment_discount(vals)

    def _ubl_invoice_update_line_period_nodes(self, vals):
        base_line = vals['line_vals']['base_line']
        nodes = vals['line_node']['cac:InvoicePeriod']
        if base_line.get('deferred_start_date') or base_line.get('deferred_end_date'):
            nodes.append({
                'cbc:StartDate': {'_text': base_line['deferred_start_date']},
                'cbc:EndDate': {'_text': base_line['deferred_end_date']},
            })

    # -------------------------------------------------------------------------
    # EXPORT: Invoice helpers
    # -------------------------------------------------------------------------

    def _pint_add_values(self, vals, invoice):
        # to extend / override
        vals['_pint_values'] = {
            'doc_types': ['invoice'] if invoice.move_type == 'out_invoice' else ['credit_note'],
            'model': self.env['account.edi.ubl_pint'],
        }

    def _invoice_init_vals(self, vals, invoice):
        # == Generic business records ==
        self._ubl_add_values_company(vals, invoice.company_id)
        self._ubl_add_values_currency(vals, invoice.currency_id)
        self._ubl_add_values_customer(vals, invoice.partner_id)
        self._ubl_add_values_delivery(vals, invoice.partner_shipping_id or invoice.partner_id)

        # == PINT layer configuration ==
        self._pint_add_values(vals, invoice)

        # == Base lines ==
        vals['base_lines'], vals['tax_lines'] = invoice._get_rounded_base_and_tax_lines()

        AccountTax = self.env['account.tax']
        company = vals['company']

        # Avoid negative unit price.
        self._ubl_turn_base_lines_price_unit_as_always_positive(vals)

        # Manage taxes for emptying.
        vals['base_lines'] = self._ubl_turn_emptying_taxes_as_new_base_lines(vals['base_lines'], company, vals)

        vals['_ubl_values'] = {}
        for base_line in vals['base_lines']:
            base_line['_ubl_values'] = {}

        # Global rounding of tax_details using 6 digits.
        AccountTax._round_raw_total_excluded(vals['base_lines'], company)
        AccountTax._round_raw_total_excluded(vals['base_lines'], company, in_foreign_currency=False)
        AccountTax._add_and_round_raw_gross_total_excluded_and_discount(vals['base_lines'], company)
        AccountTax._add_and_round_raw_gross_total_excluded_and_discount(vals['base_lines'], company, in_foreign_currency=False)
        AccountTax._round_raw_gross_total_excluded_and_discount(vals['base_lines'], company)
        AccountTax._round_raw_gross_total_excluded_and_discount(vals['base_lines'], company, in_foreign_currency=False)

    def _line_nodes_filter_base_lines(self, vals, filter_function=None):
        # EXTENDS account.edi.xml.ubl
        # Early payment discount lines should not appear as lines but as allowances/charges.
        # Cash rounding lines should not appear as lines but in PayableRoundingAmount.
        def new_filter_function(base_line):
            if self._ubl_is_early_payment_base_line(base_line) or self._ubl_is_cash_rounding_base_line(base_line):
                return False
            return not filter_function or filter_function(base_line)

        return super()._line_nodes_filter_base_lines(vals, filter_function=new_filter_function)

    # -------------------------------------------------------------------------
    # EXPORT: Invoice & Credit Note layer
    # -------------------------------------------------------------------------

    @documents(['invoice', 'credit_note'])
    def _ubl_add_id_node__base(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_id_node(vals)
        self._ubl_invoice_update_id_node(vals)

    @documents(['invoice', 'credit_note'])
    def _ubl_add_issue_date_node__base(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_issue_date_node(vals)
        self._ubl_invoice_update_issue_date_node(vals)

    @documents(['invoice', 'credit_note'])
    def _ubl_add_due_date_node__base(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_due_date_node(vals)
        self._ubl_invoice_update_due_date_node(vals)

    @documents(['invoice'])
    def _ubl_add_invoice_type_code_node__invoice(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_invoice_type_code_node(vals)
        vals['document_node']['cbc:InvoiceTypeCode']['_text'] = 380

    @documents(['credit_note'])
    def _ubl_add_credit_note_type_code_node__credit_note(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_credit_note_type_code_node(vals)
        vals['document_node']['cbc:CreditNoteTypeCode']['_text'] = 381

    @documents(['invoice', 'credit_note'])
    def _ubl_add_notes_nodes__base(self, vals):
        # DECORATES account.edi.ubl_pint
        self._ubl_add_notes_nodes(vals)
        self._ubl_invoice_update_notes_node(vals)

    @documents(['invoice', 'credit_note'])
    def _ubl_add_order_reference_node__base(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_order_reference_node(vals)
        self._ubl_invoice_update_order_reference_node(vals)

    @documents(['invoice', 'credit_note'])
    def _ubl_get_delivery_node_from_delivery_address___base(self, vals):
        # DECORATES account.edi.ubl
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)
        self._ubl_invoice_update_delivery_node_from_delivery_address(vals, node)
        return node

    @documents(['invoice', 'credit_note'])
    def _ubl_add_invoice_delivery_nodes__base(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_invoice_delivery_nodes(vals)
        self._ubl_invoice_update_delivery_nodes(vals)

    @documents(['credit_note'])
    def _ubl_add_billing_reference_nodes__credit_note(self, vals):
        # DECORATES account.edi.ubl
        # A group of business terms providing information on one or more preceding Invoices.
        # [ibr-055]-Each Preceding Invoice reference (ibg-03) MUST contain a Preceding Invoice reference (ibt-025).
        # [ibr-sr-06]-Preceding invoice reference (ibt-025) MUST occur maximum once
        super()._ubl_add_billing_reference_nodes(vals)

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

    @documents(['invoice', 'credit_note'])
    def _ubl_add_payment_means_nodes__base(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_payment_means_nodes(vals)
        self._ubl_invoice_update_add_payment_means_nodes(vals)

    @documents(['invoice', 'credit_note'])
    def _ubl_add_payment_terms_nodes__invoice(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_payment_terms_nodes(vals)
        self._ubl_invoice_update_add_payment_terms_nodes(vals)

    @documents(['invoice', 'credit_note'])
    def _ubl_add_allowance_charge_nodes__base(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_allowance_charge_nodes(vals)
        self._ubl_invoice_update_add_allowance_charge_nodes(vals)

    @documents(['invoice', 'credit_note'])
    def _ubl_add_legal_monetary_total_payable_rounding_amount_node__base(self, vals):
        # DECORATES account.edi.ubl
        super()._ubl_add_legal_monetary_total_payable_rounding_amount_node(vals)
        self._ubl_invoice_update_legal_monetary_total_payable_rounding_amount_node(vals)

    @documents(['invoice', 'credit_note'])
    def _ubl_add_legal_monetary_total_prepaid_payable_amount_node__base(self, vals, in_foreign_currency=True):
        # DECORATES account.edi.ubl
        super()._ubl_add_legal_monetary_total_prepaid_payable_amount_node(vals, in_foreign_currency=in_foreign_currency)
        self._ubl_invoice_update_legal_monetary_total_prepaid_payable_amount_node(vals, in_foreign_currency=in_foreign_currency)
