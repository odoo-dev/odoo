from odoo import _, models
from odoo.tools import formatLang, html2plaintext, NON_BREAKING_SPACE

from odoo.addons.account_edi_ubl_cii.models.account_edi_common import (
    FloatFmt,
    EAS_MAPPING,
    EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES,
)


class AccountEdiUBLPint(models.AbstractModel):
    _name = "account.edi.ubl_pint"
    _inherit = 'account.edi.ubl'
    _description = "UBL PINT"

    # -------------------------------------------------------------------------
    # EXPORT: NODES
    # -------------------------------------------------------------------------

    def _ubl_add_notes_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl
        # [ibr-sr-51]-Note (ibt-022) MUST occur maximum once
        super()._ubl_add_notes_nodes(vals)
        vals['document_node']['cbc:Note'] = {'_text': None}

    def _ubl_add_document_currency_code_node(self, vals):
        # EXTENDS account.edi.xml.ubl
        # The currency in which the invoice is issued and in which all monetary amounts are expressed.
        # [ibr-005]-An Invoice MUST have an Invoice currency code (ibt-005).
        # [ibr-cl-04]-Invoice currency code (ibt-005) MUST be coded using ISO code list 4217 alpha-3
        super()._ubl_add_document_currency_code_node(vals)
        vals['document_node']['cbc:DocumentCurrencyCode']['_text'] = vals['currency'].name

    def _ubl_add_tax_currency_code_node(self, vals):
        # EXTENDS account.edi.xml.ubl
        # The currency used for TAX accounting and reporting purposes as accepted or required in the country of the Seller.
        # [ibr-077]-Tax accounting currency code (ibt-006) MUST be different from invoice currency code (ibt-005) when provided.
        # [ibr-cl-05]-Tax currency code (ibt-006) MUST be coded using ISO code list 4217 alpha-3
        super()._ubl_add_tax_currency_code_node(vals)
        company_currency = vals['company'].currency_id
        if vals['document_node']['cbc:DocumentCurrencyCode']['_text'] != company_currency.name:
            vals['document_node']['cbc:TaxCurrencyCode']['_text'] = company_currency.name

    def _ubl_add_buyer_reference_node(self, vals):
        # EXTENDS account.edi.xml.ubl
        super()._ubl_add_buyer_reference_node(vals)

        customer = vals['customer']
        if customer_ref := customer.commercial_partner_id.ref:
            vals['document_node']['cbc:BuyerReference']['_text'] = customer_ref

    def _ubl_get_partner_address_node(self, vals, partner):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_partner_address_node(vals, partner)
        node['cbc:CountrySubentityCode'] = None
        node['cac:Country']['cbc:Name'] = None
        return node

    def _ubl_add_party_endpoint_id_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_endpoint_id_node(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        if commercial_partner.peppol_endpoint and commercial_partner.peppol_eas:
            vals['party_node']['cbc:EndpointID']['_text'] = commercial_partner.peppol_endpoint
            vals['party_node']['cbc:EndpointID']['schemeID'] = commercial_partner.peppol_eas

    def _ubl_add_party_identification_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_identification_nodes(vals)
        nodes = vals['party_node']['cac:PartyIdentification']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        if commercial_partner.country_code == 'BE' and commercial_partner.company_registry:
            nodes.append({
                'cbc:ID': {
                    '_text': commercial_partner.company_registry,
                    'schemeID': '0208',
                },
            })
        elif commercial_partner.ref:
            nodes.append({
                'cbc:ID': {
                    '_text': commercial_partner.ref,
                    'schemeID': None,
                },
            })

    def _pint_get_party_tax_scheme_tin_node(self, vals):
        """ The tax identifier number (TIN).

        :param vals:        Some custom data.
        """
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        country_code = commercial_partner.country_code
        if not country_code:
            return

        # Get the VAT from the 'vat' field.
        vat = commercial_partner.vat.upper() if commercial_partner.vat and commercial_partner.vat != '/' else None

        # Get the VAT from the 'peppol_endpoint' field.
        if not vat and commercial_partner.peppol_eas and commercial_partner.peppol_endpoint:
            for eas_code, partner_field in EAS_MAPPING.get(country_code, {}).items():
                if partner_field == 'vat' and commercial_partner.peppol_eas == eas_code:
                    vat = commercial_partner.peppol_endpoint.upper()
                    if not vat.startswith(country_code):
                        vat = f'{country_code}{vat}'

        if country_code != 'RO':
            for tin_family, country_codes in (
                (
                    'GST',
                    {
                        'AU', 'NZ', 'IN', 'SG', 'MY', 'PK', 'BD', 'LK', 'NP', 'BT', 'PG', 'SA', 'AG', 'BS', 'BB', 'DM', 'GD', 'JM',
                        'KN', 'LC', 'VC', 'TT',
                    },
                ),
                (
                    'VAT',
                    {
                        # EU VAT countries
                        'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
                        'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
                        # Non-EU VAT countries
                        'AL', 'AD', 'AM', 'AZ', 'BA', 'BY', 'GE', 'IS', 'MD', 'ME', 'MK', 'NO', 'RS', 'TR', 'UA', 'GB',
                    },
                ),
                (
                    'TIN',
                    {
                        'DZ', 'AO', 'BJ', 'BF', 'BI', 'CM', 'CV', 'CF', 'CG', 'CI', 'DJ', 'EG', 'ET', 'GA', 'GN', 'KE', 'MG', 'ML', 'MR', 'MA', 'MU', 'NE', 'RW', 'SN', 'TD', 'TG', 'TN', 'UG', 'BH', 'IL', 'JO', 'LB', 'OM', 'PS', 'QA', 'YE', 'CN', 'ID', 'JP', 'KH', 'KR', 'LA', 'MN', 'PH', 'TH', 'VN',
                    },
                ),
            ):
                if country_code in country_codes:
                    # [BR-CO-09]-The Seller VAT identifier (BT-31), the Seller tax representative VAT identifier (BT-63)
                    # and the Buyer VAT identifier (BT-48) shall have a prefix in accordance with ISO code ISO 3166-1 alpha-2
                    # by which the country of issue may be identified. Nevertheless, Greece may use the prefix ‘EL’.
                    if country_code == 'GR':
                        if not vat.startswith('EL'):
                            vat = f'EL{vat}'
                    else:
                        if not vat.startswith(country_code):
                            vat = f'{country_code}{vat}'

                    return {
                        'cbc:CompanyID': {'_text': vat},
                        'cac:TaxScheme': {
                            'cbc:ID': {'_text': tin_family},
                        },
                    }

        if country_code == 'RO':
            # Every company has a CIF in Romania.
            # Only VAT-registered companies have a VAT number.
            # The VAT number is simply the CIF activated for VAT purposes.
            # To distinguish both, we just check if the number starts with RO or not.
            # TODO: check why we need 'company_registry' here...
            if not vat and commercial_partner.company_registry:
                vat = commercial_partner.company_registry.upper()
            if vat:
                if vat.startswith('RO'):
                    return {
                        'cbc:CompanyID': {'_text': vat},
                        'cac:TaxScheme': {
                            'cbc:ID': {'_text': 'VAT'},
                        },
                    }
                else:
                    return {
                        'cbc:CompanyID': {'_text': vat},
                        'cac:TaxScheme': {
                            'cbc:ID': {'_text': 'CIF'},
                        },
                    }

    def _pint_get_party_tax_scheme_local_node(self, vals):
        """ The local tax registration identification to state his registered tax status.

        :param vals:        Some custom data.
        """
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        if (
            commercial_partner.country_code == 'MY'
            and 'sst_registration_number' in commercial_partner._fields
            and commercial_partner.sst_registration_number
        ):
            return {
                'cbc:CompanyID': {'_text': commercial_partner.sst_registration_number},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'SST'},
                },
            }

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
                    '_text': commercial_partner.company_registry,
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

    def _ubl_add_accounting_supplier_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_accounting_supplier_party_tax_scheme_nodes(vals)
        nodes = vals['party_node']['cac:PartyTaxScheme']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        country_code = commercial_partner.country_code

        if country_code == 'RO':
            vat = commercial_partner.vat if commercial_partner.vat and commercial_partner.vat != '/' else None
            if not vat:
                vat = commercial_partner.company_registry
            if not vat:
                return
            if vat.startswith('RO'):
                nodes.append({
                    'cbc:CompanyID': {'_text': vat},
                    'cac:TaxScheme': {
                        'cbc:ID': {'_text': 'VAT'},
                    },
                })
            else:
                nodes.append({
                    'cbc:CompanyID': {'_text': vat},
                    'cac:TaxScheme': {
                        'cbc:ID': {'_text': 'CIF'},
                    },
                })
            return

        # Seller TAX identifier
        # The Seller’s TAX identifier (also known as Seller TAX identification number).
        if node := self._pint_get_party_tax_scheme_tin_node(vals):
            nodes.append(node)

        # Seller TAX registration identifier
        # The local identification (defined by the Seller’s address) of the Seller for tax purposes
        # or a reference that enables the Seller to state his registered tax status.
        if node := self._pint_get_party_tax_scheme_local_node(vals):
            nodes.append(node)

        # NO-R-002
        # For Norwegian suppliers, most invoice issuers are required to append "Foretaksregisteret" to their invoice.
        if country_code == 'NO':
            nodes.append({
                'cbc:CompanyID': {'_text': "Foretaksregisteret"},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': "TAX"},
                },
            })

    def _ubl_add_accounting_customer_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_accounting_customer_party_tax_scheme_nodes(vals)
        nodes = vals['party_node']['cac:PartyTaxScheme']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        country_code = commercial_partner.country_code

        # Buyer TAX identifier
        # The Buyer’s TAX identifier (also known as Buyer TAX identification number).
        node = self._pint_get_party_tax_scheme_local_node(vals) or self._pint_get_party_tax_scheme_tin_node(vals)
        if node:
            nodes.append(node)

    def _ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(self, vals, partner_bank):
        # EXTENDS account.edi.xml.ubl
        node = super()._ubl_get_payment_means_payee_financial_account_institution_branch_node_from_partner_bank(vals, partner_bank)
        if node:
            node['cbc:ID']['schemeID'] = None
            node['cac:FinancialInstitution'] = None
        return node

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

    def _ubl_tax_totals_node_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.xml.ubl
        tax_total_keys = super()._ubl_tax_totals_node_grouping_key(base_line, tax_data, vals, currency)

        # WithholdingTaxTotal is not allowed.
        # Instead, withholding tax amounts are reported as a PrepaidAmount.
        if tax_total_keys['tax_total_key'] and tax_total_keys['tax_total_key']['is_withholding']:
            tax_total_keys['tax_total_key'] = None

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

    def _ubl_invoice_update_delivery_node_from_delivery_address(self, vals, node):
        invoice = vals['invoice']
        if invoice.delivery_date:
            node['cbc:ActualDeliveryDate']['_text'] = invoice.delivery_date

        # TODO PINT-EU
        # Intracom delivery inside European area.
        customer = vals['customer']
        supplier = vals['supplier']
        if (
            customer.country_id.code in EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES
            and supplier.country_id.code in EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES
            and supplier.country_id != customer.country_id
        ):
            node['cbc:ActualDeliveryDate']['_text'] = invoice.invoice_date
        return node

    def _ubl_invoice_update_delivery_nodes(self, vals):
        # [ibr-107]-Deliver to information (ibg-13) MUST occur maximum once.
        document_node = vals['document_node']
        if document_node['cac:Delivery']:
            document_node['cac:Delivery'] = document_node['cac:Delivery'][0]
        else:
            document_node['cac:Delivery'] = None

    def _ubl_invoice_update_legal_monetary_total_payable_rounding_amount_node(self, vals):
        # Cash rounding lines should not appear as lines but in PayableRoundingAmount.
        # That part is called only for invoices since it's the single business object having the
        # cash rounding being there as extra base_lines.
        self._ubl_add_legal_monetary_total_payable_rounding_amount_node_from_cash_rounding(vals)

    def _ubl_invoice_update_legal_monetary_total_prepaid_payable_amount_node(self, vals):
        invoice = vals['invoice']
        currency = vals['currency']
        node = vals['legal_monetary_total_node']
        node['cbc:PayableAmount']['_text'] = FloatFmt(
            invoice.amount_residual,
            min_dp=currency.decimal_places,
        )
        node['cbc:PrepaidAmount']['_text'] = FloatFmt(
            invoice.amount_total
            - invoice.amount_residual
            # WithholdingTaxTotal is not allowed.
            # Instead, withholding tax amounts are reported as a PrepaidAmount.
            # Suppose an invoice of 1000 with a tax 21% +100 -100.
            # The super will compute a PrepaidAmount or 0.0 and a PayableAmount or 1000.
            # This extension is there to increase PrepaidAmount to 210 and PayableAmount to 1210.
            + vals['_ubl_values']['tax_withholding_amount'],
            min_dp=currency.decimal_places,
        )

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

        # TODO PINT-EU:
        # in Denmark payment code 30 is not allowed. we hardcode it to 1 ("unknown") for now
        # as we cannot deduce this information from the invoice
        customer = vals['customer'].commercial_partner_id
        if customer.country_code == 'DK':
            payment_means_code, payment_means_name = 1, 'unknown'

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

    def _invoice_init_vals(self, vals, invoice):
        # == Generic business records ==
        self._ubl_add_values_company(vals, invoice.company_id)
        self._ubl_add_values_currency(vals, invoice.currency_id)
        self._ubl_add_values_customer(vals, invoice.partner_id)
        self._ubl_add_values_delivery(vals, invoice.partner_shipping_id or invoice.partner_id)

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
