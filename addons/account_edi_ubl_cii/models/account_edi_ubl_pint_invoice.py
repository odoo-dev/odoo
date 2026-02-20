from odoo import models


class AccountEdiUBLPintInvoice(models.AbstractModel):
    _name = "account.edi.ubl_pint_invoice"
    _inherit = 'account.edi.ubl_pint'
    _description = "UBL PINT Invoice"

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
        vals['document_node']['cbc:InvoiceTypeCode']['_text'] = 380

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

    def _ubl_add_payment_means_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_payment_means_nodes(vals)
        self._ubl_invoice_update_add_payment_means_nodes(vals)

    def _ubl_add_payment_terms_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_payment_terms_nodes(vals)
        self._ubl_invoice_update_add_payment_terms_nodes(vals)

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
