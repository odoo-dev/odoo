import functools
import re
from types import SimpleNamespace

from odoo import models
from odoo.tools import float_compare, float_round, float_is_zero, html2plaintext
from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt

JO_MAX_DP = 9


class HashableNamespace(SimpleNamespace):
    """ We need to use a hashable namespace to be able to use it as a key in a dictionary.
    This is because the `SimpleNamespace` class is not hashable by default.
    """
    def __hash__(self):
        return hash(self.name)


class AccountEdiXmlUBL21JO(models.AbstractModel):
    """ JoFotara: the e-invoicing system of the Jordanian Income and Sales Tax Department (ISTD).

    JoFotara documents are UBL 2.1 Invoices (credit notes are also sent as <Invoice>, with InvoiceTypeCode 381)
    declaring ProfileID 'reporting:1.0' and no CustomizationID. The format is a national customization that does not
    claim conformance to EN 16931 (no BT/BR rules, amounts reported with up to 9 decimals and currencyID="JO",
    a single document level AllowanceCharge recapping the line discounts, ...), so it only inherits the UBL syntax
    (account.edi.ubl).

    Specification: https://www.istd.gov.jo/EN/List/JoFotara (JoFotara integration guide, "Electronic Invoice UBL 2.1").
    """
    _name = 'account.edi.xml.ubl_21.jo'
    _inherit = ['account.edi.ubl']
    _description = 'UBL 2.1 (JoFotara)'

    # -------------------------------------------------------------------------
    # EXPORT: Values
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_ubl_21.xml"

    def _export_get_document_type(self, invoice):
        # EXTENDS account.edi.common
        # Only use Invoice in JO, even for credit and debit notes.
        return 'invoice'

    def _export_get_parties(self, vals):
        # EXTENDS account.edi.common
        supplier, customer, delivery = super()._export_get_parties(vals)
        return supplier.commercial_partner_id, customer, delivery

    def _l10n_jo_get_currency_9_dp(self):
        # We cannot use a new `res.currency` record to round to 9 decimals, because the
        # `res.currency.rounding` field definition prevents rounding to more than 6 decimal places.
        return HashableNamespace(
            name='JO',  # Every amount will be reported with currencyID="JO"
            round=functools.partial(float_round, precision_digits=JO_MAX_DP),
            is_zero=functools.partial(float_is_zero, precision_digits=JO_MAX_DP),
            rounding=10**-JO_MAX_DP,
            decimal_places=JO_MAX_DP,
        )

    def _l10n_jo_get_base_lines(self, invoice, currency_9_dp):
        """ Compute the base lines of the invoice. In Jordan, because the web-service has absolutely no tolerance,
        what we do is: use round per line with 9 decimals (yes!)
        """
        base_amls, epd_amls, cash_rounding_amls, _other_amls = invoice.line_ids.partitioned(
            lambda line: line.display_type == 'product',
            lambda line: line.display_type == 'epd',
            lambda line: line.display_type == 'rounding' and not line.tax_repartition_line_id,
        )
        base_lines = [invoice._prepare_product_base_line_for_taxes_computation(line) for line in base_amls]
        base_lines += [invoice._prepare_epd_base_line_for_taxes_computation(line) for line in epd_amls]
        base_lines += [invoice._prepare_cash_rounding_base_line_for_taxes_computation(line) for line in cash_rounding_amls]

        AccountTax = self.env['account.tax']
        for base_line in base_lines:
            base_line['currency_id'] = currency_9_dp
            AccountTax._add_tax_details_in_base_line(base_line, base_line['record'].company_id, 'round_per_line')

        # Round to 9 decimals
        AccountTax._round_base_lines_tax_details(base_lines, company=invoice.company_id)

        # raw_total_* values need to calculated with `round_globally` because these values should not be rounded per line
        # However, taxes need to be calculated with `round_per_line` so that _round_base_lines_tax_details does not
        # end up generating lines taxes using unrounded base amounts
        new_base_lines = [base_line.copy() for base_line in base_lines]
        for base_line, new_base_line in zip(base_lines, new_base_lines):
            AccountTax._add_tax_details_in_base_line(new_base_line, new_base_line['record'].company_id, 'round_globally')
            for key in [
                'raw_total_excluded_currency',
                'raw_total_excluded',
                'raw_total_included_currency',
                'raw_total_included',
            ]:
                base_line['tax_details'][key] = new_base_line['tax_details'][key]
        return base_lines

    def _l10n_jo_get_base_lines_edi_ids(self, vals):
        """ Map the index of the lines of a credit note to the index of the matching lines of the reversed invoice. """
        base_lines_edi_ids = {}
        invoice = vals['invoice']
        if invoice.reversed_entry_id:
            DecimalPrecision = self.env['decimal.precision']
            invoice_base_lines = self._l10n_jo_get_base_lines(invoice.reversed_entry_id, vals['jo_currency'])
            invoice_edi_id_x_base_line = dict(enumerate(invoice_base_lines, 1))
            overflow_edi_id = len(invoice_edi_id_x_base_line) + 1

            refund_base_lines = filter(lambda l: not self._is_early_payment_base_line(l), vals['base_lines'])
            for line_idx, refund_base_line in enumerate(refund_base_lines, 1):
                matching_edi_ids = [
                    line_id for line_id, base_line in invoice_edi_id_x_base_line.items()
                    if base_line['product_id'] == refund_base_line['product_id']
                    and float_compare(base_line['price_unit'], refund_base_line['price_unit'], precision_digits=DecimalPrecision.precision_get('Product Price')) == 0
                    and float_compare(base_line['discount'], refund_base_line['discount'], precision_digits=DecimalPrecision.precision_get('Discount')) == 0
                    and float_compare(base_line['quantity'], refund_base_line['quantity'], precision_digits=DecimalPrecision.precision_get('Product Unit')) >= 0
                ]

                if matching_edi_ids:
                    edi_id = min(matching_edi_ids, key=lambda line_id: invoice_edi_id_x_base_line[line_id]['quantity'])
                    base_lines_edi_ids[line_idx] = edi_id
                    invoice_edi_id_x_base_line.pop(edi_id)
                else:
                    base_lines_edi_ids[line_idx] = overflow_edi_id
                    overflow_edi_id += 1
        return base_lines_edi_ids

    def _ubl_prepare_base_lines(self, vals):
        # EXTENDS account.edi.ubl
        # Replace the base lines by the ones computed with 9 decimals.
        vals['jo_currency'] = self._l10n_jo_get_currency_9_dp()
        vals['base_lines'] = self._l10n_jo_get_base_lines(vals['invoice'], vals['jo_currency'])
        vals['base_lines_edi_ids'] = self._l10n_jo_get_base_lines_edi_ids(vals)
        # The cash rounding is not reported.
        vals['base_lines'] = [base_line for base_line in vals['base_lines'] if not self._is_cash_rounding_base_line(base_line)]

    def _round_base_lines_tax_details(self, vals, in_company_currency=True):
        # EXTENDS account.edi.common
        # The JO base lines are already rounded with 9 decimals, see '_l10n_jo_get_base_lines'.
        return

    def _get_exported_invoice_base_lines(self, vals):
        # EXTENDS account.edi.common
        return [base_line for base_line in vals['base_lines'] if not self._is_early_payment_base_line(base_line)]

    # -------------------------------------------------------------------------
    # EXPORT: Helpers
    # -------------------------------------------------------------------------

    def format_float(self, amount, precision_digits=3):
        # Force all floats to be formatted with at least 3 decimals and at most 9 decimals
        return FloatFmt(amount, 3, max_dp=JO_MAX_DP)

    def _get_tax_category_code(self, customer, supplier, tax):
        if tax and tax._l10n_jo_is_exempt_tax():
            return "Z"
        if tax and tax.amount:
            return "S"
        return "O"

    def _sanitize_phone(self, raw):
        return re.sub(r'[^0-9]', '', raw or '')[:15]

    def _l10n_jo_tax_grouping_key(self, base_line, tax_data, vals):
        """ Group the taxes by tax category (TaxTotal/TaxSubtotal/TaxCategory). """
        customer = vals['customer'].commercial_partner_id
        supplier = vals['supplier']
        tax = tax_data and tax_data['tax']
        return {
            'tax_category_code': self._get_tax_category_code(customer, supplier, tax),
            **self._get_tax_exemption_reason(customer, supplier, tax),
            'amount': tax.amount if tax and not tax.has_negative_factor else 0.0,
            'amount_type': tax.amount_type if tax else 'percent',
        }

    def _l10n_jo_get_line_amounts(self, vals, base_line):
        """ In JO, because of the precision requirements, we first compute an exact
        gross unit price, rounded to 9 decimals, and then use it to compute the discount amounts.
        """
        currency_9_dp = vals['jo_currency']

        discount_factor = 1 - (base_line['discount'] / 100.0)
        if discount_factor != 0.0:
            gross_subtotal_currency = base_line['tax_details']['raw_total_excluded_currency'] / discount_factor
        else:
            gross_subtotal_currency = base_line['currency_id'].round(base_line['price_unit'] * base_line['quantity'])

        # Start by getting a gross unit price rounded to 9 decimals
        gross_price_unit_currency = currency_9_dp.round(gross_subtotal_currency / base_line['quantity']) if base_line['quantity'] else 0.0

        # Then compute the gross subtotal from the rounded unit price
        gross_subtotal_currency = currency_9_dp.round(gross_price_unit_currency * base_line['quantity'])

        return {
            'gross_price_unit_currency': gross_price_unit_currency,
            'gross_subtotal_currency': gross_subtotal_currency,
            # Then compute the discount from the gross subtotal
            'discount_amount_currency': gross_subtotal_currency - base_line['tax_details']['total_excluded_currency'],
        }

    def _l10n_jo_get_amount_node(self, vals, amount):
        return {
            '_text': self.format_float(amount, JO_MAX_DP),
            'currencyID': vals['jo_currency'].name,
        }

    def _get_tax_category_node(self, vals, grouping_key):
        return {
            'cbc:ID': {
                '_text': grouping_key['tax_category_code'],
                'schemeID': 'UN/ECE 5305',
                'schemeAgencyID': '6',
            },
            'cbc:Percent': {'_text': grouping_key['amount']} if grouping_key['amount_type'] == 'percent' else None,
            'cac:TaxScheme': {
                'cbc:ID': {
                    '_text': 'VAT' if grouping_key['amount_type'] == 'percent' else 'OTH',
                    'schemeID': 'UN/ECE 5153',
                    'schemeAgencyID': '6',
                }
            }
        }

    # -------------------------------------------------------------------------
    # EXPORT: Document header nodes
    # -------------------------------------------------------------------------

    def _ubl_add_version_id_node(self, vals):
        # JoFotara documents don't report the UBLVersionID.
        vals['document_node']['cbc:UBLVersionID'] = {'_text': None}

    def _ubl_add_profile_id_node(self, vals):
        vals['document_node']['cbc:ProfileID'] = {'_text': 'reporting:1.0'}

    def _ubl_add_id_node(self, vals):
        vals['document_node']['cbc:ID'] = {'_text': vals['invoice'].name.replace('/', '_')}

    def _l10n_jo_add_uuid_node(self, vals):
        invoice = vals['invoice']
        invoice._compute_l10n_jo_edi_uuid()
        vals['document_node']['cbc:UUID'] = {'_text': invoice.l10n_jo_edi_uuid}

    def _ubl_add_due_date_node(self, vals):
        vals['document_node']['cbc:DueDate'] = {'_text': None}

    def _ubl_add_invoice_type_code_node(self, vals):
        invoice = vals['invoice']
        vals['document_node']['cbc:InvoiceTypeCode'] = {
            '_text': "381" if invoice.move_type == 'out_refund' else "388",
            'name': invoice._get_invoice_scope_code() + invoice._get_invoice_payment_method_code() + invoice._get_invoice_tax_payer_type_code(),
        }

    def _ubl_add_notes_nodes(self, vals):
        invoice = vals['invoice']
        vals['document_node']['cbc:Note'] = [{'_text': html2plaintext(invoice.narration) if invoice.narration else None}]

    def _ubl_add_document_currency_code_node(self, vals):
        self._ubl_add_document_currency_code_node_foreign_currency(vals)

    def _ubl_add_tax_currency_code_node(self, vals):
        # The amounts are reported in the invoice currency.
        vals['document_node']['cbc:TaxCurrencyCode'] = {'_text': vals['currency'].name}

    def _ubl_add_order_reference_node(self, vals):
        vals['document_node']['cac:OrderReference'] = None

    def _ubl_add_billing_reference_nodes(self, vals):
        nodes = vals['document_node']['cac:BillingReference'] = []
        reversed_invoice = vals['invoice'].reversed_entry_id
        if reversed_invoice:
            nodes.append({
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {'_text': (reversed_invoice.name or '').replace('/', '_')},
                    'cbc:UUID': {'_text': reversed_invoice.l10n_jo_edi_uuid},
                    'cbc:DocumentDescription': {
                        '_text': self.format_float(abs(reversed_invoice.amount_total), JO_MAX_DP),
                    },
                },
            })

    def _l10n_jo_add_additional_document_reference_nodes(self, vals):
        vals['document_node']['cac:AdditionalDocumentReference'] = [{
            'cbc:ID': {'_text': 'ICV'},
            'cbc:UUID': {'_text': vals['invoice'].id},
        }]

    # -------------------------------------------------------------------------
    # EXPORT: Party nodes
    # -------------------------------------------------------------------------

    def _ubl_get_partner_address_node(self, vals, partner):
        return {
            'cbc:PostalZone': {'_text': partner.zip},
            'cbc:CountrySubentityCode': {'_text': partner.state_id.code},
            'cac:Country': {
                'cbc:IdentificationCode': {'_text': partner.country_id.code}
            }
        }

    def _ubl_add_party_endpoint_id_node(self, vals):
        vals['party_node']['cbc:EndpointID'] = None

    def _ubl_add_party_name_node(self, vals):
        vals['party_node']['cac:PartyName'] = None

    def _ubl_add_accounting_customer_party_identification_nodes(self, vals):
        partner = vals['party_vals']['partner']
        vals['party_node']['cac:PartyIdentification'] = [{
            'cbc:ID': {
                '_text': partner.vat if partner.vat and partner.vat != '/' else '',
                'schemeID': 'TN' if partner.country_code == 'JO' else 'PN',
            },
        }]

    def _ubl_add_party_tax_scheme_nodes(self, vals):
        partner = vals['party_vals']['partner']
        vals['party_node']['cac:PartyTaxScheme'] = [{
            'cbc:CompanyID': {'_text': partner.vat},
            'cac:TaxScheme': {
                'cbc:ID': {'_text': 'VAT'},
            },
        }]

    def _ubl_add_party_legal_entity_nodes(self, vals):
        partner = vals['party_vals']['partner']
        vals['party_node']['cac:PartyLegalEntity'] = [{
            'cbc:RegistrationName': {'_text': partner.name},
        }]

    def _ubl_add_party_contact_node(self, vals):
        vals['party_node']['cac:Contact'] = None

    def _l10n_jo_get_customer_phone(self, vals):
        return vals['invoice'].partner_id.phone

    def _ubl_add_accounting_customer_party_node(self, vals):
        super()._ubl_add_accounting_customer_party_node(vals)
        vals['document_node']['cac:AccountingCustomerParty']['cac:AccountingContact'] = {
            'cbc:Telephone': {
                '_text': self._sanitize_phone(self._l10n_jo_get_customer_phone(vals)),
            },
        }

    def _ubl_add_seller_supplier_party_node(self, vals):
        vals['document_node']['cac:SellerSupplierParty'] = {
            'cac:Party': {
                'cac:PartyIdentification': {
                    'cbc:ID': {
                        '_text': vals['company'].l10n_jo_edi_sequence_income_source,
                    },
                },
            },
        }

    def _ubl_add_delivery_nodes(self, vals):
        vals['document_node']['cac:Delivery'] = []

    def _ubl_add_payment_means_nodes(self, vals):
        nodes = vals['document_node']['cac:PaymentMeans'] = []
        invoice = vals['invoice']
        if invoice.move_type == 'out_refund':
            nodes.append({
                'cbc:PaymentMeansCode': {
                    '_text': 10,
                    'listID': "UN/ECE 4461",
                },
                'cbc:InstructionNote': {
                    '_text': (invoice.ref or '').replace('/', '_'),
                },
            })

    def _ubl_add_payment_terms_nodes(self, vals):
        nodes = vals['document_node']['cac:PaymentTerms'] = []
        payment_term = vals['invoice'].invoice_payment_term_id
        if payment_term:
            nodes.append({'cbc:Note': {'_text': html2plaintext(payment_term.note)}})

    # -------------------------------------------------------------------------
    # EXPORT: Document amount nodes
    # -------------------------------------------------------------------------

    def _ubl_add_allowance_charge_nodes(self, vals):
        # In JoFotara, there is only one document-level AllowanceCharge, which is a *recap* of the line discounts.
        discount_amount = sum(
            self._l10n_jo_get_line_amounts(vals, base_line)['discount_amount_currency']
            for base_line in vals['base_lines']
        )
        vals['document_node']['cac:AllowanceCharge'] = [{
            'cbc:ChargeIndicator': {'_text': 'false'},
            'cbc:AllowanceChargeReason': {'_text': 'discount'},
            'cbc:Amount': self._l10n_jo_get_amount_node(vals, discount_amount),
        }]

    def _ubl_add_tax_totals_nodes(self, vals):
        document_node = vals['document_node']
        document_node['cac:TaxTotal'] = []
        document_node['cac:WithholdingTaxTotal'] = []

        # Tax unregistered companies should have no tax values
        if vals['company'].l10n_jo_edi_taxpayer_type == 'income':
            return

        # In the document-level tax total, we only report general (not special) taxes
        def tax_grouping_function(base_line, tax_data):
            if tax_data and tax_data['tax'].amount_type == 'fixed':
                return None
            return self._l10n_jo_tax_grouping_key(base_line, tax_data, vals)

        AccountTax = self.env['account.tax']
        base_lines_aggregated_tax_details = AccountTax._aggregate_base_lines_tax_details(vals['base_lines'], tax_grouping_function)
        aggregated_tax_details = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_tax_details)
        document_node['cac:TaxTotal'].append({
            'cbc:TaxAmount': self._l10n_jo_get_amount_node(vals, sum(
                values['tax_amount_currency']
                for grouping_key, values in aggregated_tax_details.items()
                if grouping_key
            )),
            # Only credit notes should have tax subtotals
            'cac:TaxSubtotal': [
                {
                    'cbc:TaxableAmount': self._l10n_jo_get_amount_node(vals, values['base_amount_currency']),
                    'cbc:TaxAmount': self._l10n_jo_get_amount_node(vals, values['tax_amount_currency']),
                    'cac:TaxCategory': self._get_tax_category_node(vals, grouping_key),
                }
                for grouping_key, values in aggregated_tax_details.items()
                if grouping_key
            ] if vals['invoice']._is_sales_refund() else None,
        })

    def _ubl_add_legal_monetary_total_node(self, vals):
        invoice = vals['invoice']
        allowance_total_amount = 0.0
        tax_exclusive_amount = 0.0
        for base_line in vals['base_lines']:
            line_amounts = self._l10n_jo_get_line_amounts(vals, base_line)
            # The document-level AllowanceTotalAmount is an aggregation of the lines' discounts.
            allowance_total_amount += line_amounts['discount_amount_currency']
            # The tax exclusive amount is the sum of the lines' gross amounts (before discount)
            tax_exclusive_amount += line_amounts['gross_subtotal_currency']

        tax_inclusive_amount = tax_exclusive_amount - allowance_total_amount

        AccountTax = self.env['account.tax']
        base_lines_aggregated_tax_details = AccountTax._aggregate_base_lines_tax_details(vals['base_lines'], lambda base_line, tax_data: True)
        aggregated_tax_details = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_tax_details)
        for grouping_key, tax_details in aggregated_tax_details.items():
            if grouping_key:
                tax_inclusive_amount += tax_details['tax_amount_currency']

        vals['document_node']['cac:LegalMonetaryTotal'] = {
            'cbc:TaxExclusiveAmount': self._l10n_jo_get_amount_node(vals, tax_exclusive_amount),
            'cbc:TaxInclusiveAmount': self._l10n_jo_get_amount_node(vals, tax_inclusive_amount),
            'cbc:AllowanceTotalAmount': self._l10n_jo_get_amount_node(vals, allowance_total_amount),
            'cbc:PrepaidAmount': self._l10n_jo_get_amount_node(vals, 0.0) if invoice._is_sales_refund() else None,
            'cbc:PayableAmount': self._l10n_jo_get_amount_node(vals, tax_inclusive_amount),
        }

    # -------------------------------------------------------------------------
    # EXPORT: Line nodes
    # -------------------------------------------------------------------------

    def _ubl_add_line_id_node(self, vals):
        index = vals['line_vals']['index']
        vals['line_node']['cbc:ID'] = {'_text': vals['base_lines_edi_ids'].get(index, index)}

    def _ubl_add_line_invoiced_quantity_node(self, vals):
        vals['line_node']['cbc:InvoicedQuantity'] = {
            '_text': vals['line_vals']['base_line']['quantity'],
            'unitCode': 'PCE',
        }

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # The line-level AllowanceCharge is added to the Price node
        vals['line_node']['cac:AllowanceCharge'] = []

    def _ubl_add_line_extension_amount_node(self, vals):
        tax_details = vals['line_vals']['base_line']['tax_details']
        vals['line_node']['cbc:LineExtensionAmount'] = self._l10n_jo_get_amount_node(
            vals,
            tax_details['total_excluded_currency'] + tax_details['delta_total_excluded_currency'],
        )

    def _ubl_add_line_tax_totals_nodes(self, vals):
        nodes = vals['line_node']['cac:TaxTotal'] = []
        base_line = vals['line_vals']['base_line']

        # Tax unregistered companies should have no tax values
        if vals['company'].l10n_jo_edi_taxpayer_type == 'income':
            return

        aggregated_tax_details = self.env['account.tax']._aggregate_base_line_tax_details(
            base_line,
            lambda base_line, tax_data: self._l10n_jo_tax_grouping_key(base_line, tax_data, vals),
        )

        total_tax_amount_percent = sum(
            values['tax_amount_currency']
            for grouping_key, values in aggregated_tax_details.items()
            if grouping_key and grouping_key['amount_type'] == 'percent'
        )

        nodes.append({
            # This contains the total amount of general (percent) taxes
            'cbc:TaxAmount': self._l10n_jo_get_amount_node(vals, total_tax_amount_percent),
            'cbc:RoundingAmount': self._l10n_jo_get_amount_node(vals, base_line['tax_details']['total_included_currency']),
            'cac:TaxSubtotal': [
                {
                    # Always report the line's tax-excluded total as base amount, even if it isn't the base of the tax
                    # (e.g. if there is first a fixed tax and then a percent tax). This is required by the JoFotara spec.
                    'cbc:TaxableAmount': self._l10n_jo_get_amount_node(vals, base_line['tax_details']['total_excluded_currency']),
                    'cbc:TaxAmount': self._l10n_jo_get_amount_node(vals, values['tax_amount_currency']),
                    'cac:TaxCategory': self._get_tax_category_node(vals, grouping_key),
                }
                for grouping_key, values in aggregated_tax_details.items()
                if grouping_key
            ],
        })

    def _ubl_add_line_item_name_description_nodes(self, vals):
        item_node = vals['item_node']
        base_line = vals['line_vals']['base_line']
        line_name = base_line['record'] and base_line['record'].name
        line_name = line_name and line_name.replace('\n', ' ')
        item_node['cbc:Description'] = None
        item_node['cbc:Name'] = {'_text': base_line['product_id'].name or line_name}

    def _ubl_add_line_item_identification_nodes(self, vals):
        super()._ubl_add_line_item_identification_nodes(vals)
        vals['item_node']['cac:BuyersItemIdentification'] = None

    def _ubl_add_line_item_commodity_classification_nodes(self, vals):
        vals['item_node']['cac:CommodityClassification'] = []

    def _ubl_add_line_item_classified_tax_category_nodes(self, vals, in_foreign_currency=True):
        # No InvoiceLine/Item/ClassifiedTaxCategory in Jordan
        vals['item_node']['cac:ClassifiedTaxCategory'] = []

    def _ubl_add_line_price_node(self, vals, in_foreign_currency=True):
        line_amounts = self._l10n_jo_get_line_amounts(vals, vals['line_vals']['base_line'])
        vals['line_node']['cac:Price'] = {
            'cbc:PriceAmount': self._l10n_jo_get_amount_node(vals, line_amounts['gross_price_unit_currency']),
            # Add the line-level AllowanceCharge to the Price node
            'cac:AllowanceCharge': {
                'cbc:ChargeIndicator': {'_text': 'false'},
                'cbc:AllowanceChargeReason': {'_text': 'DISCOUNT'},
                'cbc:Amount': self._l10n_jo_get_amount_node(vals, abs(line_amounts['discount_amount_currency'])),
            },
        }

    def _ubl_add_line_item_additional_item_property_nodes(self, vals):
        product = vals['line_vals']['base_line']['product_id']
        vals['item_node']['cac:AdditionalItemProperty'] = [
            {
                'cbc:Name': {'_text': value.attribute_id.name},
                'cbc:Value': {'_text': value.name},
            }
            for value in product.product_template_attribute_value_ids
        ]

    # -------------------------------------------------------------------------
    # EXPORT: Document
    # -------------------------------------------------------------------------

    def _fill_document_values_invoice(self, vals):
        self._ubl_add_version_id_node(vals)
        self._ubl_add_customization_id_node(vals)
        self._ubl_add_profile_id_node(vals)
        self._ubl_add_id_node(vals)
        self._l10n_jo_add_uuid_node(vals)
        self._ubl_add_issue_date_node(vals)
        self._ubl_add_due_date_node(vals)
        self._ubl_add_invoice_type_code_node(vals)
        self._ubl_add_notes_nodes(vals)
        self._ubl_add_document_currency_code_node(vals)
        self._ubl_add_tax_currency_code_node(vals)
        self._ubl_add_buyer_reference_node(vals)
        self._ubl_add_order_reference_node(vals)
        self._ubl_add_billing_reference_nodes(vals)
        self._l10n_jo_add_additional_document_reference_nodes(vals)
        self._ubl_add_accounting_supplier_party_node(vals)
        self._ubl_add_accounting_customer_party_node(vals)
        self._ubl_add_seller_supplier_party_node(vals)
        self._ubl_add_delivery_nodes(vals)
        self._ubl_add_payment_means_nodes(vals)
        self._ubl_add_payment_terms_nodes(vals)
        self._ubl_add_invoice_line_nodes(vals)
        self._ubl_add_allowance_charge_nodes(vals)
        self._ubl_add_tax_totals_nodes(vals)
        self._ubl_add_legal_monetary_total_node(vals)
