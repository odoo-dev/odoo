from odoo import fields, models
from odoo.tools import html2plaintext


class AccountEdiXmlUblZatca(models.AbstractModel):
    """ ZATCA (Saudi Arabia) e-invoicing, phase 2 ("Fatoora").

    ZATCA documents are UBL 2.1 Invoices (credit and debit notes are also sent as <Invoice>, with InvoiceTypeCode
    381/383) declaring ProfileID 'reporting:1.0' and no CustomizationID, signed with an enveloped XAdES signature in
    ext:UBLExtensions. The KSA business rules (BR-KSA-*) are a national customization that does not claim conformance to
    EN 16931 (two TaxTotal, KSA specific address elements, document level AllowanceCharge for the negative lines, ...),
    so it only inherits the UBL syntax (account.edi.ubl).

    Specification: https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/TechnicalRequirementsSpec.aspx
    (E-Invoicing XML Implementation Standard and Data Dictionary).
    """
    _name = 'account.edi.xml.ubl_zatca'
    _inherit = ['zatca.ubl.mixin', 'account.edi.ubl']
    _description = 'UBL 2.1 (ZATCA)'

    # -------------------------------------------------------------------------
    # EXPORT: Values
    # -------------------------------------------------------------------------

    def _export_get_document_type(self, invoice):
        # EXTENDS account.edi.common
        # Only use Invoice in ZATCA, even for credit and debit notes because we want the root
        # tag of the document to be <Invoice>.
        return 'invoice'

    def _export_get_parties(self, vals):
        # EXTENDS account.edi.common
        supplier, customer, delivery = super()._export_get_parties(vals)
        return supplier.commercial_partner_id, customer, delivery

    def _init_invoice_export_values(self, invoice):
        # EXTENDS account.edi.ubl
        vals = super()._init_invoice_export_values(invoice)
        invoice = vals['invoice']

        if not invoice._is_downpayment():
            # Filter out prepayment lines of final invoices
            vals['base_lines'] = [
                base_line
                for base_line in vals['base_lines']
                if not base_line['record']._get_downpayment_lines()
            ]

            # Get downpayment moves' base lines
            prepayment_moves = invoice.line_ids._get_downpayment_lines().move_id.filtered(lambda m: m.move_type == 'out_invoice')
            if non_reversed := prepayment_moves.filtered(lambda m: m.payment_state != 'reversed'):
                prepayment_moves = non_reversed
        else:
            prepayment_moves = self.env['account.move']

        vals['prepayment_moves_base_lines'] = {
            prepayment_move: prepayment_move._get_rounded_base_and_tax_lines()[0]
            for prepayment_move in prepayment_moves
        }

        self._l10n_sa_prepare_base_lines(vals)
        return vals

    # -------------------------------------------------------------------------
    # EXPORT: Document header nodes
    # -------------------------------------------------------------------------

    def _l10n_sa_get_issue_datetime(self, invoice):
        return fields.Datetime.context_timestamp(self.with_context(tz='Asia/Riyadh'), invoice.l10n_sa_confirmation_datetime)

    def _ubl_add_profile_id_node(self, vals):
        vals['document_node']['cbc:ProfileID'] = {'_text': 'reporting:1.0'}

    def _l10n_sa_add_uuid_node(self, vals):
        vals['document_node']['cbc:UUID'] = {'_text': vals['invoice'].l10n_sa_uuid}

    def _ubl_add_issue_date_node(self, vals):
        issue_date = self._l10n_sa_get_issue_datetime(vals['invoice'])
        vals['document_node']['cbc:IssueDate'] = {'_text': issue_date.strftime('%Y-%m-%d')}
        vals['document_node']['cbc:IssueTime'] = {'_text': issue_date.strftime('%H:%M:%S')}

    def _ubl_add_due_date_node(self, vals):
        vals['document_node']['cbc:DueDate'] = {'_text': None}

    def _ubl_add_invoice_type_code_node(self, vals):
        invoice = vals['invoice']
        vals['document_node']['cbc:InvoiceTypeCode'] = {
            '_text': (
                383 if invoice.debit_origin_id else
                381 if invoice.move_type == 'out_refund' else
                386 if invoice._is_downpayment() else 388
            ),
            'name': invoice._get_l10n_sa_edi_invoice_type_code(),
        }

    def _ubl_add_document_currency_code_node(self, vals):
        self._ubl_add_document_currency_code_node_foreign_currency(vals)

    def _ubl_add_tax_currency_code_node(self, vals):
        self._ubl_add_tax_currency_code_node_company_currency(vals)

    def _ubl_add_buyer_reference_node(self, vals):
        vals['document_node']['cbc:BuyerReference'] = {'_text': vals['invoice'].commercial_partner_id.ref}

    def _ubl_add_order_reference_node(self, vals):
        vals['document_node']['cac:OrderReference'] = None

    def _ubl_add_billing_reference_nodes(self, vals):
        nodes = vals['document_node']['cac:BillingReference'] = []
        invoice = vals['invoice']
        if invoice.move_type == 'out_refund' or invoice.debit_origin_id:
            nodes.append({
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {
                        '_text': (invoice.reversed_entry_id.name or invoice.ref)
                        if invoice.move_type == 'out_refund'
                        else invoice.debit_origin_id.name,
                    },
                },
            })

    def _l10n_sa_add_additional_document_reference_nodes(self, vals):
        invoice = vals['invoice']
        vals['document_node']['cac:AdditionalDocumentReference'] = [
            {
                'cbc:ID': {'_text': 'QR'},
                'cac:Attachment': {
                    'cbc:EmbeddedDocumentBinaryObject': {
                        '_text': 'N/A',
                        'mimeCode': 'text/plain',
                    },
                },
            } if invoice.l10n_sa_invoice_type == 'simplified' else None,
            {
                'cbc:ID': {'_text': 'PIH'},
                'cac:Attachment': {
                    'cbc:EmbeddedDocumentBinaryObject': {
                        '_text': (
                            "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ=="
                            if invoice.company_id.l10n_sa_api_mode == 'sandbox' or not invoice.journal_id.l10n_sa_latest_submission_hash
                            else invoice.journal_id.l10n_sa_latest_submission_hash
                        ),
                        'mimeCode': 'text/plain',
                    },
                },
            },
            {
                'cbc:ID': {'_text': 'ICV'},
                'cbc:UUID': {'_text': invoice.l10n_sa_chain_index},
            },
        ]

    def _l10n_sa_add_signature_node(self, vals):
        invoice = vals['invoice']
        vals['document_node']['cac:Signature'] = {
            'cbc:ID': {'_text': "urn:oasis:names:specification:ubl:signature:Invoice"},
            'cbc:SignatureMethod': {'_text': "urn:oasis:names:specification:ubl:dsig:enveloped:xades"},
        } if invoice.l10n_sa_invoice_type == 'simplified' else None

    def _ubl_add_delivery_nodes(self, vals):
        invoice = vals['invoice']
        vals['document_node']['cac:Delivery'] = [
            self._l10n_sa_get_delivery_node(vals, invoice, delivery_date=invoice.delivery_date),
        ]

    def _ubl_add_payment_means_nodes(self, vals):
        invoice = vals['invoice']
        node = {
            'cbc:PaymentDueDate': {'_text': invoice.invoice_date_due or invoice.invoice_date},
            'cbc:InstructionID': {'_text': invoice.payment_reference},
            'cbc:PaymentID': {'_text': invoice.payment_reference or invoice.name},
            'cac:PayeeFinancialAccount': (
                self._ubl_get_payment_means_payee_financial_account_node_from_partner_bank(vals, invoice.partner_bank_id)
                if invoice.partner_bank_id else None
            ),
            **self._l10n_sa_get_payment_means_node(vals, invoice),
        }
        vals['document_node']['cac:PaymentMeans'] = [node]

    def _ubl_get_payment_means_payee_financial_account_node_from_partner_bank(self, vals, partner_bank):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_payment_means_payee_financial_account_node_from_partner_bank(vals, partner_bank)
        node['cbc:ID'] = {'_text': partner_bank.account_number.replace(' ', '')}
        return node

    def _ubl_add_payment_terms_nodes(self, vals):
        nodes = vals['document_node']['cac:PaymentTerms'] = []
        payment_term = vals['invoice'].invoice_payment_term_id
        if payment_term:
            # The payment term's note is automatically embedded in a <p> tag in Odoo
            nodes.append({'cbc:Note': {'_text': html2plaintext(payment_term.note)}})

    # -------------------------------------------------------------------------
    # EXPORT: Document amount nodes
    # -------------------------------------------------------------------------

    def _ubl_add_legal_monetary_total_node(self, vals):
        currency_dp = self._get_currency_decimal_places(vals['currency'])
        currency_name = vals['currency'].name
        totals = self._l10n_sa_get_monetary_totals(vals)

        # Compute the prepaid amount
        prepaid_amount = 0.0
        for prepayment_move_base_lines in vals['prepayment_moves_base_lines'].values():
            aggregated_tax_details = self._l10n_sa_aggregate_base_lines_tax_details(
                vals,
                prepayment_move_base_lines,
                self._l10n_sa_total_grouping_key,
            )
            for grouping_key, values in aggregated_tax_details.items():
                if grouping_key:
                    prepaid_amount += values['base_amount_currency'] + values['tax_amount_currency']

        # Retrieve the rounding amount
        payable_rounding_amount = totals['cash_rounding_base_amount']
        payable_amount = totals['tax_inclusive_amount'] - prepaid_amount + payable_rounding_amount

        def amount_node(amount):
            return {
                '_text': self.format_float(amount, currency_dp),
                'currencyID': currency_name,
            }

        vals['document_node']['cac:LegalMonetaryTotal'] = {
            'cbc:LineExtensionAmount': amount_node(totals['total_lines']),
            'cbc:TaxExclusiveAmount': amount_node(totals['tax_exclusive_amount']),
            'cbc:TaxInclusiveAmount': amount_node(totals['tax_inclusive_amount']),
            # AllowanceTotalAmount is always present even if 0.0
            'cbc:AllowanceTotalAmount': amount_node(totals['total_allowance']),
            'cbc:ChargeTotalAmount': amount_node(totals['total_charge']) if totals['total_charge'] else None,
            'cbc:PrepaidAmount': amount_node(prepaid_amount),
            'cbc:PayableRoundingAmount': amount_node(payable_rounding_amount) if payable_rounding_amount else None,
            'cbc:PayableAmount': amount_node(payable_amount),
        }

    # -------------------------------------------------------------------------
    # EXPORT: Line nodes
    # -------------------------------------------------------------------------

    def _ubl_add_invoice_line_nodes(self, vals, filter_function=None):
        # EXTENDS account.edi.ubl
        nodes = vals['document_node']['cac:InvoiceLine'] = []

        # First: the non-prepayment lines from the invoice
        for sub_vals in self._line_nodes_filter_base_lines(vals, filter_function=filter_function):
            self._ubl_add_invoice_line_node(sub_vals)
            nodes.append(sub_vals['line_node'])

        # Then: all the prepayment adjustments
        for prepayment_move, prepayment_move_base_lines in vals['prepayment_moves_base_lines'].items():
            nodes.append(self._l10n_sa_get_prepayment_line_node(vals, len(nodes) + 1, prepayment_move, prepayment_move_base_lines))

    def _l10n_sa_get_prepayment_line_node(self, vals, line_idx, prepayment_move, prepayment_move_base_lines):
        currency_dp = self._get_currency_decimal_places(vals['currency'])
        currency_name = vals['currency'].name
        aggregated_tax_details = self._l10n_sa_aggregate_base_lines_tax_details(vals, prepayment_move_base_lines)
        prepayment_move_issue_date = self._l10n_sa_get_issue_datetime(prepayment_move)

        return {
            'cbc:ID': {'_text': line_idx},
            'cbc:InvoicedQuantity': {
                '_text': '1.0',
                'unitCode': 'C62',
            },
            'cbc:LineExtensionAmount': {
                '_text': '0.00',
                'currencyID': currency_name,
            },
            'cac:DocumentReference': {
                'cbc:ID': {'_text': prepayment_move.name},
                'cbc:IssueDate': {
                    '_text': prepayment_move_issue_date.strftime('%Y-%m-%d') if prepayment_move_issue_date else None,
                },
                'cbc:IssueTime': {
                    '_text': prepayment_move_issue_date.strftime('%H:%M:%S') if prepayment_move_issue_date else None,
                },
                'cbc:DocumentTypeCode': {'_text': '386'},
            },
            'cac:TaxTotal': {
                'cbc:TaxAmount': {
                    '_text': '0.00',
                    'currencyID': currency_name,
                },
                'cbc:RoundingAmount': {
                    '_text': '0.00',
                    'currencyID': currency_name,
                },
                # Prepayment move subtotals by tax category
                'cac:TaxSubtotal': [
                    {
                        'cbc:TaxableAmount': {
                            '_text': self.format_float(values['base_amount_currency'], currency_dp),
                            'currencyID': currency_name,
                        },
                        'cbc:TaxAmount': {
                            '_text': self.format_float(values['tax_amount_currency'], currency_dp),
                            'currencyID': currency_name,
                        },
                        'cbc:Percent': {'_text': grouping_key['amount']},
                        'cac:TaxCategory': self._get_tax_category_node(vals, grouping_key),
                    }
                    for grouping_key, values in aggregated_tax_details.items()
                    if grouping_key
                ],
            },
            'cac:Item': {
                'cbc:Description': {'_text': "Down Payment"},
                'cbc:Name': {'_text': "Down Payment"},
                'cac:ClassifiedTaxCategory': [
                    self._get_tax_category_node(vals, grouping_key)
                    for grouping_key in aggregated_tax_details
                    if grouping_key
                ],
            },
            'cac:Price': {
                'cbc:PriceAmount': {
                    '_text': '0',
                    'currencyID': currency_name,
                },
            },
        }

    # -------------------------------------------------------------------------
    # EXPORT: Document
    # -------------------------------------------------------------------------

    def _fill_document_values_invoice(self, vals):
        self._ubl_add_version_id_node(vals)
        self._ubl_add_customization_id_node(vals)
        self._ubl_add_profile_id_node(vals)
        self._ubl_add_id_node(vals)
        self._l10n_sa_add_uuid_node(vals)
        self._ubl_add_issue_date_node(vals)
        self._ubl_add_due_date_node(vals)
        self._ubl_add_invoice_type_code_node(vals)
        self._ubl_add_notes_nodes(vals)
        self._ubl_add_document_currency_code_node(vals)
        self._ubl_add_tax_currency_code_node(vals)
        self._ubl_add_buyer_reference_node(vals)
        self._ubl_add_order_reference_node(vals)
        self._ubl_add_billing_reference_nodes(vals)
        self._l10n_sa_add_additional_document_reference_nodes(vals)
        self._l10n_sa_add_signature_node(vals)
        self._ubl_add_accounting_supplier_party_node(vals)
        self._ubl_add_accounting_customer_party_node(vals)
        self._ubl_add_delivery_nodes(vals)
        self._ubl_add_payment_means_nodes(vals)
        self._ubl_add_payment_terms_nodes(vals)
        self._ubl_add_allowance_charge_nodes(vals)
        self._ubl_add_invoice_line_nodes(vals)
        self._ubl_add_tax_totals_nodes(vals)
        self._ubl_add_legal_monetary_total_node(vals)
