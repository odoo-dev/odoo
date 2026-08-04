# -*- coding: utf-8 -*-

from odoo import models


class AccountEdiXmlUbl_A_Nz(models.AbstractModel):
    _name = 'account.edi.xml.ubl_a_nz'
    _inherit = ["account.edi.ubl_pint"]
    _description = "PINT A-NZ"

    """
    * Documentation: https://github.com/A-NZ-PEPPOL/A-NZ-PEPPOL-BIS-3.0/tree/master/Specifications
    """

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_a_nz.xml"

    # -------------------------------------------------------------------------
    # EXPORT: Templates
    # -------------------------------------------------------------------------

    def _get_customization_id(self, process_type='billing'):
        if process_type == 'billing':
            return 'urn:peppol:pint:billing-1@aanz-1'

    def _ubl_add_customization_id_node(self, vals):
        # EXTENDS account.edi.xml.ubl
        super()._ubl_add_customization_id_node(vals)
        vals['document_node']['cbc:CustomizationID']['_text'] = 'urn:peppol:pint:billing-1@aanz-1'

    def _ubl_get_line_allowance_charge_discount_node(self, vals, discount_values):
        # EXTENDS account.edi.xml.ubl
        discount_node = super()._ubl_get_line_allowance_charge_discount_node(vals, discount_values)
        discount_node['cbc:AllowanceChargeReason'] = None
        discount_node['cbc:MultiplierFactorNumeric'] = None
        discount_node['cbc:BaseAmount'] = None
        return discount_node

    def _ubl_tax_totals_node_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.xml.ubl
        tax_total_keys = super()._ubl_tax_totals_node_grouping_key(base_line, tax_data, vals, currency)

        company_currency = vals['company'].currency_id
        if (
            tax_total_keys['tax_total_key']
            and company_currency != vals['currency']
            and tax_total_keys['tax_total_key']['currency'] == company_currency
        ):
            tax_total_keys['tax_total_key'] = None

        return tax_total_keys

    def _export_document_node_constraints(self, vals):
        return super().export_constrains()
