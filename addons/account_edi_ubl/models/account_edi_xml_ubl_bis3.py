from markupsafe import Markup
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

    The Peppol Order transaction (https://docs.peppol.eu/poacc/upgrade-3/syntax/Order/tree/) helpers, used by the
    sale/purchase modules, are also defined here.
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

    # -------------------------------------------------------------------------
    # Sale/Purchase Order: Import
    # -------------------------------------------------------------------------

    def _import_order_payment_terms_id(self, company_id, tree, xpath):
        """ Return payment term name from given tree and try to find a match. """
        payment_term_name = self._find_value(xpath, tree)
        if not payment_term_name:
            return False
        payment_term_domain = self.env['account.payment.term']._check_company_domain(company_id)
        payment_term_domain.append(('name', '=', payment_term_name))
        return self.env['account.payment.term'].search(payment_term_domain, limit=1)

    def _retrieve_order_vals(self, order, tree):
        order_vals = {}
        logs = []

        order_vals['date_order'] = tree.findtext('.//{*}EndDate') or tree.findtext('.//{*}IssueDate')
        order_vals['note'] = self._import_description(tree, xpaths=['./{*}Note'])
        order_vals['payment_term_id'] = self._import_order_payment_terms_id(order.company_id, tree, './/cac:PaymentTerms/cbc:Note')
        order_vals['currency_id'], currency_logs = self._import_currency(tree, './/{*}DocumentCurrencyCode')

        logs += currency_logs
        return order_vals, logs

    def _import_order_ubl(self, order, file_data, new):
        """ Common importing method to extract order data from file_data.
        :param order: Order to fill details from file_data.
        :param file_data: File data to extract order related data from.
        :return: True if there's no exception while extraction.
        :rtype: Boolean
        """
        tree = file_data['xml_tree']

        # Update the order.
        order_vals, logs = self._retrieve_order_vals(order, tree)
        if order:
            order.write(order_vals)
            order.message_post(body=Markup("<strong>%s</strong>") % _("Format used to import the document: %s", self._description))
            if logs:
                order._create_activity_set_details(Markup("<ul>%s</ul>") % Markup().join(Markup("<li>%s</li>") % l for l in logs))
