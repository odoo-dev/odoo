# -*- coding: utf-8 -*-

from odoo import models


class AccountEdiXmlUbl_A_Nz(models.AbstractModel):
    _name = 'account.edi.xml.ubl_a_nz'
    _inherit = ["account.edi.xml.ubl_bis3"]
    _description = "A-NZ BIS Billing 3.0"

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
            return 'urn:cen.eu:en16931:2017#conformant#urn:fdc:peppol.eu:2017:poacc:billing:international:aunz:3.0'

    def _ubl_get_line_allowance_charge_discount_node(self, vals, discount_values):
        # EXTENDS account.edi.xml.ubl_bis3
        discount_node = super()._ubl_get_line_allowance_charge_discount_node(vals, discount_values)
        return self._ubl_bis3_trim_line_allowance_charge_discount_node(discount_node)

    def _ubl_bis3_report_tax_accounting_currency(self, vals):
        # EXTENDS account.edi.xml.ubl_bis3
        return False

