from odoo import models
from odoo.tools import float_compare
from odoo.addons.l10n_jo_edi.models.account_edi_xml_ubl_21_jo import JO_MAX_DP


class PosEdiXmlUBL21Jo(models.AbstractModel):
    """ JoFotara UBL 2.1 export of the POS orders: the JoFotara builder of the invoices ('account.edi.xml.ubl_21.jo')
    applied on the POS orders exported by 'pos.edi.xml.ubl_21'. Only what depends on the POS order is overridden here.

    Regular orders and refunds are both rendered as an UBL <Invoice> (InvoiceTypeCode 388 / 381).
    """
    _name = 'pos.edi.xml.ubl_21.jo'
    _inherit = ['account.edi.xml.ubl_21.jo', 'pos.edi.xml.ubl_21']
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

    def _ubl_prepare_base_lines(self, vals):
        # OVERRIDE account.edi.xml.ubl_21.jo
        # The base lines of the POS order are computed by '_pos_order_prepare_base_lines'.
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

    # -------------------------------------------------------------------------
    # EXPORT: Helpers
    # -------------------------------------------------------------------------

    def _get_payment_method_code(self, order):
        return order._get_order_scope_code() + order._get_order_payment_method_code() + order._get_order_tax_payer_type_code()

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

    def _ubl_add_invoice_type_code_node(self, vals):
        vals['document_node']['cbc:InvoiceTypeCode'] = {
            '_text': 381 if vals['is_refund'] else 388,
            'name': self._get_payment_method_code(vals['pos_order']),
        }

    def _ubl_add_notes_nodes(self, vals):
        vals['document_node']['cbc:Note'] = [{'_text': vals['pos_order'].general_customer_note}]

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

    def _l10n_jo_get_customer_phone(self, vals):
        # EXTENDS account.edi.xml.ubl_21.jo
        return vals['customer'].phone

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
