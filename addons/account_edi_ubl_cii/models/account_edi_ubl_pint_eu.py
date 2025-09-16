# -*- coding: utf-8 -*-
from markupsafe import Markup
from typing import Literal

from odoo import models, _
from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_ubl_cii.models.account_edi_xml_ubl_20 import UBL_NAMESPACES

from stdnum.no import mva


class AccountEdiUblPintEu(models.AbstractModel):
    _name = 'account.edi.ubl_pint_eu'
    _inherit = ['account.edi.ubl_pint']
    _description = "PINT-EU"

    # -------------------------------------------------------------------------
    # EXPORT HELPERS
    # -------------------------------------------------------------------------

    def _is_root_company(self, company):
        # OVERRIDE
        return company.peppol_eas and company.peppol_endpoint

    # -------------------------------------------------------------------------
    # EXPORT SELF INVOICE
    # -------------------------------------------------------------------------

    def _add_self_invoice_type_code_nodes(self, collected_values):
        collected_values['cbc:InvoiceTypeCode'] = {'_text': 389}

    def _add_self_invoice_accounting_supplier_party(self, collected_values):
        self._add_invoice_accounting_supplier_party(collected_values, partner=collected_values['_customer'])

    def _add_self_invoice_accounting_customer_party(self, collected_values):
        self._add_invoice_accounting_customer_party(collected_values, partner=collected_values['_supplier'])

    def _add_self_invoice_delivery_nodes(self, collected_values):
        self._add_invoice_delivery_nodes(collected_values, partner=collected_values['_customer'])

    # -------------------------------------------------------------------------
    # EXPORT INVOICE
    # -------------------------------------------------------------------------

    def _export_invoice(self, invoice):
        collected_values = {}
        self._add_common_company_values(collected_values, invoice.company_id)
        self._add_common_currency_values(collected_values, invoice.currency_id)
        self._add_common_supplier_values(collected_values)
        self._add_common_customer_values(collected_values, invoice.partner_id)
        self._add_common_invoice_values(collected_values, invoice)

        if invoice.is_purchase_document() and invoice.journal_id.is_self_billing:
            collected_values['_invoice_type'] = 'self_billing'

        invoice_type = collected_values['_invoice_type']

        self._add_invoice_id_nodes(collected_values)
        self._add_invoice_issue_date_nodes(collected_values)

        if invoice_type == 'self_billing':
            self._add_self_invoice_type_code_nodes(collected_values)
        else:
            self._add_invoice_type_code_nodes(collected_values)

        self._add_invoice_note_nodes(collected_values)
        self._add_document_currency_code_nodes(collected_values)
        self._add_invoice_order_reference_nodes(collected_values)

        if invoice_type == 'self_billing':
            self._add_self_invoice_accounting_supplier_party(collected_values)
            self._add_self_invoice_accounting_customer_party(collected_values)
            self._add_self_invoice_delivery_nodes(collected_values)
        else:
            self._add_invoice_accounting_supplier_party(collected_values)
            self._add_invoice_accounting_customer_party(collected_values)
            self._add_invoice_delivery_nodes(collected_values)

        self._add_invoice_payment_means_nodes(collected_values)
        self._add_invoice_payment_terms_nodes(collected_values)

        if invoice_type in ('out_invoice', 'self_billing'):
            invoice_line_tag = 'cac:InvoiceLine'
            quantity_tag = 'cbc:InvoicedQuantity'
            monetary_total_tag = 'cac:LegalMonetaryTotal'
        elif invoice_type == 'out_refund':
            invoice_line_tag = 'cac:CreditNoteLine'
            quantity_tag = 'cbc:CreditedQuantity'
            monetary_total_tag = 'cac:LegalMonetaryTotal'
        else:  # if invoice_type == 'debit_note':
            invoice_line_tag = 'cac:DebitNoteLine'
            quantity_tag = 'cbc:DebitedQuantity'
            monetary_total_tag = 'cac:RequestedMonetaryTotal'

        invoice_line_nodes = collected_values['_invoice_line_nodes'] = collected_values[invoice_line_tag] = []
        for invoice_line_node in self._get_base_lines_values(collected_values):
            base_line = invoice_line_node['_base_line']
            if base_line['special_type'] in ('cash_rounding', 'early_payment'):
                continue

            invoice_line_nodes.append(invoice_line_node)
            self._add_invoice_line_id_nodes(collected_values, invoice_line_node)
            self._add_invoice_line_quantity_nodes(collected_values, invoice_line_node, quantity_tag)
            self._add_invoice_line_extension_amount_nodes(collected_values, invoice_line_node)
            self._add_invoice_line_allowance_charge_nodes(collected_values, invoice_line_node)
            self._add_invoice_line_tax_total_nodes(collected_values, invoice_line_node)
            self._add_invoice_line_item_nodes(collected_values, invoice_line_node)
            self._add_invoice_line_item_classified_tax_category_nodes(collected_values, invoice_line_node)
            self._add_invoice_line_price_nodes(collected_values, invoice_line_node)

        self._add_invoice_allowance_charge_nodes(collected_values)
        self._add_invoice_tax_total_nodes(collected_values)
        self._add_invoice_monetary_total_nodes(collected_values, monetary_total_tag)
