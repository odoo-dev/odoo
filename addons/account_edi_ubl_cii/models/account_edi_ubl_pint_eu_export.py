# -*- coding: utf-8 -*-

from odoo import _, api, models
from odoo.tools.misc import str2bool

from stdnum.no import mva


class AccountEdiUblPintEu(models.AbstractModel):
    _name = "account.edi.ubl_pint_eu"
    _inherit = 'account.edi.ubl_pint'
    _description = "UBL PINT EU"

    def _ubl_get_ubl_customization_id_node(self, vals):
        # OVERRIDE
        return {'_text': 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'}

    def _ubl_get_ubl_profile_id_node(self, vals):
        # OVERRIDE
        return {'_text': 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'}

    def _ubl_get_ubl_address_node(self, vals, partner_vals):
        # EXTENDS
        node = super()._ubl_get_ubl_address_node(vals, partner_vals)
        node['cbc:CountrySubentityCode'] = None
        node['cac:Country']['cbc:Name'] = None
        return node

    def _ubl_get_ubl_party_endpoint_id_node(self, vals, partner_vals):
        # OVERRIDE
        commercial_partner = partner_vals['commercial_partner']
        return {
            '_text': commercial_partner.peppol_endpoint,
            'schemeID': commercial_partner.peppol_eas,
        }

    def _ubl_get_ubl_party_tax_scheme_node(self, vals, partner_vals):
        # EXTENDS
        node = super()._ubl_get_ubl_party_tax_scheme_node(vals, partner_vals)
        commercial_partner = partner_vals['commercial_partner']
        if not node['cbc:CompanyID']['_text']:
            node['cbc:CompanyID']['_text'] = commercial_partner.peppol_endpoint
        if not node['cac:TaxScheme']['cbc:ID']['_text']:
            node['cac:TaxScheme']['cbc:ID']['_text'] = commercial_partner.peppol_eas
        return node

    def _ubl_get_ubl_party_legal_entity_node(self, vals, partner_vals):
        # EXTENDS
        node = super()._ubl_get_ubl_party_legal_entity_node(vals, partner_vals)
        commercial_partner = partner_vals['commercial_partner']
        if not node['cbc:CompanyID']['_text']:
            node['cbc:CompanyID']['_text'] = commercial_partner.peppol_endpoint
        node['cac:RegistrationAddress'] = None
        return node

    def _ubl_get_ubl_contact_node(self, vals, partner_vals):
        # EXTENDS
        node = super()._ubl_get_ubl_contact_node(vals, partner_vals)
        node['cbc:ID']['_text'] = None
        return node

    def _ubl_get_ubl_payment_means_payee_financial_account_institution_node(self, vals):
        # EXTENDS
        node = super()._ubl_get_ubl_payment_means_payee_financial_account_institution_node(vals)
        if not node:
            return node

        node['cac:FinancialInstitution']['_text'] = None
        node['cbc:ID']['schemeID'] = None
        return node

    def _get_ubl_tax_total_nodes(self, vals):
        # OVERRIDE
        company_currency = vals['company_currency']
        currency = vals['currency']
        nodes = self._get_ubl_tax_total_foreign_currency_nodes(vals)
        if currency != company_currency:
            nodes += [
                {
                    **tax_total_node,
                    'cac:TaxSubtotal': [],
                }
                for tax_total_node in self._get_ubl_tax_total_company_currency_nodes(vals)
            ]
        return nodes

    def _ubl_get_line_tax_total_nodes(self, vals, base_line, index):
        # OVERRIDE
        return []

    def _export_invoice_prepare_values(self, vals, invoice):
        super()._export_invoice_prepare_values(vals, invoice)
        AccountTax = self.env['account.tax']

        self._ubl_add_values_company(vals, invoice.company_id)
        self._ubl_add_values_currency(vals, invoice.currency_id)
        self._ubl_add_values_supplier(vals)
        self._ubl_add_values_customer(vals, invoice.partner_id)
        self._ubl_add_values_delivery(vals, invoice.partner_shipping_id or invoice.partner_id)
        self._ubl_add_values_payee_financial_account(vals, invoice.partner_bank_id)
        self._ubl_add_values_payment_term(vals, invoice.invoice_payment_term_id)

        # Negative price_unit are not allowed.
        self._ubl_turn_base_lines_price_unit_as_always_positive(vals)

        # Manage taxes for emptying.
        self._ubl_turn_emptying_taxes_as_new_base_lines(vals)

        # Global rounding of tax_details using 6 digits.
        company = vals['company']
        AccountTax._round_raw_total_excluded(vals['base_lines'], company)
        AccountTax._round_raw_total_excluded(vals['base_lines'], company, in_foreign_currency=False)
        AccountTax._add_and_round_raw_gross_total_excluded_and_discount(vals['base_lines'], company)
        AccountTax._add_and_round_raw_gross_total_excluded_and_discount(vals['base_lines'], company, in_foreign_currency=False)

        # Turn recycling contribution taxes such as RECUPEL / AUVIBEL into allowance/charges.
        self._ubl_add_base_line_ubl_values_allowance_charges_recycling_contribution(vals)

        # Turn belgium excises taxes into allowance/charges.
        self._ubl_add_base_line_ubl_values_allowance_charges_excise(vals)

        # Turn 'discount' field into allowance/charges.
        self._ubl_add_base_line_ubl_values_allowance_charges_discount(vals)

        # Add 'line_extension_amount' being the total without tax.
        self._ubl_add_base_line_ubl_values_line_extension_amount(vals)

        # Add 'price_amount' being the original price unit without tax.
        self._ubl_add_base_line_ubl_values_price(vals)

        # Add 'item' being information about item taxes.
        self._ubl_add_base_line_ubl_values_item(vals)

        # Add 'tax_totals'.
        self._ubl_add_values_tax_totals(vals)

        # Add 'payable_rounding_amount' to manage cash rounding.
        self._ubl_add_values_payable_rounding_amount(vals)

        # Add 'allowance_charge_early_payment' to manage the early payment discount.
        self._ubl_add_values_allowance_charge_early_payment(vals)