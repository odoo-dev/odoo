# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, _
from odoo.tools import float_is_zero


class AccountEdiXmlPint_My(models.AbstractModel):
    """ Malaysian implementation of Peppol International (PINT) model for Billing (PINT MY).

    PINT MY is a specialization of the Peppol International model (PINT), not a CIUS of the European norm EN 16931
    nor of Peppol BIS Billing 3.0 (its CustomizationID is 'urn:peppol:pint:billing-1@my-1'): it inherits the generic
    PINT layer ('account.edi.ubl_pint') and only adds the PINT MY rules (SST/TTx categories, ...).

    * PINT Official documentation: https://docs.peppol.eu/poac/pint/pint/
    * PINT MY Official documentation: https://docs.peppol.eu/poac/my/pint-my/
    """
    _name = 'account.edi.xml.pint_my'
    _inherit = ["account.edi.ubl_pint"]
    _description = "Malaysian implementation of Peppol International (PINT) model for Billing"

    def _export_invoice_filename(self, invoice):
        # EXTENDS account_edi_ubl
        return f"{invoice.name.replace('/', '_')}_pint_my.xml"

    def _export_get_document_type(self, invoice):
        # EXTENDS account.edi.common
        # PINT MY only knows invoices and credit notes: a debit note is an invoice.
        document_type = super()._export_get_document_type(invoice)
        if document_type == 'debit_note':
            return 'invoice'
        return document_type

    def _init_invoice_export_values(self, invoice):
        # EXTENDS account.edi.ubl
        vals = super()._init_invoice_export_values(invoice)
        # [ibr-027] The Item net price (ibt-146) MUST NOT be negative.
        self._turn_price_unit_positive(vals)
        return vals

    # -------------------------------------------------------------------------
    # EXPORT: Templates
    # -------------------------------------------------------------------------

    def _get_tax_category_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.common

        # The cash rounding is reported as the Rounding amount (ibt-114), not as a tax breakdown.
        # In malaysia, tax on good is paid at the manufacturer level. It is thus common to invoice without taxes,
        # unless invoicing for a service.
        if not tax_data or self._is_cash_rounding_base_line(base_line):
            return

        grouping_key = super()._get_tax_category_grouping_key(base_line, tax_data, vals, currency)
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

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl_pint
        if process_type == 'billing':
            return 'urn:peppol:pint:billing-1@my-1'
        return None

    def _ubl_add_tax_totals_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_tax_totals_nodes(vals)
        nodes = vals['document_node']['cac:TaxTotal']

        if not nodes:
            tax_total_node = self._ubl_get_tax_total_node(vals, {
                'currency': vals['currency'],
                'amount': 0.0,
                'subtotals': {},
            })
            nodes.append(tax_total_node)

    def _ubl_add_party_tax_scheme_nodes(self, vals):
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

    def _ubl_add_accounting_supplier_party_tax_scheme_nodes(self, vals):
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

    # -------------------------------------------------------------------------
    # EXPORT: Constraints
    # -------------------------------------------------------------------------

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.ubl_pint
        constraints = super()._export_document_constraints(vals)

        # A tax category "Outside of tax scope" can only have an amount of 0.
        for tax_total_node in vals['document_node']['cac:TaxTotal']:
            for tax_subtotal_node in tax_total_node['cac:TaxSubtotal']:
                for tax_category_node in tax_subtotal_node['cac:TaxCategory']:
                    if (
                        tax_category_node['cbc:ID']['_text'] == 'O'
                        and not float_is_zero(tax_subtotal_node['cbc:TaxAmount']['_text'], precision_digits=2)
                    ):
                        constraints['peppol_my_sst_registration'] = _(
                            "If your business is registered for SST, please provide your registration number in your company details.\n"
                            "Otherwise, you are not allowed to charge sales or services taxes in the e-Invoice."
                        )
                        break

        # In malaysia, tax on good is paid at the manufacturer level. It is thus common to invoice without taxes,
        # unless invoicing for a service.
        constraints.pop('tax_on_line', '')

        return constraints

    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _import_ubl_invoice_add_customer_values(self, collected_values):
        # EXTENDS account.edi.ubl; Prioritize PartyLegalEntity when inferring the supplier tax identifier.
        super()._import_ubl_invoice_add_customer_values(collected_values)
        odoo_document_type = collected_values['odoo_document_type']
        party_tag = "AccountingCustomerParty" if odoo_document_type == 'sale' else "AccountingSupplierParty"
        tree = collected_values['tree']
        party_legal_entity_node = tree.find(f"./{{*}}{party_tag}/{{*}}Party/{{*}}PartyLegalEntity")
        if party_legal_entity_node is None:
            return
        collected_values['customer_values']['vat'] = party_legal_entity_node.findtext("./{*}CompanyID")
