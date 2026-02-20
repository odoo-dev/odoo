from odoo import models


class AccountEdiUBLPintCreditNote(models.AbstractModel):
    _name = "account.edi.ubl_pint_credit_note"
    _inherit = 'account.edi.ubl_pint'
    _description = "UBL PINT Credit Note"

    def _ubl_add_id_node(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_id_node(vals)
        self._ubl_invoice_update_id_node(vals)

    def _ubl_add_issue_date_node(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_issue_date_node(vals)
        self._ubl_invoice_update_issue_date_node(vals)

    def _ubl_add_due_date_node(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_due_date_node(vals)
        self._ubl_invoice_update_due_date_node(vals)

    def _ubl_add_invoice_type_code_node(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_invoice_type_code_node(vals)
        vals['document_node']['cbc:InvoiceTypeCode']['_text'] = 381

    def _ubl_add_notes_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_notes_nodes(vals)
        self._ubl_invoice_update_notes_node(vals)

    def _ubl_add_order_reference_node(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_order_reference_node(vals)
        self._ubl_invoice_update_order_reference_node(vals)

    def _ubl_get_delivery_node_from_delivery_address(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)
        self._ubl_invoice_update_delivery_node_from_delivery_address(vals, node)
        return node

    def _ubl_add_invoice_delivery_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_invoice_delivery_nodes(vals)
        self._ubl_invoice_update_delivery_nodes(vals)

    def _ubl_add_billing_reference_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
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

        # TODO PINT-EU:
        # [NL-R-001] For suppliers in the Netherlands, if the document is a creditnote, the document MUST
        # contain an invoice reference (cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID)
        if (
            vals['supplier'].country_code == 'NL'
            and vals['document_type'] == 'credit_note'
            and credit_note.ref
            and not nodes
        ):
            nodes.append({
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {'_text': credit_note.ref},
                }
            })

    def _ubl_add_payment_means_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_payment_means_nodes(vals)
        self._ubl_invoice_update_add_payment_means_nodes(vals)

    def _ubl_add_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_allowance_charge_nodes(vals)
        self._ubl_invoice_update_add_allowance_charge_nodes(vals)

    def _ubl_add_legal_monetary_total_payable_rounding_amount_node(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_legal_monetary_total_payable_rounding_amount_node(vals)
        self._ubl_invoice_update_legal_monetary_total_payable_rounding_amount_node(vals)

    def _ubl_add_legal_monetary_total_prepaid_payable_amount_node(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_legal_monetary_total_prepaid_payable_amount_node(vals)
        self._ubl_invoice_update_legal_monetary_total_prepaid_payable_amount_node(vals)
