from odoo import fields, models


class PosEdiXmlUBL21Zatca(models.AbstractModel):
    """ZATCA-specific UBL 2.1 XML format for POS orders."""
    _name = 'pos.edi.xml.ubl_21.zatca'
    _inherit = ['zatca.edi.common.mixin', 'pos.edi.xml.ubl_21']
    _description = 'ZATCA UBL 2.1 for POS Orders'

    def _get_pos_order_node(self, vals):
        """Override to add ZATCA-specific delivery nodes."""
        # Get the base document node from parent
        document_node = super()._get_pos_order_node(vals)

        # Inject delivery nodes after customer party and before payment means
        # We need to reconstruct the node in the correct order for ZATCA
        # The required order is: header, parties, delivery, payment means, tax, monetary, lines
        ordered_node = {}

        # Preserve order: first add all nodes except PaymentMeans and later nodes
        for key in ['cbc:UBLVersionID', 'cbc:ProfileID', 'cbc:ID', 'cbc:UUID', 'cbc:IssueDate',
                    'cbc:IssueTime', 'cbc:InvoiceTypeCode', 'cbc:DocumentCurrencyCode',
                    'cbc:TaxCurrencyCode', 'cbc:OrderReference', 'cac:AdditionalDocumentReference',
                    'cac:Signature', 'cac:AccountingSupplierParty', 'cac:AccountingCustomerParty']:
            if key in document_node:
                ordered_node[key] = document_node[key]

        # Add Delivery before PaymentMeans
        self._add_pos_order_delivery_nodes(ordered_node, vals)

        # Add remaining nodes in correct order
        remaining_keys = [k for k in document_node if k not in ordered_node]
        for key in remaining_keys:
            ordered_node[key] = document_node[key]

        return ordered_node

    def _add_document_tax_grouping_function_vals(self, vals):
        """Override to filter out retention taxes (withholding) for ZATCA compliance."""
        # Always ignore withholding taxes in the UBL
        def total_grouping_function(base_line, tax_data):
            if tax_data and tax_data['tax'].l10n_sa_is_retention:
                return None
            return True

        def tax_grouping_function(base_line, tax_data):
            tax = tax_data and tax_data['tax']

            # Ignore withholding taxes
            if tax and tax.l10n_sa_is_retention:
                return None
            return {
                'tax_category_code': self._get_tax_category_code(vals['customer'].commercial_partner_id, vals['supplier'], tax),
                **self._get_tax_exemption_reason(vals['customer'].commercial_partner_id, vals['supplier'], tax),
                'amount': tax.amount if tax else 0.0,
                'amount_type': tax.amount_type if tax else 'percent',
            }

        vals['total_grouping_function'] = total_grouping_function
        vals['tax_grouping_function'] = tax_grouping_function

    def _l10n_sa_get_payment_means_code(self, order):
        """
        Return payment means code for POS order based on payment method.

        ZATCA Payment Means Codes:
        - 10: Cash
        - 30: Credit
        - 42: Payment to bank account
        - 48: Bank card (default for POS)
        """
        if order.payment_ids:
            payment_method = order.payment_ids[0].payment_method_id
            # Map POS payment method types to ZATCA codes
            payment_type_mapping = {
                'cash': 'cash',  # Maps to 10 in PAYMENT_MEANS_CODE
                'bank': 'bank',  # Maps to 42 in PAYMENT_MEANS_CODE
                'pay_later': 'transfer',  # Maps to 30 in PAYMENT_MEANS_CODE
            }
            return payment_type_mapping.get(payment_method.type, 'card')  # Default to 48 (bank card)
        return 'card'  # Default to bank card

    def _add_pos_order_header_nodes(self, document_node, vals):
        """Override to add ZATCA-specific header fields including IssueTime and AdditionalDocumentReference."""
        # Call parent method to get base header nodes
        super()._add_pos_order_header_nodes(document_node, vals)

        pos_order = vals['pos_order']

        # Add IssueTime which is required by ZATCA but not included in base POS UBL
        if pos_order.l10n_sa_confirmation_datetime:
            # Convert to Riyadh timezone for ZATCA compliance
            issue_datetime = fields.Datetime.context_timestamp(
                self.with_context(tz='Asia/Riyadh'),
                pos_order.l10n_sa_confirmation_datetime
            )
            document_node.update({
                'cbc:ProfileID': {'_text': 'reporting:1.0'},
                'cbc:IssueDate': {'_text': issue_datetime.strftime('%Y-%m-%d')},
                'cbc:IssueTime': {'_text': issue_datetime.strftime('%H:%M:%S')},
                'cbc:UUID': {'_text': pos_order.l10n_sa_uuid},
                'cbc:InvoiceTypeCode': {
                    '_text': 388,  # Simplified tax invoice
                    'name': self._get_invoice_type_code_name(pos_order),
                },
                'cbc:TaxCurrencyCode': {'_text': pos_order.company_id.currency_id.name},
                'cac:OrderReference': None,
                'cac:AdditionalDocumentReference': self._get_zatca_additional_document_references(pos_order),
                'cac:Signature': self._get_zatca_signature_node(pos_order),
            })

    def _add_pos_order_delivery_nodes(self, document_node, vals):
        """Add ZATCA-required delivery nodes for POS orders."""
        pos_order = vals['pos_order']

        # Get the issue date for actual delivery date
        issue_date = fields.Datetime.context_timestamp(
            self.with_context(tz='Asia/Riyadh'),
            pos_order.l10n_sa_confirmation_datetime
        )

        document_node['cac:Delivery'] = {
            'cbc:ActualDeliveryDate': {'_text': issue_date.strftime('%Y-%m-%d')},
        }

    def _add_pos_order_payment_means_nodes(self, document_node, vals):
        """Add ZATCA-required payment means nodes for POS orders."""
        pos_order = vals['pos_order']

        # Import PAYMENT_MEANS_CODE from the mixin module
        from odoo.addons.l10n_sa_edi.models.zatca_edi_common_mixin import PAYMENT_MEANS_CODE

        # Get the issue date for payment due date
        issue_date = fields.Datetime.context_timestamp(
            self.with_context(tz='Asia/Riyadh'),
            pos_order.l10n_sa_confirmation_datetime
        )

        document_node['cac:PaymentMeans'] = {
            'cbc:PaymentMeansCode': {
                '_text': PAYMENT_MEANS_CODE.get(
                    self._l10n_sa_get_payment_means_code(pos_order),
                    PAYMENT_MEANS_CODE['unknown']
                ),
                'listID': 'UN/ECE 4461',
            },
            'cbc:PaymentDueDate': {'_text': issue_date.strftime('%Y-%m-%d')},
            'cbc:InstructionID': {'_text': pos_order.name},
            'cbc:PaymentID': {'_text': pos_order.name},
        }

    def _add_pos_order_monetary_total_nodes(self, document_node, vals):
        """Override to set PrepaidAmount to 0.00 for ZATCA compliance (BR-KSA-80).

        POS orders don't have prepayment/downpayment functionality, so PrepaidAmount
        should always be 0.00, and PayableAmount should be the full amount_total.
        """
        self._add_document_monetary_total_nodes(document_node, vals)
        monetary_total_tag = self._get_tags_for_document_type(vals)['monetary_total']
        pos_order = vals['pos_order']

        document_node[monetary_total_tag].update({
            'cbc:PrepaidAmount': {
                '_text': '0.00',  # Always 0.00 for POS orders (BR-KSA-80)
                'currencyID': vals['currency_name'],
            },
            'cbc:PayableAmount': {
                '_text': self.format_float(pos_order.amount_total, vals['currency_dp']),
                'currencyID': vals['currency_name'],
            },
        })

    def _add_pos_order_tax_total_nodes(self, document_node, vals):
        """Override to ensure ZATCA compliance for tax totals (BR-KSA-EN16931-09).

        When a tax currency code is provided, only one tax total without tax subtotals is allowed.
        """
        # First call parent to get the standard tax total
        super()._add_pos_order_tax_total_nodes(document_node, vals)

        # Convert single TaxTotal to list for consistency
        document_node['cac:TaxTotal'] = [document_node['cac:TaxTotal']]
        
        # we need to potentially change this in standard
        vals['invoice'] = vals['pos_order']

        # Add tax total in company currency (required by ZATCA)
        self._add_tax_total_node_in_company_currency(document_node, vals)

        # BR-KSA-EN16931-09: Remove tax subtotals from the company currency tax total
        if len(document_node['cac:TaxTotal']) > 1:
            document_node['cac:TaxTotal'][1]['cac:TaxSubtotal'] = None

    def _add_pos_order_line_tax_total_nodes(self, line_node, vals):
        """Override to add ZATCA-required RoundingAmount field (KSA-12) for BR-KSA-51."""
        base_line = vals['base_line']
        aggregated_tax_details = self.env['account.tax']._aggregate_base_line_tax_details(
            base_line, vals['tax_grouping_function']
        )

        total_tax_amount = sum(
            values['tax_amount_currency']
            for grouping_key, values in aggregated_tax_details.items()
            if grouping_key
        )
        # KSA-12: Line amount with VAT = line net amount + line VAT amount
        line_amount_with_vat = base_line['tax_details']['total_excluded_currency'] + total_tax_amount

        line_node['cac:TaxTotal'] = {
            'cbc:TaxAmount': {
                '_text': self.format_float(total_tax_amount, vals['currency_dp']),
                'currencyID': vals['currency_name'],
            },
            'cbc:RoundingAmount': {
                # BR-KSA-51: This field must equal line net amount + line VAT amount
                '_text': self.format_float(line_amount_with_vat, vals['currency_dp']),
                'currencyID': vals['currency_name'],
            },
        }
