from odoo import models
from odoo.addons.account_edi_ubl_cii.models.account_edi_common import documents


class AccountEdiUBLPintMYInvoice(models.AbstractModel):
    _name = "account.edi.ubl_pint_my"
    _inherit = 'account.edi.ubl_pint'
    _description = "UBL PINT MY Invoice"

    @documents(['invoice', 'credit_note'])
    def _ubl_add_customization_id_node__pint_my(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_customization_id_node(vals)
        vals['document_node']['cbc:CustomizationID']['_text'] = 'urn:peppol:pint:billing-1@my-1'

    @documents(['invoice', 'credit_note'])
    def _ubl_add_profile_id_node__pint_my(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_profile_id_node(vals)
        vals['document_node']['cbc:ProfileID']['_text'] = 'urn:peppol:bis:billing'

    @documents(['invoice', 'credit_note'])
    def _ubl_default_tax_category_grouping_key__pint_my(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.ubl_pint
        # In Malaysia, tax on goods is paid at the manufacturer level. It is thus common to invoice without taxes,
        # unless invoicing for a service.
        if not tax_data:
            return

        grouping_key = super()._ubl_default_tax_category_grouping_key(base_line, tax_data, vals, currency)
        if not grouping_key:
            return

        # If a business is not registered for SST and/or TTx, the business is not allowed to charge sales tax,
        # service tax or tourism tax in the e-Invoice.
        # In this case, the tax category code should be 'O' (Outside scope of tax).
        # For now, we do not properly support Tourism tax (TTx) due to a lack of clarity on the subject.
        supplier = vals['supplier']
        if not supplier.sst_registration_number:
            grouping_key['tax_category_code'] = 'O'
        elif tax_data['tax'].amount != 0:
            grouping_key['tax_category_code'] = 'T'
        else:
            grouping_key['tax_category_code'] = 'E'

        return grouping_key

    @documents(['invoice', 'credit_note'])
    def _ubl_add_party_tax_scheme_nodes__pint_my(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_party_tax_scheme_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        if commercial_partner.country_code == 'MY':
            vals['party_node']['cac:PartyTaxScheme'] = [{
                'cbc:CompanyID': {'_text': commercial_partner.sst_registration_number or 'NA'},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'NOT_EU_VAT'},
                },
            }]

    @documents(['invoice', 'credit_note'])
    def _ubl_add_accounting_supplier_party_tax_scheme_nodes__pint_my(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_accounting_supplier_party_tax_scheme_nodes(vals)
        nodes = vals['party_node']['cac:PartyTaxScheme']
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        if commercial_partner.country_code == 'MY':
            nodes.append({
                'cbc:CompanyID': {'_text': commercial_partner.vat or 'NA'},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'GST'},
                },
            })
