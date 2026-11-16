# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, _
from odoo.tools import float_is_zero

ANZ_TAX_CATEGORIES = {'S', 'E', 'Z', 'G', 'O'}


class AccountEdiXmlPint_Anz(models.AbstractModel):
    """ Australia & New Zealand implementation of Peppol International (PINT) model for Billing (PINT A-NZ).

    PINT A-NZ is a specialization of the Peppol International model (PINT), not a CIUS of the European norm EN 16931
    nor of Peppol BIS Billing 3.0 (its CustomizationID is 'urn:peppol:pint:billing-1@aunz-1'): it inherits the generic
    PINT layer ('account.edi.ubl_pint') and only adds the PINT A-NZ rules (aligned-ibrp-*-aunz, aligned-ibr-*-aunz).

    * PINT Official documentation: https://docs.peppol.eu/poac/pint/pint/
    * PINT A-NZ Official documentation: https://docs.peppol.eu/poac/aunz/pint-aunz/
    """
    _name = 'account.edi.xml.pint_anz'
    _inherit = ["account.edi.ubl_pint"]
    _description = "Australia & New Zealand implementation of Peppol International (PINT) model for Billing"

    def _export_invoice_filename(self, invoice):
        # EXTENDS account_edi_ubl
        return f"{invoice.name.replace('/', '_')}_pint_anz.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl_pint
        if process_type == 'billing':
            return 'urn:peppol:pint:billing-1@aunz-1'
        return None

    # -------------------------------------------------------------------------
    # EXPORT: Values
    # -------------------------------------------------------------------------

    def _export_get_document_type(self, invoice):
        # EXTENDS account.edi.common
        # PINT A-NZ only knows invoices and credit notes: a debit note is an invoice.
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
        if self._is_cash_rounding_base_line(base_line):
            return None

        grouping_key = super()._get_tax_category_grouping_key(base_line, tax_data, vals, currency)
        if not grouping_key:
            return

        # A business not registered for GST cannot issue tax invoices.
        # In this case, the tax category code should be O (Outside scope of tax).
        # See https://docs.peppol.eu/poac/aunz/pint-aunz/bis/#_tax_category_code
        supplier = vals['supplier']
        if not supplier.ref_company_ids[:1].l10n_au_is_gst_registered:
            grouping_key['tax_category_code'] = 'O'

        # As of PINT A-NZ v1.1.0: [aligned-ibrp-o-05-aunz] tax categories of type "Not Subject to tax" (i.e. tax_category_code == 'O') must NOT have
        # tax rate ('cbc:Percent').
        if (
            grouping_key['tax_category_code'] == 'O'
            and not grouping_key['percent']
        ):
            grouping_key['percent'] = None

        return grouping_key

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.ubl
        # Invoice line allowances (ibg-27) and charges (ibg-28).
        super()._ubl_add_line_allowance_charge_nodes(vals)
        self._ubl_add_line_allowance_charge_nodes_for_discount(vals)
        self._ubl_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(vals)
        self._ubl_add_line_allowance_charge_nodes_for_excise_taxes(vals)

    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_party_legal_entity_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        if commercial_partner.country_code in ('AU', 'NZ'):
            if commercial_partner.has_vat:
                vals['party_node']['cac:PartyLegalEntity'] = [{
                    'cbc:RegistrationName': {'_text': commercial_partner.name},
                    'cbc:CompanyID': {
                        '_text': commercial_partner.vat,
                        'schemeID': '0151' if commercial_partner.country_code == 'AU' else '0088',
                    },
                }]
            else:
                identifier_vals = partner._get_preferred_routing_identifier_vals()
                if identifier_vals:
                    vals['party_node']['cac:PartyLegalEntity'] = [{
                        'cbc:RegistrationName': {'_text': commercial_partner.name},
                        'cbc:CompanyID': {
                            '_text': identifier_vals['value'],
                            'schemeID': identifier_vals['scheme'],
                        },
                    }]

    # -------------------------------------------------------------------------
    # EXPORT: Constraints
    # -------------------------------------------------------------------------

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.ubl_pint
        constraints = super()._export_document_constraints(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return constraints

        document_node = vals['document_node']
        line_nodes = document_node.get('cac:InvoiceLine') or document_node.get('cac:CreditNoteLine') or []

        # Each invoice line has one and only one line tax information (ibg-30).
        if any(len(line_node['cac:Item']['cac:ClassifiedTaxCategory']) != 1 for line_node in line_nodes):
            constraints['anz_tax_line'] = _("Each invoice line shall have one and only one tax.")

        # [aligned-ibrp-o-11-aunz]..[aligned-ibrp-o-14-aunz] An invoice containing the tax category "Not subject to
        # tax" shall not contain any other tax category.
        line_tax_category_codes = {
            tax_category_node['cbc:ID']['_text']
            for line_node in line_nodes
            for tax_category_node in line_node['cac:Item']['cac:ClassifiedTaxCategory']
        }
        if 'O' in line_tax_category_codes and line_tax_category_codes != {'O'}:
            constraints['anz_tax_category_o'] = _("Taxes of category 'Service outside scope of tax' shall not be mixed with tax from other categories. You should split your invoice in two")

        # [ibr-057] Each Deliver to address (ibg-15) MUST contain a Deliver to country code (ibt-080).
        delivery_node = document_node['cac:Delivery']
        if delivery_node and not delivery_node['cac:DeliveryLocation']['cac:Address']['cac:Country']['cbc:IdentificationCode']['_text']:
            constraints['anz_delivery_address'] = self._check_required_fields(vals['delivery'], 'country_id')

        # Tax category must be filled on the line, with a value from A-NZ categories.
        tax_total_node = document_node['cac:TaxTotal'][0]
        for tax_subtotal_node in tax_total_node['cac:TaxSubtotal']:
            if any(tax_category_node['cbc:ID']['_text'] not in ANZ_TAX_CATEGORIES for tax_category_node in tax_subtotal_node['cac:TaxCategory']):
                constraints['anz_vat_category_required'] = _("You must set a tax category on each taxes of the invoice.\nValid categories are: S, E, Z, G, O")

        # Tax category of type "Not subject to tax" must have tax amount 0
        count_outside_of_scope_breakdown = 0
        for tax_subtotal in tax_total_node['cac:TaxSubtotal']:
            if any(tax_category_node['cbc:ID']['_text'] != 'O' for tax_category_node in tax_subtotal['cac:TaxCategory']):
                continue
            count_outside_of_scope_breakdown += 1

            if float_is_zero(tax_subtotal['cbc:TaxAmount']['_text'], precision_digits=2):
                continue

            if vals['supplier'].ref_company_ids[:1].l10n_au_is_gst_registered:
                constraints['anz_tax_breakdown_amount'] = \
                    self.env._("A tax category of type 'Not subject to tax' must have tax"
                               " amount set to 0")
            else:
                # If a company is not GST registered, this module remaps all tax categories
                # to 'O' (Other/Out of Scope). This causes an issue when a line contained a
                # non-zero tax, as it would create a tax subtotal with (Code: 'O', Amount:
                # non-zero), which violates PINT rules.
                # Since the code silently remaps tax classification code, the original error
                # message might be misleading for users. This constraint contains better
                # explaination of error and intructions on how to prevent it.
                constraints['anz_non_gst_supplier_tax_scope'] = \
                    self.env._("Suppliers not registered for GST cannot use taxes that are"
                               " not zero-rated. Please ensure the tax category is set to"
                               " 'O' (Services outside scope of tax) with a tax amount of 0.")

        # There should be at most one tax breakdown of type "Not subject to tax".
        if count_outside_of_scope_breakdown > 1 and vals['supplier'].ref_company_ids[:1].l10n_au_is_gst_registered:
            constraints['anz_duplicate_tax_breakdown'] = \
                self.env._("A tax breakdown of type 'Not subject to tax' should appear at most"
                           " once in the tax breakdown")

        # ALIGNED-IBR-001-AUNZ and ALIGNED-IBR-002-AUNZ
        for partner_type in ('supplier', 'customer'):
            partner = vals[partner_type]
            identifier_vals = partner._get_preferred_routing_identifier_vals()
            partner_eas = identifier_vals.get('scheme')
            if partner.country_code == 'AU' and partner_eas != '0151':
                constraints[f'au_{partner_type}_eas_0151'] = _("The Peppol EAS must be set to ABN (0151) if the partner country is Australia.")
            elif partner.country_code == 'NZ' and partner_eas != '0088':
                constraints[f'nz_{partner_type}_eas_0088'] = _("The Peppol EAS must be set to EAN (0088) if the partner country is New Zealand.")

        return constraints
