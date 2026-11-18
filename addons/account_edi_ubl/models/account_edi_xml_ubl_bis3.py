from stdnum.no import mva
from stdnum.be import vat as be_vat

from odoo import _, api, models

CHORUS_PRO_SIRET = "11000201100044"


class AccountEdiXmlUBLBIS3(models.AbstractModel):
    """ Peppol BIS Billing 3.0.

    Peppol BIS Billing 3.0 is a CIUS of the European norm EN 16931 in the UBL syntax. It shares its semantic model with
    PINT EU ('account.edi.ubl_pint_eu', which holds the Peppol rules common to both, including the national rules) and
    only differs by its identifiers and a few extra Peppol rules.

    * Specification: https://docs.peppol.eu/poacc/billing/3.0/
    * Validation artefacts: https://github.com/OpenPEPPOL/peppol-bis-invoice-3
    * EHF Billing 3.0 (Norway) is Peppol BIS Billing 3.0 without extension:
      https://anskaffelser.dev/postaward/g3/spec/current/billing-3.0/norway/#_implementation

    The Peppol Order transaction (used by the sale/purchase modules) is defined on 'account.edi.ubl_order'.
    """
    _name = "account.edi.xml.ubl_bis3"
    _inherit = ['account.edi.ubl_pint_eu']
    _description = "UBL BIS Billing 3.0.12"

    @api.model
    def _is_customer_behind_chorus_pro(self, customer):
        return customer.routing_scheme and customer.routing_endpoint and f"{customer.routing_scheme}:{customer.routing_endpoint}" == f'0009:{CHORUS_PRO_SIRET}'

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_ubl_bis3.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl_pint_eu
        if process_type == 'billing':
            return 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'
        if process_type == 'selfbilling':
            return 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0'
        return None

    def _ubl_add_profile_id_node(self, vals):
        # EXTENDS account.edi.ubl_pint_eu
        super()._ubl_add_profile_id_node(vals)
        if self._is_document(vals, 'invoice', 'credit_note'):
            vals['document_node']['cbc:ProfileID']['_text'] = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'
        elif self._is_document(vals, 'self_invoice', 'self_credit_note'):
            vals['document_node']['cbc:ProfileID']['_text'] = 'urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0'

    def _ubl_bis3_report_tax_accounting_currency(self, vals):
        """ Whether the VAT accounting currency (cbc:TaxCurrencyCode, BT-6) and the cac:TaxTotal in that currency
        (BT-111) are reported when the invoice is in a foreign currency. Some national CIUS of Peppol BIS don't allow
        them (A-NZ, NLCIUS, SG, XRechnung). """
        return True

    def _ubl_add_tax_currency_code_node(self, vals):
        # EXTENDS account.edi.ubl_pint_eu
        if not self._ubl_bis3_report_tax_accounting_currency(vals):
            self._ubl_add_tax_currency_code_node_empty(vals)
            return
        super()._ubl_add_tax_currency_code_node(vals)

    def _ubl_tax_totals_node_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.ubl_pint_eu
        tax_total_keys = super()._ubl_tax_totals_node_grouping_key(base_line, tax_data, vals, currency)

        # No cac:TaxTotal in company currency when the VAT accounting currency is not reported.
        company_currency = vals['company'].currency_id
        if (
            not self._ubl_bis3_report_tax_accounting_currency(vals)
            and tax_total_keys['tax_total_key']
            and company_currency != vals['currency']
            and tax_total_keys['tax_total_key']['currency'] == company_currency
        ):
            tax_total_keys['tax_total_key'] = None

        return tax_total_keys

    def _ubl_bis3_trim_line_allowance_charge_discount_node(self, discount_node):
        """ Helper for the national CIUS of Peppol BIS (A-NZ, SG, XRechnung) reporting the line discount (BG-27) by
        its amount only: without reason, percentage (BT-138) nor base amount (BT-137). """
        discount_node['cbc:AllowanceChargeReason'] = None
        discount_node['cbc:MultiplierFactorNumeric'] = None
        discount_node['cbc:BaseAmount'] = None
        return discount_node

    # -------------------------------------------------------------------------
    # EXPORT: Constraints
    # -------------------------------------------------------------------------

    def _export_document_constraints(self, vals):
        """ Peppol rules (PEPPOL-EN16931-UBL.sch), including the national rules
        (https://docs.peppol.eu/poacc/billing/3.0/bis/#national_rules), which always refer to the supplier's country.
        """
        # EXTENDS account.edi.ubl_pint_eu
        constraints = super()._export_document_constraints(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return constraints

        supplier = vals['supplier']
        customer = vals['customer']

        if supplier.country_id.code == 'NO':
            tax_scheme_nodes = vals['document_node']['cac:AccountingSupplierParty']['cac:Party']['cac:PartyTaxScheme']
            vat = tax_scheme_nodes[0]['cbc:CompanyID']['_text'] if tax_scheme_nodes else None
            # NO-R-001: For Norwegian suppliers, a VAT number MUST be the country code prefix NO followed by a
            # valid Norwegian organization number (nine numbers) followed by the letters MVA.
            # Note: mva.is_valid("179728982MVA") is True while it lacks the NO prefix
            if not vat or not mva.is_valid(vat) or len(vat) != 14 or vat[:2] != 'NO' or vat[-3:] != 'MVA':
                constraints['no_r_001'] = _("The VAT number of the supplier does not seem to be valid. It should be of the form: NO179728982MVA.")

        # PEPPOL-COMMON-R043: Belgian enterprise number (0208) must be valid.
        for partner, role in ((supplier, 'supplier'), (customer, 'customer')):
            if (
                partner.country_id.code == 'BE'
                and (be_en := partner._get_additional_identifier('BE_EN'))
                and not be_vat.is_valid(be_en)
            ):
                constraints[f'PEPPOL-COMMON-R043_{role}'] = _('%s should have a valid KBO/BCE number set as additional identifier (BE_EN).', partner.display_name)

        return constraints

