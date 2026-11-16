import re

from odoo import models
from odoo.tools import float_compare
from odoo.addons.l10n_jo_edi.models.account_edi_xml_ubl_21_jo import JO_MAX_DP
from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt


class PosEdiXmlUBL21Jo(models.AbstractModel):
    """ JoFotara UBL 2.1 export of the POS orders, see account.edi.xml.ubl_21.jo for the format.

    Regular orders and refunds are both rendered as an UBL <Invoice> (InvoiceTypeCode 388 / 381).
    """
    _name = 'pos.edi.xml.ubl_21.jo'
    _inherit = ['pos.edi.xml.ubl_21']
    _description = 'UBL 2.1 (JoFotara) for PoS Orders'

    # -------------------------------------------------------------------------
    # EXPORT: Values
    # -------------------------------------------------------------------------

    def _export_pos_order_get_document_type(self, pos_order):
        # EXTENDS pos_edi_ubl
        # Only use Invoice in JO, even for refunds.
        return 'pos_invoice'

    def _init_pos_order_export_values(self, pos_order):
        # EXTENDS pos_edi_ubl
        vals = super()._init_pos_order_export_values(pos_order)
        company = vals['company']
        vals.update({
            'is_refund': pos_order.amount_total < 0,
            'is_sales': company.l10n_jo_edi_taxpayer_type == 'sales',
            'is_income': company.l10n_jo_edi_taxpayer_type == 'income',
        })
        vals['base_lines_edi_ids'] = self._l10n_jo_get_base_lines_edi_ids(vals)
        vals['discount_amount_currency'] = sum(
            abs(self._l10n_jo_get_line_amounts(vals, base_line)['discount_amount_currency'])
            for base_line in vals['base_lines']
        )
        return vals

    def _l10n_jo_get_currency_9_dp(self):
        return self.env['account.edi.xml.ubl_21.jo']._l10n_jo_get_currency_9_dp()

    def _l10n_jo_get_base_lines(self, pos_order, currency_9_dp):
        """ Compute values for order lines. In Jordan, because the web-service has absolutely no tolerance,
        what we do is: use round per line with 9 decimals (yes!)
        """
        base_lines = pos_order.lines._prepare_base_lines_for_taxes_computation()

        AccountTax = self.env['account.tax']
        for base_line in base_lines:
            base_line['currency_id'] = currency_9_dp
            AccountTax._add_tax_details_in_base_line(base_line, base_line['record'].company_id, 'round_per_line')

        # Round to 9 decimals
        AccountTax._round_base_lines_tax_details(base_lines, company=pos_order.company_id)

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

    def _pos_order_prepare_base_lines(self, vals):
        # EXTENDS pos_edi_ubl
        vals['jo_currency'] = self._l10n_jo_get_currency_9_dp()
        vals['base_lines'] = self._l10n_jo_get_base_lines(vals['pos_order'], vals['jo_currency'])
        vals['tax_lines'] = []

    def _round_base_lines_tax_details(self, vals, in_company_currency=True):
        # EXTENDS account.edi.common
        # The JO base lines are already rounded with 9 decimals, see '_l10n_jo_get_base_lines'.
        return

    def _l10n_jo_get_base_lines_edi_ids(self, vals):
        """ Map the index of the lines of a refund to the index of the matching lines of the refunded order. """
        base_lines_edi_ids = {}
        if vals['is_refund']:
            DecimalPrecision = self.env['decimal.precision']
            order_base_lines = self._l10n_jo_get_base_lines(vals['pos_order'].refunded_order_id, vals['jo_currency'])
            order_edi_id_x_base_line = dict(enumerate(order_base_lines, 1))
            overflow_edi_id = len(order_edi_id_x_base_line) + 1

            refund_base_lines = filter(lambda l: not self._is_early_payment_base_line(l), vals['base_lines'])
            for line_idx, refund_base_line in enumerate(refund_base_lines, 1):
                matching_edi_ids = [
                    line_id for line_id, base_line in order_edi_id_x_base_line.items()
                    if base_line['product_id'] == refund_base_line['product_id']
                    and float_compare(base_line['price_unit'], refund_base_line['price_unit'], precision_digits=DecimalPrecision.precision_get('Product Price')) == 0
                    and float_compare(base_line['discount'], refund_base_line['discount'], precision_digits=DecimalPrecision.precision_get('Discount')) == 0
                    and float_compare(base_line['quantity'], abs(refund_base_line['quantity']), precision_digits=DecimalPrecision.precision_get('Product Unit')) >= 0
                ]

                if matching_edi_ids:
                    edi_id = min(matching_edi_ids, key=lambda line_id: order_edi_id_x_base_line[line_id]['quantity'])
                    base_lines_edi_ids[line_idx] = edi_id
                    order_edi_id_x_base_line.pop(edi_id)
                else:
                    base_lines_edi_ids[line_idx] = overflow_edi_id
                    overflow_edi_id += 1
        return base_lines_edi_ids

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

    def _get_payment_method_code(self, order):
        return order._get_order_scope_code() + order._get_order_payment_method_code() + order._get_order_tax_payer_type_code()

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
            'cbc:ID': {'_text': grouping_key['tax_category_code'], 'schemeAgencyID': 6, 'schemeID': 'UN/ECE 5305'},
            'cbc:Percent': {'_text': grouping_key['amount']} if grouping_key['amount_type'] == 'percent' else None,
            'cac:TaxScheme': {
                'cbc:ID': {
                    '_text': 'VAT' if grouping_key['amount_type'] == 'percent' else 'OTH',
                    'schemeAgencyID': 6,
                    'schemeID': 'UN/ECE 5153',
                },
            }
        }

    @staticmethod
    def _l10n_jo_sum_raw_tax_amount(aggregated_tax_details):
        # The special (fixed) taxes are excluded from the tax amounts.
        return sum(
            values['raw_tax_amount_currency']
            for grouping_key, values in aggregated_tax_details.items()
            if grouping_key and grouping_key['amount_type'] != 'fixed'
        )

    # -------------------------------------------------------------------------
    # EXPORT: Document header nodes
    # -------------------------------------------------------------------------

    def _ubl_add_version_id_node(self, vals):
        vals['document_node']['cbc:UBLVersionID'] = {'_text': None}

    def _ubl_add_profile_id_node(self, vals):
        vals['document_node']['cbc:ProfileID'] = {'_text': 'reporting:1.0'}

    def _ubl_add_id_node(self, vals):
        vals['document_node']['cbc:ID'] = {'_text': (vals['pos_order'].name or '').replace('/', '_')}

    def _l10n_jo_add_uuid_node(self, vals):
        pos_order = vals['pos_order']
        pos_order._compute_l10n_jo_edi_pos_uuid()
        vals['document_node']['cbc:UUID'] = {'_text': pos_order.l10n_jo_edi_pos_uuid}

    def _ubl_add_issue_date_node(self, vals):
        pos_order = vals['pos_order']
        vals['document_node']['cbc:IssueDate'] = {
            '_text': '2020-01-01' if pos_order.company_id.l10n_jo_edi_pos_testing_mode else pos_order.date_order.date(),
        }
        vals['document_node']['cbc:IssueTime'] = {'_text': None}

    def _ubl_add_due_date_node(self, vals):
        vals['document_node']['cbc:DueDate'] = {'_text': None}

    def _ubl_add_invoice_type_code_node(self, vals):
        vals['document_node']['cbc:InvoiceTypeCode'] = {
            '_text': 381 if vals['is_refund'] else 388,
            'name': self._get_payment_method_code(vals['pos_order']),
        }

    def _ubl_add_notes_nodes(self, vals):
        vals['document_node']['cbc:Note'] = [{'_text': vals['pos_order'].general_customer_note}]

    def _ubl_add_tax_currency_code_node(self, vals):
        vals['document_node']['cbc:TaxCurrencyCode'] = {'_text': vals['currency'].name}

    def _ubl_add_order_reference_node(self, vals):
        vals['document_node']['cac:OrderReference'] = None

    def _ubl_add_billing_reference_nodes(self, vals):
        nodes = vals['document_node']['cac:BillingReference'] = []
        if vals['is_refund']:
            refunded_order = vals['pos_order'].refunded_order_id
            nodes.append({
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {'_text': (refunded_order.name or '').replace('/', '_')},
                    'cbc:UUID': {'_text': refunded_order.l10n_jo_edi_pos_uuid},
                    'cbc:DocumentDescription': {
                        '_text': self.format_float(abs(refunded_order.amount_total), JO_MAX_DP),
                    },
                },
            })

    def _l10n_jo_add_additional_document_reference_nodes(self, vals):
        vals['document_node']['cac:AdditionalDocumentReference'] = [{
            'cbc:ID': {'_text': 'ICV'},
            'cbc:UUID': {'_text': vals['pos_order'].id},
        }]

    # -------------------------------------------------------------------------
    # EXPORT: Party nodes
    # -------------------------------------------------------------------------

    def _ubl_get_partner_address_node(self, vals, partner):
        return {
            'cbc:PostalZone': {'_text': partner.zip},
            'cbc:CountrySubentityCode': {'_text': partner.state_id.code},
            'cac:Country': {
                'cbc:IdentificationCode': {'_text': partner.country_id.code},
            },
        }

    def _ubl_add_party_endpoint_id_node(self, vals):
        vals['party_node']['cbc:EndpointID'] = None

    def _ubl_add_party_name_node(self, vals):
        vals['party_node']['cac:PartyName'] = None

    def _ubl_add_accounting_customer_party_identification_nodes(self, vals):
        partner = vals['party_vals']['partner']
        vals['party_node']['cac:PartyIdentification'] = [{
            'cbc:ID': {
                '_text': partner.commercial_partner_id.vat,
                'schemeID': 'TN' if partner.country_code == 'JO' else 'PN',
            },
        }]

    def _ubl_add_party_tax_scheme_nodes(self, vals):
        partner = vals['party_vals']['partner']
        vals['party_node']['cac:PartyTaxScheme'] = [{
            'cbc:CompanyID': {'_text': partner.commercial_partner_id.vat},
            'cac:TaxScheme': {
                'cbc:ID': {'_text': 'VAT'},
            },
        }]

    def _ubl_add_party_legal_entity_nodes(self, vals):
        partner = vals['party_vals']['partner']
        vals['party_node']['cac:PartyLegalEntity'] = [{
            'cbc:RegistrationName': {'_text': partner.commercial_partner_id.name},
        }]

    def _ubl_add_party_contact_node(self, vals):
        vals['party_node']['cac:Contact'] = None

    def _ubl_add_accounting_customer_party_node(self, vals):
        super()._ubl_add_accounting_customer_party_node(vals)
        vals['document_node']['cac:AccountingCustomerParty']['cac:AccountingContact'] = {
            'cbc:Telephone': {'_text': self._sanitize_phone(vals['customer'].phone)},
        }

    def _ubl_add_seller_supplier_party_node(self, vals):
        vals['document_node']['cac:SellerSupplierParty'] = {
            'cac:Party': {
                'cac:PartyIdentification': {
                    'cbc:ID': {'_text': vals['company'].l10n_jo_edi_sequence_income_source},
                },
            },
        }

    def _ubl_add_delivery_nodes(self, vals):
        vals['document_node']['cac:Delivery'] = []

    def _ubl_add_payment_means_nodes(self, vals):
        nodes = vals['document_node']['cac:PaymentMeans'] = []
        if vals['is_refund']:
            nodes.append({
                'cbc:PaymentMeansCode': {'listID': 'UN/ECE 4461', '_text': 10},
                'cbc:InstructionNote': {'_text': vals['pos_order'].l10n_jo_edi_pos_return_reason},
            })

    def _ubl_add_payment_terms_nodes(self, vals):
        vals['document_node']['cac:PaymentTerms'] = []

    # -------------------------------------------------------------------------
    # EXPORT: Document amount nodes
    # -------------------------------------------------------------------------

    def _ubl_add_allowance_charge_nodes(self, vals):
        vals['document_node']['cac:AllowanceCharge'] = [{
            'cbc:ChargeIndicator': {'_text': 'false'},
            'cbc:AllowanceChargeReason': {'_text': 'discount'},
            'cbc:Amount': self._l10n_jo_get_amount_node(vals, vals['discount_amount_currency']),
        }]

    def _ubl_add_tax_totals_nodes(self, vals):
        document_node = vals['document_node']
        document_node['cac:TaxTotal'] = []
        document_node['cac:WithholdingTaxTotal'] = []

        # income docs should have no taxes
        if vals['is_income']:
            return

        AccountTax = self.env['account.tax']
        base_lines_aggregated_tax_details = AccountTax._aggregate_base_lines_tax_details(
            vals['base_lines'],
            lambda base_line, tax_data: self._l10n_jo_tax_grouping_key(base_line, tax_data, vals),
        )
        aggregated_tax_details = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_tax_details)
        document_node['cac:TaxTotal'].append({
            'cbc:TaxAmount': self._l10n_jo_get_amount_node(vals, self._l10n_jo_sum_raw_tax_amount(aggregated_tax_details)),
            # Only the credit notes of the sales taxpayers have tax subtotals
            'cac:TaxSubtotal': [
                {
                    'cbc:TaxableAmount': self._l10n_jo_get_amount_node(vals, values['raw_total_excluded_currency']),
                    'cbc:TaxAmount': self._l10n_jo_get_amount_node(vals, values['raw_tax_amount_currency']),
                    'cac:TaxCategory': self._get_tax_category_node(vals, grouping_key),
                }
                for grouping_key, values in aggregated_tax_details.items()
                if grouping_key
            ] if vals['is_refund'] and vals['is_sales'] else None,
        })

    def _ubl_add_legal_monetary_total_node(self, vals):
        AccountTax = self.env['account.tax']
        tax_exclusive_amount = sum(
            base_line['tax_details']['total_excluded_currency'] + base_line['tax_details']['delta_total_excluded_currency']
            for base_line in vals['base_lines']
        )
        base_lines_aggregated_tax_details = AccountTax._aggregate_base_lines_tax_details(vals['base_lines'], lambda base_line, tax_data: True)
        aggregated_tax_details = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_tax_details)
        tax_inclusive_amount = tax_exclusive_amount + sum(
            values['tax_amount_currency']
            for grouping_key, values in aggregated_tax_details.items()
            if grouping_key
        )
        discount_amount = vals['discount_amount_currency']

        vals['document_node']['cac:LegalMonetaryTotal'] = {
            'cbc:TaxExclusiveAmount': self._l10n_jo_get_amount_node(vals, tax_exclusive_amount + discount_amount),
            'cbc:TaxInclusiveAmount': self._l10n_jo_get_amount_node(vals, tax_inclusive_amount),
            'cbc:AllowanceTotalAmount': self._l10n_jo_get_amount_node(vals, discount_amount),
            'cbc:PrepaidAmount': self._l10n_jo_get_amount_node(vals, 0) if vals['is_refund'] and vals['is_sales'] else None,
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

    def _ubl_add_line_period_nodes(self, vals):
        vals['line_node']['cac:InvoicePeriod'] = []

    def _ubl_add_line_tax_totals_nodes(self, vals):
        nodes = vals['line_node']['cac:TaxTotal'] = []

        # income docs should have no taxes
        if vals['is_income']:
            return

        base_line = vals['line_vals']['base_line']
        aggregated_tax_details = self.env['account.tax']._aggregate_base_line_tax_details(
            base_line,
            lambda base_line, tax_data: self._l10n_jo_tax_grouping_key(base_line, tax_data, vals),
        )
        nodes.append({
            'cbc:TaxAmount': self._l10n_jo_get_amount_node(vals, self._l10n_jo_sum_raw_tax_amount(aggregated_tax_details)),
            'cbc:RoundingAmount': self._l10n_jo_get_amount_node(vals, base_line['tax_details']['raw_total_included_currency']),
            'cac:TaxSubtotal': [
                {
                    # Always report the line's tax-excluded total as base amount.
                    'cbc:TaxableAmount': self._l10n_jo_get_amount_node(vals, base_line['tax_details']['raw_total_excluded_currency']),
                    'cbc:TaxAmount': self._l10n_jo_get_amount_node(vals, values['raw_tax_amount_currency']),
                    'cac:TaxCategory': self._get_tax_category_node(vals, grouping_key),
                }
                for grouping_key, values in aggregated_tax_details.items()
                if grouping_key
            ],
        })

    def _ubl_add_line_item_node(self, vals):
        vals['line_node']['cac:Item'] = {
            'cbc:Name': {'_text': vals['line_vals']['base_line']['product_id'].name},
        }

    def _ubl_add_line_price_node(self, vals, in_foreign_currency=True):
        line_amounts = self._l10n_jo_get_line_amounts(vals, vals['line_vals']['base_line'])
        vals['line_node']['cac:Price'] = {
            'cbc:PriceAmount': self._l10n_jo_get_amount_node(vals, line_amounts['gross_price_unit_currency']),
            'cac:AllowanceCharge': {
                'cbc:ChargeIndicator': {'_text': 'false'},
                'cbc:AllowanceChargeReason': {'_text': 'DISCOUNT'},
                'cbc:Amount': self._l10n_jo_get_amount_node(vals, abs(line_amounts['discount_amount_currency'])),
            },
        }

    # -------------------------------------------------------------------------
    # EXPORT: Document
    # -------------------------------------------------------------------------

    def _fill_document_values_invoice(self, vals):
        self._ubl_add_version_id_node(vals)
        self._ubl_add_profile_id_node(vals)
        self._ubl_add_id_node(vals)
        self._l10n_jo_add_uuid_node(vals)
        self._ubl_add_issue_date_node(vals)
        self._ubl_add_due_date_node(vals)
        self._ubl_add_invoice_type_code_node(vals)
        self._ubl_add_notes_nodes(vals)
        self._ubl_add_document_currency_code_node(vals)
        self._ubl_add_tax_currency_code_node(vals)
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
