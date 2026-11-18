# -*- coding: utf-8 -*-
from odoo import models


class AccountEdiXmlUbl_Sg(models.AbstractModel):
    _name = 'account.edi.xml.ubl_sg'
    _inherit = ["account.edi.xml.ubl_bis3"]
    _description = "SG BIS Billing 3.0"

    """
    Documentation: https://www.peppolguide.sg/billing/bis/
    """

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_sg.xml"

    # -------------------------------------------------------------------------
    # EXPORT: Templates
    # -------------------------------------------------------------------------

    def _get_customization_id(self, process_type='billing'):
        if process_type == 'billing':
            return 'urn:cen.eu:en16931:2017#conformant#urn:fdc:peppol.eu:2017:poacc:billing:international:sg:3.0'

    def _get_tax_category_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.xml.ubl_bis3
        grouping_key = super()._get_tax_category_grouping_key(base_line, tax_data, vals, currency)
        if not grouping_key:
            return

        grouping_key['tax_exemption_reason'] = None
        grouping_key['tax_exemption_reason_code'] = None

        # For reference: https://www.peppolguide.sg/billing/bis/#_gst_category_codes
        if not tax_data or tax_data['tax'].amount == 0.0:
            grouping_key['tax_category_code'] = 'ZR'
        else:
            grouping_key['tax_category_code'] = 'SR'

        return grouping_key

    def _ubl_get_line_allowance_charge_discount_node(self, vals, discount_values):
        # EXTENDS account.edi.xml.ubl_bis3
        discount_node = super()._ubl_get_line_allowance_charge_discount_node(vals, discount_values)
        return self._ubl_bis3_trim_line_allowance_charge_discount_node(discount_node)

    def _ubl_bis3_report_tax_accounting_currency(self, vals):
        # EXTENDS account.edi.xml.ubl_bis3
        return False

    def _ubl_add_payment_means_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl_bis3
        super()._ubl_add_payment_means_nodes(vals)
        # https://www.peppolguide.sg/billing/bis/#_payment_means_information
        vals['document_node']['cac:PaymentMeans'][0]['cbc:PaymentMeansCode'] = {
            '_text': 54,
            'name': 'Credit Card',
        }
