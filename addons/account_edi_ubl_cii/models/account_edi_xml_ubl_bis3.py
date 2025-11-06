# -*- coding: utf-8 -*-

from odoo import _, fields, models, Command
from odoo.tools import frozendict
from odoo.tools.misc import formatLang, str2bool
from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_ubl_cii.models.account_edi_common import UOM_TO_UNECE_CODE
from odoo.addons.account_edi_ubl_cii.models.account_edi_xml_ubl_20 import FloatFmt, UBL_NAMESPACES

from datetime import datetime
from stdnum.no import mva


class AccountEdiXmlUbl_Bis3(models.AbstractModel):
    _name = 'account.edi.xml.ubl_bis3'
    _inherit = ['account.edi.xml.ubl_21']
    _description = "UBL BIS Billing 3.0.12"

    """
    * Documentation of EHF Billing 3.0: https://anskaffelser.dev/postaward/g3/
    * EHF 2.0 is no longer used:
      https://anskaffelser.dev/postaward/g2/announcement/2019-11-14-removal-old-invoicing-specifications/
    * Official doc for EHF Billing 3.0 is the OpenPeppol BIS 3 doc +
      https://anskaffelser.dev/postaward/g3/spec/current/billing-3.0/norway/

        "Based on work done in PEPPOL BIS Billing 3.0, Difi has included Norwegian rules in PEPPOL BIS Billing 3.0 and
        does not see a need to implement a different CIUS targeting the Norwegian market. Implementation of EHF Billing
        3.0 is therefore done by implementing PEPPOL BIS Billing 3.0 without extensions or extra rules."

    Thus, EHF 3 and Bis 3 are actually the same format. The specific rules for NO defined in Bis 3 are added in Bis 3.
    """

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_ubl_bis3.xml"

    def _export_invoice_ecosio_schematrons(self):
        return {
            'invoice': 'eu.peppol.bis3:invoice:3.13.0',
            'credit_note': 'eu.peppol.bis3:creditnote:3.13.0',
        }

    def _get_country_vals(self, country):
        # EXTENDS account.edi.xml.ubl_21
        vals = super()._get_country_vals(country)

        vals.pop('name', None)

        return vals

    def _get_partner_party_tax_scheme_vals_list(self, partner, role):
        # EXTENDS account.edi.xml.ubl_21
        vals_list = super()._get_partner_party_tax_scheme_vals_list(partner, role)

        if not partner.vat:
            return [{
                'company_id': partner.peppol_endpoint,
                'tax_scheme_vals': {'id': partner.peppol_eas},
            }]

        for vals in vals_list:
            vals.pop('registration_name', None)
            vals.pop('registration_address_vals', None)

        # sources:
        #  https://anskaffelser.dev/postaward/g3/spec/current/billing-3.0/norway/#_applying_foretaksregisteret
        #  https://docs.peppol.eu/poacc/billing/3.0/bis/#national_rules (NO-R-002 (warning))
        if partner.country_id.code == "NO" and role == 'supplier':
            vals_list.append({
                'company_id': "Foretaksregisteret",
                'tax_scheme_vals': {'id': 'TAX'},
            })

        return vals_list

    def _get_partner_party_legal_entity_vals_list(self, partner):
        # EXTENDS account.edi.xml.ubl_21
        vals_list = super()._get_partner_party_legal_entity_vals_list(partner)

        for vals in vals_list:
            vals.pop('registration_address_vals', None)
            if partner.country_code == 'NL':
                # For NL, VAT can be used as a Peppol endpoint, but KVK/OIN has to be used as PartyLegalEntity/CompanyID
                # To implement a workaround on stable, company_registry field is used without recording whether
                # the number is a KVK or OIN, and the length of the number (8 = KVK, 9 = OIN) is used to determine the type
                nl_id = partner.company_registry if partner.peppol_eas not in ('0106', '0190') else partner.peppol_endpoint
                vals.update({
                    'company_id': nl_id,
                    'company_id_attrs': {'schemeID': '0190' if nl_id and len(nl_id) == 20 else '0106'},
                })
            if partner.country_id.code == "LU":
                if 'l10n_lu_peppol_identifier' in partner._fields and partner.l10n_lu_peppol_identifier:
                    vals['company_id'] = partner.l10n_lu_peppol_identifier
                elif partner.company_registry:
                    vals['company_id'] = partner.company_registry
            if partner.country_id.code == 'DK':
                # DK-R-014: For Danish Suppliers it is mandatory to specify schemeID as "0184" (DK CVR-number) when
                # PartyLegalEntity/CompanyID is used for AccountingSupplierParty
                vals['company_id_attrs'] = {'schemeID': '0184'}
            if partner.country_code == 'SE' and partner.company_registry:
                vals['company_id'] = ''.join(char for char in partner.company_registry if char.isdigit())
            if not vals['company_id']:
                vals['company_id'] = partner.peppol_endpoint

        return vals_list

    def _get_partner_contact_vals(self, partner):
        # EXTENDS account.edi.xml.ubl_21
        vals = super()._get_partner_contact_vals(partner)

        vals.pop('id', None)

        return vals

    def _get_partner_party_vals(self, partner, role):
        # EXTENDS account.edi.xml.ubl_21
        if (
            role == 'delivery'
            # If the user hasn't updated the module, we just don't render `DeliveryParty` because the UBL
            # to avoid generating an invalid UBL.
            and '<cac:Party>' not in self.env.ref('account_edi_ubl_cii.ubl_20_DeliveryType').arch
        ):
            return {
                'party_vals': {
                    'party_name_vals': [
                        {
                            'name': partner.display_name,
                        }
                    ],
                }
            }
        else:
            vals = super()._get_partner_party_vals(partner, role)

            partner = partner.commercial_partner_id
            vals.update({
                'endpoint_id': partner.peppol_endpoint,
                'endpoint_id_attrs': {'schemeID': partner.peppol_eas},
            })
            return vals

    def _get_partner_party_identification_vals_list(self, partner):
        # EXTENDS account.edi.xml.ubl_21
        vals = super()._get_partner_party_identification_vals_list(partner)

        if partner.country_code == 'NL' and partner.peppol_endpoint:
            # [UBL-SR-16] Buyer identifier shall occur maximum once
            if self._context.get('ubl_partner_role') == 'customer':
                vals = [{'id': partner.peppol_endpoint}]
            else:
                vals.append({
                    'id': partner.peppol_endpoint,
                })
        return vals

    def _get_delivery_vals_list(self, invoice):
        # EXTENDS account.edi.xml.ubl_21
        supplier = invoice.company_id.partner_id.commercial_partner_id
        customer = invoice.partner_id

        economic_area = self.env.ref('base.europe').country_ids.mapped('code') + ['NO']
        intracom_delivery = (customer.country_id.code in economic_area
                             and supplier.country_id.code in economic_area
                             and supplier.country_id != customer.country_id)

        # [BR-IC-12]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
        # "Intra-community supply" the Deliver to country code (BT-80) shall not be blank.

        # [BR-IC-11]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
        # "Intra-community supply" the Actual delivery date (BT-72) or the Invoicing period (BG-14)
        # shall not be blank.

        if intracom_delivery:
            partner_shipping = invoice.partner_shipping_id or customer

            return [{
                'actual_delivery_date': invoice.invoice_date,
                'delivery_location_vals': {
                    'delivery_address_vals': self._get_partner_address_vals(partner_shipping),
                },
                'delivery_party_vals': self._get_partner_party_vals(invoice.partner_shipping_id, 'delivery') if invoice.partner_shipping_id else {},
            }]

        return super()._get_delivery_vals_list(invoice)

    def _get_partner_address_vals(self, partner):
        # EXTENDS account.edi.xml.ubl_21
        vals = super()._get_partner_address_vals(partner)
        # schematron/openpeppol/3.13.0/xslt/CEN-EN16931-UBL.xslt
        # [UBL-CR-225]-A UBL invoice should not include the AccountingCustomerParty Party PostalAddress CountrySubentityCode
        vals.pop('country_subentity_code', None)
        return vals

    def _get_financial_institution_branch_vals(self, bank):
        # EXTENDS account.edi.xml.ubl_21
        vals = super()._get_financial_institution_branch_vals(bank)
        # schematron/openpeppol/3.13.0/xslt/CEN-EN16931-UBL.xslt
        # [UBL-CR-664]-A UBL invoice should not include the FinancialInstitutionBranch FinancialInstitution
        # xpath test: not(//cac:FinancialInstitution)
        vals.pop('id_attrs', None)
        vals.pop('financial_institution_vals', None)
        return vals

    def _get_invoice_payment_means_vals_list(self, invoice):
        # EXTENDS account.edi.xml.ubl_21
        vals_list = super()._get_invoice_payment_means_vals_list(invoice)

        for vals in vals_list:
            vals.pop('payment_due_date', None)
            vals.pop('instruction_id', None)
            if vals.get('payment_id_vals'):
                vals['payment_id_vals'] = vals['payment_id_vals'][:1]

        return vals_list

    def _get_tax_category_list(self, customer, supplier, taxes):
        # EXTENDS account.edi.xml.ubl_21
        vals_list = super()._get_tax_category_list(customer, supplier, taxes)

        for vals in vals_list:
            vals.pop('name', None)

        return vals_list

    def _get_invoice_tax_totals_vals_list(self, invoice, taxes_vals):
        # EXTENDS account.edi.xml.ubl_21
        vals_list = super()._get_invoice_tax_totals_vals_list(invoice, taxes_vals)

        for vals in vals_list:
            vals['currency_dp'] = 2
            for subtotal_vals in vals.get('tax_subtotal_vals', []):
                subtotal_vals.pop('percent', None)
                subtotal_vals['currency_dp'] = 2

        return vals_list

    def _get_invoice_line_item_vals(self, line, taxes_vals):
        # EXTENDS account.edi.xml.ubl_21
        line_item_vals = super()._get_invoice_line_item_vals(line, taxes_vals)

        for val in line_item_vals['classified_tax_category_vals']:
            # [UBL-CR-600] A UBL invoice should not include the InvoiceLine Item ClassifiedTaxCategory TaxExemptionReasonCode
            val.pop('tax_exemption_reason_code', None)
            # [UBL-CR-601] TaxExemptionReason must not appear in InvoiceLine Item ClassifiedTaxCategory
            # [BR-E-10] TaxExemptionReason must only appear in TaxTotal TaxSubtotal TaxCategory
            val.pop('tax_exemption_reason', None)

        return line_item_vals

    def _get_invoice_line_allowance_vals_list(self, line, tax_values_list=None):
        # EXTENDS account.edi.xml.ubl_21
        vals_list = super()._get_invoice_line_allowance_vals_list(line, tax_values_list=tax_values_list)

        for vals in vals_list:
            vals['currency_dp'] = 2

        return vals_list

    def _get_invoice_line_vals(self, line, line_id, taxes_vals):
        # EXTENDS account.edi.xml.ubl_21
        vals = super()._get_invoice_line_vals(line, line_id, taxes_vals)

        vals.pop('tax_total_vals', None)

        vals['currency_dp'] = 2
        vals['price_vals']['currency_dp'] = 2

        if line.currency_id.compare_amounts(vals['price_vals']['price_amount'], 0) == -1:
            # We can't have negative unit prices, so we invert the signs of
            # the unit price and quantity, resulting in the same amount in the end
            vals['price_vals']['price_amount'] *= -1
            vals['line_quantity'] *= -1

        return vals

    def _export_invoice_vals(self, invoice):
        # EXTENDS account.edi.xml.ubl_21
        vals = super()._export_invoice_vals(invoice)

        vals['vals'].update({
            'customization_id': self._get_customization_ids()['ubl_bis3'],
            'profile_id': 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
            'currency_dp': 2,
            'ubl_version_id': None,
        })
        vals['vals']['monetary_total_vals']['currency_dp'] = 2

        # [NL-R-001] For suppliers in the Netherlands, if the document is a creditnote, the document MUST
        # contain an invoice reference (cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID)
        if vals['supplier'].country_id.code == 'NL' and 'refund' in invoice.move_type:
            vals['vals'].update({
                'billing_reference_vals': {
                    'id': invoice.ref,
                    'issue_date': None,
                }
            })

        return vals

    def _export_invoice_constraints(self, invoice, vals):
        # EXTENDS account.edi.xml.ubl_21
        constraints = super()._export_invoice_constraints(invoice, vals)

        constraints.update(
            self._invoice_constraints_peppol_en16931_ubl(invoice, vals)
        )
        constraints.update(
            self._invoice_constraints_cen_en16931_ubl(invoice, vals)
        )

        return constraints

    def _invoice_constraints_cen_en16931_ubl(self, invoice, vals):
        """
        corresponds to the errors raised by ' schematron/openpeppol/3.13.0/xslt/CEN-EN16931-UBL.xslt' for invoices.
        This xslt was obtained by transforming the corresponding sch
        https://docs.peppol.eu/poacc/billing/3.0/files/CEN-EN16931-UBL.sch.
        """
        eu_countries = self.env.ref('base.europe').country_ids
        intracom_delivery = (vals['customer'].country_id in eu_countries
                             and vals['supplier'].country_id in eu_countries
                             and vals['customer'].country_id != vals['supplier'].country_id)

        constraints = {
            # [BR-61]-If the Payment means type code (BT-81) means SEPA credit transfer, Local credit transfer or
            # Non-SEPA international credit transfer, the Payment account identifier (BT-84) shall be present.
            # note: Payment account identifier is <cac:PayeeFinancialAccount>
            # note: no need to check account_number, because it's a required field for a partner_bank
            'cen_en16931_payment_account_identifier': self._check_required_fields(
                invoice, 'partner_bank_id'
            ) if vals['vals']['payment_means_vals_list'][0]['payment_means_code'] in (30, 58) else None,
            # [BR-IC-12]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
            # "Intra-community supply" the Deliver to country code (BT-80) shall not be blank.
            'cen_en16931_delivery_country_code': self._check_required_fields(
                vals['vals']['delivery_vals_list'][0], 'delivery_location_vals',
                _("For intracommunity supply, the delivery address should be included.")
            ) if intracom_delivery else None,

            # [BR-IC-11]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
            # "Intra-community supply" the Actual delivery date (BT-72) or the Invoicing period (BG-14)
            # shall not be blank.
            'cen_en16931_delivery_date_invoicing_period': self._check_required_fields(
                vals['vals']['delivery_vals_list'][0], 'actual_delivery_date',
                _("For intracommunity supply, the actual delivery date or the invoicing period should be included.")
            ) and self._check_required_fields(
                vals['vals']['invoice_period_vals_list'][0], ['start_date', 'end_date'],
                _("For intracommunity supply, the actual delivery date or the invoicing period should be included.")
            ) if intracom_delivery else None,
        }

        for line_vals in vals['vals']['line_vals']:
            if not line_vals['item_vals'].get('name'):
                # [BR-25]-Each Invoice line (BG-25) shall contain the Item name (BT-153).
                constraints.update({'cen_en16931_item_name': _("Each invoice line should have a product or a label.")})
                break

        for line in invoice.invoice_line_ids.filtered(lambda x: x.display_type not in ('line_note', 'line_section')):
            if len(line.tax_ids.flatten_taxes_hierarchy().filtered(lambda t: t.amount_type != 'fixed')) != 1:
                # [UBL-SR-48]-Invoice lines shall have one and only one classified tax category.
                # /!\ exception: possible to have any number of ecotaxes (fixed tax) with a regular percentage tax
                constraints.update({'cen_en16931_tax_line': _("Each invoice line shall have one and only one tax.")})

        for role in ('supplier', 'customer'):
            constraints[f'cen_en16931_{role}_country'] = self._check_required_fields(
                vals['vals'][f'accounting_{role}_party_vals']['party_vals']['postal_address_vals']['country_vals'],
                'identification_code',
                _("The country is required for the %s.", role)
            )
            scheme_vals = vals['vals'][f'accounting_{role}_party_vals']['party_vals']['party_tax_scheme_vals'][-1:]
            if (
                not (scheme_vals and scheme_vals[0]['company_id'] and scheme_vals[0]['company_id'][:2].isalpha())
                and (scheme_vals and scheme_vals[0]['tax_scheme_vals'].get('id') == 'VAT')
                and self._name in ('account.edi.xml.ubl_bis3', 'account.edi.xml.ubl_nl', 'account.edi.xml.ubl_de')
            ):
                # [BR-CO-09]-The Seller VAT identifier (BT-31), the Seller tax representative VAT identifier (BT-63)
                # and the Buyer VAT identifier (BT-48) shall have a prefix in accordance with ISO code ISO 3166-1
                # alpha-2 by which the country of issue may be identified. Nevertheless, Greece may use the prefix ‘EL’.
                constraints.update({f'cen_en16931_{role}_vat_country_code': _(
                    "The VAT of the %s should be prefixed with its country code.", role)})

        if invoice.partner_shipping_id:
            # [BR-57]-Each Deliver to address (BG-15) shall contain a Deliver to country code (BT-80).
            constraints['cen_en16931_delivery_address'] = self._check_required_fields(invoice.partner_shipping_id, 'country_id')
        return constraints

    def _invoice_constraints_peppol_en16931_ubl(self, invoice, vals):
        """
        corresponds to the errors raised by 'schematron/openpeppol/3.13.0/xslt/PEPPOL-EN16931-UBL.xslt' for
        invoices in ecosio. This xslt was obtained by transforming the corresponding sch
        https://docs.peppol.eu/poacc/billing/3.0/files/PEPPOL-EN16931-UBL.sch.

        The national rules (https://docs.peppol.eu/poacc/billing/3.0/bis/#national_rules) are included in this file.
        They always refer to the supplier's country.
        """
        constraints = {
            # PEPPOL-EN16931-R003: A buyer reference or purchase order reference MUST be provided.
            'peppol_en16931_ubl_buyer_ref_po_ref':
                "A buyer reference or purchase order reference must be provided." if self._check_required_fields(
                    vals['vals'], 'buyer_reference'
                ) and self._check_required_fields(vals['vals'], 'order_reference') else None,
        }

        if vals['supplier'].country_id.code == 'NL':
            constraints.update({
                # [NL-R-001] For suppliers in the Netherlands, if the document is a creditnote, the document MUST contain
                # an invoice reference (cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID)
                'nl_r_001': self._check_required_fields(invoice, 'ref') if 'refund' in invoice.move_type else '',

                # [NL-R-002] For suppliers in the Netherlands the supplier’s address (cac:AccountingSupplierParty/cac:Party
                # /cac:PostalAddress) MUST contain street name (cbc:StreetName), city (cbc:CityName) and post code (cbc:PostalZone)
                'nl_r_002_street': self._check_required_fields(vals['supplier'], 'street'),
                'nl_r_002_zip': self._check_required_fields(vals['supplier'], 'zip'),
                'nl_r_002_city': self._check_required_fields(vals['supplier'], 'city'),

                # [NL-R-003] For suppliers in the Netherlands, the legal entity identifier MUST be either a
                # KVK or OIN number (schemeID 0106 or 0190)
                'nl_r_003': _(
                    "%s should have a KVK or OIN number set in Company ID field or as Peppol e-address (EAS code 0106 or 0190).",
                    vals['supplier'].display_name
                ) if (
                    not vals['supplier'].peppol_eas in ('0106', '0190') and
                    (not vals['supplier'].company_registry or len(vals['supplier'].company_registry) not in (8, 9))
                ) else '',

                # [NL-R-007] For suppliers in the Netherlands, the supplier MUST provide a means of payment
                # (cac:PaymentMeans) if the payment is from customer to supplier
                'nl_r_007': self._check_required_fields(invoice, 'partner_bank_id')
            })

            if vals['customer'].country_id.code == 'NL':
                constraints.update({
                    # [NL-R-004] For suppliers in the Netherlands, if the customer is in the Netherlands, the customer
                    # address (cac:AccountingCustomerParty/cac:Party/cac:PostalAddress) MUST contain the street name
                    # (cbc:StreetName), the city (cbc:CityName) and post code (cbc:PostalZone)
                    'nl_r_004_street': self._check_required_fields(vals['customer'], 'street'),
                    'nl_r_004_city': self._check_required_fields(vals['customer'], 'city'),
                    'nl_r_004_zip': self._check_required_fields(vals['customer'], 'zip'),

                    # [NL-R-005] For suppliers in the Netherlands, if the customer is in the Netherlands,
                    # the customer’s legal entity identifier MUST be either a KVK or OIN number (schemeID 0106 or 0190)
                    'nl_r_005': _(
                        "%s should have a KVK or OIN number set in Company ID field or as Peppol e-address (EAS code 0106 or 0190).",
                        vals['customer'].display_name
                    ) if (
                        not vals['customer'].commercial_partner_id.peppol_eas in ('0106', '0190') and
                        (not vals['customer'].commercial_partner_id.company_registry or len(vals['customer'].commercial_partner_id.company_registry) not in (8, 9))
                    ) else '',
                })

        if vals['supplier'].country_id.code == 'NO':
            vat = vals['supplier'].vat
            constraints.update({
                # NO-R-001: For Norwegian suppliers, a VAT number MUST be the country code prefix NO followed by a
                # valid Norwegian organization number (nine numbers) followed by the letters MVA.
                # Note: mva.is_valid("179728982MVA") is True while it lacks the NO prefix
                'no_r_001': _(
                    "The VAT number of the supplier does not seem to be valid. It should be of the form: NO179728982MVA."
                ) if not mva.is_valid(vat) or len(vat) != 14 or vat[:2] != 'NO' or vat[-3:] != 'MVA' else "",
            })
        return constraints

    def _import_retrieve_partner_vals(self, tree, role):
        # EXTENDS account.edi.xml.ubl_20
        partner_vals = super()._import_retrieve_partner_vals(tree, role)
        endpoint_node = tree.find(f'.//cac:{role}Party/cac:Party/cbc:EndpointID', UBL_NAMESPACES)
        if endpoint_node is not None:
            peppol_eas = endpoint_node.attrib.get('schemeID')
            peppol_endpoint = endpoint_node.text
            if peppol_eas and peppol_endpoint:
                # include the EAS and endpoint in the search domain when retrieving the partner
                partner_vals.update({
                    'peppol_eas': peppol_eas,
                    'peppol_endpoint': peppol_endpoint,
                })
        return partner_vals

    # -------------------------------------------------------------------------
    # EXPORT: New (dict_to_xml) helpers
    # -------------------------------------------------------------------------

    def _export_invoice(self, invoice, convert_fixed_taxes=True):
        # Only for BIS3 invoices: if the 'account_edi_ubl_cii.use_new_dict_to_xml_helpers' param is set,
        # use the new dict_to_xml helpers.
        if (
            self._name == 'account.edi.xml.ubl_bis3'
            and str2bool(
                self.env['ir.config_parameter'].sudo().get_param('account_edi_ubl_cii.use_new_dict_to_xml_helpers', True),
                default=True,
            )
        ):
            return self._export_invoice_new(invoice)

        return super()._export_invoice(invoice, convert_fixed_taxes=convert_fixed_taxes)

    def _add_document_currency_vals(self, vals):
        super()._add_document_currency_vals(vals)
        vals['currency_dp'] = 2  # In BIS 3, always use 2 decimal places

    # -------------------------------------------------------------------------
    # EXPORT: Templates for invoice header nodes
    # -------------------------------------------------------------------------

    def _add_invoice_header_nodes(self, document_node, vals):
        # Call the parent method from UBL 2.1
        super()._add_invoice_header_nodes(document_node, vals)
        invoice = vals['invoice']

        # Override specific BIS3 values
        document_node.update({
            'cbc:UBLVersionID': None,
            'cbc:CustomizationID': {'_text': self._get_customization_ids()['ubl_bis3']},
            'cbc:ProfileID': {'_text': 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'},
        })

        # [NL-R-001] For suppliers in the Netherlands, if the document is a creditnote, the document MUST
        # contain an invoice reference (cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID)
        if vals['supplier'].country_id.code == 'NL' and 'refund' in invoice.move_type:
            document_node['cac:BillingReference'] = {
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {'_text': invoice.ref},
                }
            }

    def _add_invoice_delivery_nodes(self, document_node, vals):
        """ [BR-IC-12]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
        "Intra-community supply" the Deliver to country code (BT-80) shall not be blank.

        [BR-IC-11]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
        "Intra-community supply" the Actual delivery date (BT-72) or the Invoicing period (BG-14)
        shall not be blank.
        """
        super()._add_invoice_delivery_nodes(document_node, vals)

        invoice = vals['invoice']
        customer = vals['customer']
        supplier = vals['supplier']
        shipping_partner = vals['partner_shipping']

        intracom_delivery = (
            customer.country_id.code in (economic_area := self.env.ref('base.europe').country_ids.mapped('code') + ['NO'])
            and supplier.country_id.code in economic_area
            and supplier.country_id != customer.country_id
        )
        delivery_date = invoice.invoice_date if intracom_delivery else invoice.delivery_date

        document_node['cac:Delivery'] = {
            'cbc:ActualDeliveryDate': {'_text': delivery_date},
            'cac:DeliveryParty': {
                'cac:PartyName': {
                    'cbc:Name': {'_text': shipping_partner.name or customer.name},
                }
            },
            'cac:DeliveryLocation': {
                'cac:Address': self._get_address_node({'partner': shipping_partner})
            },
        }

    def _add_invoice_payment_means_nodes(self, document_node, vals):
        super()._add_invoice_payment_means_nodes(document_node, vals)
        document_node['cac:PaymentMeans']['cbc:PaymentDueDate'] = None
        document_node['cac:PaymentMeans']['cbc:InstructionID'] = None

    def _get_address_node(self, vals):
        # schematron/openpeppol/3.13.0/xslt/CEN-EN16931-UBL.xslt
        # [UBL-CR-225]-A UBL invoice should not include the AccountingCustomerParty Party PostalAddress CountrySubentityCode
        address_node = super()._get_address_node(vals)
        address_node['cbc:CountrySubentityCode'] = None
        address_node['cac:Country']['cbc:Name'] = None
        return address_node

    def _get_party_node(self, vals):
        party_node = super()._get_party_node(vals)

        partner = vals['partner']
        role = vals['role']
        commercial_partner = partner.commercial_partner_id

        if commercial_partner.peppol_endpoint:
            party_node['cbc:EndpointID'] = {
                '_text': commercial_partner.peppol_endpoint,
                'schemeID': commercial_partner.peppol_eas
            }

        if commercial_partner.country_code == 'NL' and commercial_partner.peppol_endpoint:
            # [UBL-SR-16] Buyer identifier shall occur maximum once
            if role == 'customer':
                party_node['cac:PartyIdentification'] = [{'cbc:ID': {'_text': commercial_partner.peppol_endpoint}}]
            else:
                party_node['cac:PartyIdentification'] = [
                    party_node['cac:PartyIdentification'],
                    {
                        'cbc:ID': {'_text': commercial_partner.peppol_endpoint}
                    }
                ]

        party_node['cac:PartyTaxScheme'] = party_tax_scheme = [
            {
                'cbc:CompanyID': {'_text': commercial_partner.vat or commercial_partner.peppol_endpoint},
                'cac:TaxScheme': {
                    # [BR-CO-09] if the PartyTaxScheme/TaxScheme/ID == 'VAT', CompanyID must start with a country code prefix.
                    # In some countries however, the CompanyID can be with or without country code prefix and still be perfectly
                    # valid (RO, HU, non-EU countries).
                    # We have to handle their cases by changing the TaxScheme/ID to 'something other than VAT',
                    # preventing the trigger of the rule.
                    'cbc:ID': {'_text': (
                        'NOT_EU_VAT' if commercial_partner.country_id and commercial_partner.vat and not commercial_partner.vat[:2].isalpha()
                        else 'VAT' if commercial_partner.vat
                        else commercial_partner.peppol_eas
                    )},
                },
            }
        ]
        if partner.country_id.code == "NO" and role == 'supplier':
            party_tax_scheme.append({
                'cbc:CompanyID': {'_text': "Foretaksregisteret"},
                'cac:TaxScheme': {'cbc:ID': {'_text': 'TAX'}},
            })

        if commercial_partner.country_code == 'NL':
            # For NL, VAT can be used as a Peppol endpoint, but KVK/OIN has to be used as PartyLegalEntity/CompanyID
            # To implement a workaround on stable, company_registry field is used without recording whether
            # the number is a KVK or OIN, and the length of the number (8 = KVK, 9 = OIN) is used to determine the type
            nl_id = commercial_partner.company_registry if commercial_partner.peppol_eas not in ('0106', '0190') else commercial_partner.peppol_endpoint
            party_node['cac:PartyLegalEntity']['cbc:CompanyID'] = {
                '_text': nl_id,
                'schemeID': '0190' if nl_id and len(nl_id) == 20 else '0106'
            }
        elif commercial_partner.country_id.code == 'LU' and commercial_partner.company_registry:
            party_node['cac:PartyLegalEntity']['cbc:CompanyID'] = {
                '_text': commercial_partner.company_registry
            }
        elif commercial_partner.country_code == 'SE' and commercial_partner.company_registry:
            party_node['cac:PartyLegalEntity']['cbc:CompanyID'] = {
                '_text': ''.join(char for char in commercial_partner.company_registry if char.isdigit
                ())
            }
        else:
            party_node['cac:PartyLegalEntity']['cbc:CompanyID'] = {
                '_text': commercial_partner.vat or commercial_partner.peppol_endpoint,
                # DK-R-014: For Danish Suppliers it is mandatory to specify schemeID as "0184" (DK CVR-number) when
                # PartyLegalEntity/CompanyID is used for AccountingSupplierParty
                'schemeID': '0184' if commercial_partner.country_id.code == 'DK' else None
            }

        party_node['cac:PartyLegalEntity']['cac:RegistrationAddress'] = None

        party_node['cac:Contact']['cbc:ID'] = None
        return party_node

    def _get_financial_account_node(self, vals):
        # schematron/openpeppol/3.13.0/xslt/CEN-EN16931-UBL.xslt
        # [UBL-CR-664]-A UBL invoice should not include the FinancialInstitutionBranch FinancialInstitution
        # xpath test: not(//cac:FinancialInstitution)
        financial_account_node = super()._get_financial_account_node(vals)

        if financial_account_node['cac:FinancialInstitutionBranch']:
            financial_account_node['cac:FinancialInstitutionBranch']['cac:FinancialInstitution'] = None

            if financial_account_node['cac:FinancialInstitutionBranch']['cbc:ID']:
                financial_account_node['cac:FinancialInstitutionBranch']['cbc:ID']['schemeID'] = None

        return financial_account_node

    # -------------------------------------------------------------------------
    # EXPORT: Templates for document amount nodes
    # -------------------------------------------------------------------------

    def _get_tax_subtotal_node(self, vals):
        # Compute total tax amount
        tax_subtotal_node = super()._get_tax_subtotal_node(vals)
        tax_subtotal_node['cbc:Percent'] = None
        return tax_subtotal_node

    def _get_tax_category_node(self, vals):
        grouping_key = vals['grouping_key']
        return {
            'cbc:ID': {'_text': grouping_key['tax_category_code']},
            'cbc:Percent': {'_text': grouping_key['amount']},
            'cbc:TaxExemptionReasonCode': {'_text': grouping_key.get('tax_exemption_reason_code')},
            'cbc:TaxExemptionReason': {'_text': grouping_key.get('tax_exemption_reason')},
            'cac:TaxScheme': {
                'cbc:ID': {'_text': 'VAT'}
            }
        }

    # -------------------------------------------------------------------------
    # EXPORT: Templates for document level allowance/charge nodes
    # -------------------------------------------------------------------------

    def _get_document_allowance_charge_node(self, vals):
        allowance_charge_node = super()._get_document_allowance_charge_node(vals)
        allowance_charge_node['cbc:MultiplierFactorNumeric'] = None
        return allowance_charge_node

    # -------------------------------------------------------------------------
    # EXPORT: Templates for line nodes
    # -------------------------------------------------------------------------

    def _add_document_line_amount_nodes(self, line_node, vals):
        super()._add_document_line_amount_nodes(line_node, vals)
        # We can't have negative unit prices, so we invert the signs of
        # the unit price and quantity, resulting in the same amount in the end
        quantity_tag = self._get_tags_for_document_type(vals)['line_quantity']
        if vals['base_line']['price_unit'] < 0.0:
            line_node[quantity_tag]['_text'] = -vals['base_line']['quantity']

    def _add_document_line_tax_total_nodes(self, line_node, vals):
        # TaxTotal should not be used in BIS 3.0
        pass

    def _add_document_line_tax_category_nodes(self, line_node, vals):
        base_line = vals['base_line']
        aggregated_tax_details = self.env['account.tax']._aggregate_base_line_tax_details(base_line, vals['tax_grouping_function'])

        line_node['cac:Item']['cac:ClassifiedTaxCategory'] = [
            # [UBL-CR-600] A UBL invoice should not include the InvoiceLine Item ClassifiedTaxCategory TaxExemptionReasonCode
            # [UBL-CR-601] TaxExemptionReason must not appear in InvoiceLine Item ClassifiedTaxCategory
            # [BR-E-10] TaxExemptionReason must only appear in TaxTotal TaxSubtotal TaxCategory
            self._get_tax_category_node({
                **vals,
                'grouping_key': {
                    **grouping_key,
                    'tax_exemption_reason_code': None,
                    'tax_exemption_reason': None,
                }
            })
            for grouping_key in aggregated_tax_details
            if grouping_key
        ]

    def _add_document_line_price_nodes(self, line_node, vals):
        super()._add_document_line_price_nodes(line_node, vals)
        currency_suffix = vals['currency_suffix']
        sign = 1 if vals['base_line']['price_unit'] >= 0.0 else -1
        line_node['cac:Price']['cbc:PriceAmount']['_text'] = FloatFmt(sign * vals[f'gross_price_unit{currency_suffix}'], 1, 8)

    # -------------------------------------------------------------------------
    # EXPORT: Constraints for new helpers
    # -------------------------------------------------------------------------

    def _export_invoice_constraints_new(self, invoice, vals):
        constraints = super()._export_invoice_constraints(invoice, vals)
        constraints.update(
            self._invoice_constraints_peppol_en16931_ubl_new(invoice, vals)
        )
        constraints.update(
            self._invoice_constraints_cen_en16931_ubl_new(invoice, vals)
        )
        return constraints

    def _invoice_constraints_cen_en16931_ubl_new(self, invoice, vals):
        """
        corresponds to the errors raised by ' schematron/openpeppol/3.13.0/xslt/CEN-EN16931-UBL.xslt' for invoices.
        This xslt was obtained by transforming the corresponding sch
        https://docs.peppol.eu/poacc/billing/3.0/files/CEN-EN16931-UBL.sch.
        """
        eu_countries = self.env.ref('base.europe').country_ids
        intracom_delivery = (vals['customer'].country_id in eu_countries
                             and vals['supplier'].country_id in eu_countries
                             and vals['customer'].country_id != vals['supplier'].country_id)

        nsmap = self._get_document_nsmap(vals)

        constraints = {
            # [BR-61]-If the Payment means type code (BT-81) means SEPA credit transfer, Local credit transfer or
            # Non-SEPA international credit transfer, the Payment account identifier (BT-84) shall be present.
            # note: Payment account identifier is <cac:PayeeFinancialAccount>
            # note: no need to check account_number, because it's a required field for a partner_bank
            'cen_en16931_payment_account_identifier': self._check_required_fields(
                invoice, 'partner_bank_id'
            ) if vals['document_node']['cac:PaymentMeans']['cbc:PaymentMeansCode']['_text'] in (30, 58) else None,
            # [BR-IC-12]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
            # "Intra-community supply" the Deliver to country code (BT-80) shall not be blank.
            'cen_en16931_delivery_country_code': (
                _("For intracommunity supply, the delivery address should be included.")
            ) if intracom_delivery and dict_to_xml(vals['document_node']['cac:Delivery']['cac:DeliveryLocation'], nsmap=nsmap, tag='cac:DeliveryLocation') is None else None,

            # [BR-IC-11]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
            # "Intra-community supply" the Actual delivery date (BT-72) or the Invoicing period (BG-14)
            # shall not be blank.
            'cen_en16931_delivery_date_invoicing_period': (
                _("For intracommunity supply, the actual delivery date or the invoicing period should be included.")
                if (
                    intracom_delivery
                    and dict_to_xml(vals['document_node']['cac:Delivery']['cbc:ActualDeliveryDate'], nsmap=nsmap, tag='cbc:ActualDeliveryDate') is None
                    and dict_to_xml(vals['document_node']['cac:InvoicePeriod'], nsmap=nsmap, tag='cac:InvoicePeriod') is None
                )
                else None
            )
        }

        line_tag = self._get_tags_for_document_type(vals)['document_line']
        line_nodes = vals['document_node'][line_tag]

        for line_node in line_nodes:
            if not line_node['cac:Item']['cbc:Name']['_text']:
                # [BR-25]-Each Invoice line (BG-25) shall contain the Item name (BT-153).
                constraints.update({'cen_en16931_item_name': _("Each invoice line should have a product or a label.")})
                break

        for line in invoice.invoice_line_ids.filtered(lambda x: x.display_type not in ('line_note', 'line_section')):
            if len(line.tax_ids.flatten_taxes_hierarchy().filtered(lambda t: t.amount_type != 'fixed')) != 1:
                # [UBL-SR-48]-Invoice lines shall have one and only one classified tax category.
                # /!\ exception: possible to have any number of ecotaxes (fixed tax) with a regular percentage tax
                constraints.update({'cen_en16931_tax_line': _("Each invoice line shall have one and only one tax.")})

        for role in ('supplier', 'customer'):
            party_node = vals['document_node']['cac:AccountingCustomerParty'] if role == 'customer' else vals['document_node']['cac:AccountingSupplierParty']
            constraints[f'cen_en16931_{role}_country'] = (
                _("The country is required for the %s.", role)
                if not party_node['cac:Party']['cac:PostalAddress']['cac:Country']['cbc:IdentificationCode']['_text']
                else None
            )
            tax_scheme_node = party_node['cac:Party']['cac:PartyTaxScheme']
            if tax_scheme_node and (
                self._name in ('account.edi.xml.ubl_bis3', 'account.edi.xml.ubl_nl', 'account.edi.xml.ubl_de')
                and (tax_scheme_node[0]['cac:TaxScheme']['cbc:ID']['_text'] == 'VAT')
                and not (tax_scheme_node[0]['cbc:CompanyID']['_text'][:2].isalpha())
            ):
                # [BR-CO-09]-The Seller VAT identifier (BT-31), the Seller tax representative VAT identifier (BT-63)
                # and the Buyer VAT identifier (BT-48) shall have a prefix in accordance with ISO code ISO 3166-1
                # alpha-2 by which the country of issue may be identified. Nevertheless, Greece may use the prefix 'EL'.
                constraints.update({f'cen_en16931_{role}_vat_country_code': _(
                    "The VAT of the %s should be prefixed with its country code.", role)})

        if invoice.partner_shipping_id:
            # [BR-57]-Each Deliver to address (BG-15) shall contain a Deliver to country code (BT-80).
            constraints['cen_en16931_delivery_address'] = self._check_required_fields(invoice.partner_shipping_id, 'country_id')
        return constraints

    def _invoice_constraints_peppol_en16931_ubl_new(self, invoice, vals):
        """
        corresponds to the errors raised by 'schematron/openpeppol/3.13.0/xslt/PEPPOL-EN16931-UBL.xslt' for
        invoices in ecosio. This xslt was obtained by transforming the corresponding sch
        https://docs.peppol.eu/poacc/billing/3.0/files/PEPPOL-EN16931-UBL.sch.

        The national rules (https://docs.peppol.eu/poacc/billing/3.0/bis/#national_rules) are included in this file.
        They always refer to the supplier's country.
        """
        nsmap = self._get_document_nsmap(vals)
        constraints = {
            # PEPPOL-EN16931-R003: A buyer reference or purchase order reference MUST be provided.
            'peppol_en16931_ubl_buyer_ref_po_ref':
                "A buyer reference or purchase order reference must be provided." if (
                    dict_to_xml(vals['document_node']['cbc:BuyerReference'], nsmap=nsmap, tag='cbc:BuyerReference') is None
                    and dict_to_xml(vals['document_node']['cac:OrderReference'], nsmap=nsmap, tag='cac:OrderReference') is None
                ) else None,
        }

        if vals['supplier'].country_id.code == 'NL':
            constraints.update({
                # [NL-R-001] For suppliers in the Netherlands, if the document is a creditnote, the document MUST contain
                # an invoice reference (cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID)
                'nl_r_001': self._check_required_fields(invoice, 'ref') if 'refund' in invoice.move_type else '',

                # [NL-R-002] For suppliers in the Netherlands the supplier's address (cac:AccountingSupplierParty/cac:Party
                # /cac:PostalAddress) MUST contain street name (cbc:StreetName), city (cbc:CityName) and post code (cbc:PostalZone)
                'nl_r_002_street': self._check_required_fields(vals['supplier'], 'street'),
                'nl_r_002_zip': self._check_required_fields(vals['supplier'], 'zip'),
                'nl_r_002_city': self._check_required_fields(vals['supplier'], 'city'),

                # [NL-R-003] For suppliers in the Netherlands, the legal entity identifier MUST be either a
                # KVK or OIN number (schemeID 0106 or 0190)
                'nl_r_003': _(
                    "%s should have a KVK or OIN number set in Company ID field or as Peppol e-address (EAS code 0106 or 0190).",
                    vals['supplier'].display_name
                ) if (
                    not vals['supplier'].peppol_eas in ('0106', '0190') and
                    (not vals['supplier'].company_registry or len(vals['supplier'].company_registry) not in (8, 9))
                ) else '',

                # [NL-R-007] For suppliers in the Netherlands, the supplier MUST provide a means of payment
                # (cac:PaymentMeans) if the payment is from customer to supplier
                'nl_r_007': self._check_required_fields(invoice, 'partner_bank_id')
            })

            if vals['customer'].country_id.code == 'NL':
                constraints.update({
                    # [NL-R-004] For suppliers in the Netherlands, if the customer is in the Netherlands, the customer
                    # address (cac:AccountingCustomerParty/cac:Party/cac:PostalAddress) MUST contain the street name
                    # (cbc:StreetName), the city (cbc:CityName) and post code (cbc:PostalZone)
                    'nl_r_004_street': self._check_required_fields(vals['customer'], 'street'),
                    'nl_r_004_city': self._check_required_fields(vals['customer'], 'city'),
                    'nl_r_004_zip': self._check_required_fields(vals['customer'], 'zip'),

                    # [NL-R-005] For suppliers in the Netherlands, if the customer is in the Netherlands,
                    # the customer's legal entity identifier MUST be either a KVK or OIN number (schemeID 0106 or 0190)
                    'nl_r_005': _(
                        "%s should have a KVK or OIN number set in Company ID field or as Peppol e-address (EAS code 0106 or 0190).",
                        vals['customer'].display_name
                    ) if (
                        not vals['customer'].commercial_partner_id.peppol_eas in ('0106', '0190') and
                        (not vals['customer'].commercial_partner_id.company_registry or len(vals['customer'].commercial_partner_id.company_registry) not in (8, 9))
                    ) else '',
                })

        if vals['supplier'].country_id.code == 'NO':
            vat = vals['supplier'].vat
            constraints.update({
                # NO-R-001: For Norwegian suppliers, a VAT number MUST be the country code prefix NO followed by a
                # valid Norwegian organization number (nine numbers) followed by the letters MVA.
                # Note: mva.is_valid("179728982MVA") is True while it lacks the NO prefix
                'no_r_001': _(
                    "The VAT number of the supplier does not seem to be valid. It should be of the form: NO179728982MVA."
                ) if not mva.is_valid(vat) or len(vat) != 14 or vat[:2] != 'NO' or vat[-3:] != 'MVA' else "",
            })
        return constraints

    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _import_bis3_add_file_type_code_and_file_document_sign(self, tree, collected_values):
        suffix_invoice_type, document_sign = self._get_import_document_amount_sign(tree)
        collected_values['is_refund'] = True if suffix_invoice_type == 'refund' else False
        collected_values['file_document_sign'] = document_sign

    def _import_bis3_invoice_update_move_type(self, collected_values):
        invoice = collected_values['invoice']
        odoo_document_type = collected_values['odoo_document_type']
        is_refund = collected_values['is_refund']
        logs = collected_values['logs']

        prefix = 'out' if odoo_document_type == 'sale' else 'in'
        suffix = 'refund' if is_refund else 'invoice'
        move_type = f'{prefix}_{suffix}'
        if invoice.move_type != move_type:
            invoice.move_type = move_type

            if move_type in ('out_refund', 'in_refund'):
                logs.append(_("The invoice has been converted into a credit note and the quantities have been reverted."))

    def _import_bis3_add_customer(self, tree, collected_values):
        odoo_document_type = collected_values['odoo_document_type']
        role = "AccountingCustomer" if odoo_document_type == 'sale' else "AccountingSupplier"
        import_partner_params = self._import_retrieve_partner_vals(tree, role)
        customer_values = collected_values['customer_values'] = dict(import_partner_params)
        partner, logs = self._import_partner(collected_values['company'], **import_partner_params)
        customer_values['partner'] = partner
        collected_values['logs'] += logs

    def _import_bis3_add_currency(self, tree, collected_values):
        currency_id, logs = self._import_currency(tree, './/{*}DocumentCurrencyCode')
        collected_values['currency_values'] = {
            'currency': self.env['res.currency'].browse(currency_id),
        }
        collected_values['logs'] += logs

    def _import_bis3_add_issue_date(self, tree, collected_values):
        issue_date_str = tree.findtext('./{*}IssueDate')
        if issue_date_str:
            collected_values['issue_date'] = fields.Date.from_string(issue_date_str)
        else:
            collected_values['issue_date'] = None

    def _import_bis3_add_due_date(self, tree, collected_values):
        collected_values['due_date'] = self._find_value(('./cbc:DueDate', './/cbc:PaymentDueDate'), tree)

    def _import_bis3_invoice_add_partner_bank(self, tree, collected_values):
        partner_bank_values = collected_values['partner_bank_values'] = {
            'partner_bank': None,
        }
        invoice = collected_values['invoice']
        bank_detail_nodes = tree.findall('.//{*}PaymentMeans')
        bank_details = [bank_detail_node.findtext('{*}PayeeFinancialAccount/{*}ID') for bank_detail_node in bank_detail_nodes]
        if bank_details:
            partner_bank = self._import_partner_bank(invoice, bank_details, link_to_invoice=False)
            partner_bank_values['partner_bank'] = partner_bank

    def _import_bis3_add_reference(self, tree, collected_values):
        collected_values['reference'] = tree.findtext('./{*}ID')

    def _import_bis3_add_order_reference(self, tree, collected_values):
        collected_values['order_reference'] = tree.findtext('./{*}OrderReference/{*}ID')

    def _import_bis3_add_payment_terms(self, tree, collected_values):
        payment_terms_values = collected_values['payment_terms_values'] = {}
        payment_terms_values['aggregated_notes'] = self._import_description(tree, xpaths=['./{*}Note', './{*}PaymentTerms/{*}Note'])

    def _import_bis3_add_payment_means(self, tree, collected_values):
        collected_values['payment_means_values'] = {
            'reference': tree.findtext('./{*}PaymentMeans/{*}PaymentID'),
        }

    def _import_bis3_add_delivery(self, tree, collected_values):
        collected_values['delivery_values'] = {
            'date': tree.findtext('.//{*}Delivery/{*}ActualDeliveryDate'),
        }

    def _import_bis3_add_incoterm(self, tree, collected_values):
        incoterm_values = collected_values['incoterm_values'] = {}
        code = incoterm_values['code'] = tree.findtext('./{*}TransportExecutionTerms/{*}DeliveryTerms/{*}ID')
        if code:
            incoterm_values['incoterm'] = self.env['account.incoterms'].search([('code', '=', code)], limit=1)

    def _import_bis3_add_legal_monetary_total(self, tree, collected_values):
        file_document_sign = collected_values['file_document_sign']
        currency = collected_values['currency_values']['currency']
        legal_monetary_total = collected_values['legal_monetary_total_values'] = {}

        prepaid_amount_str = tree.findtext('./{*}LegalMonetaryTotal/{*}PrepaidAmount')
        if prepaid_amount_str:
            prepaid_amount = file_document_sign * float(prepaid_amount_str)
            if not currency.is_zero(prepaid_amount):
                legal_monetary_total['prepaid_amount'] = prepaid_amount
                formatted_prepaid_amount = formatLang(self.env, prepaid_amount, currency_obj=currency)
                collected_values['logs'].append(_("A payment of %s was detected.", formatted_prepaid_amount))

        payable_rounding_amount_str = tree.findtext('./{*}LegalMonetaryTotal/{*}PayableRoundingAmount')
        if payable_rounding_amount_str:
            payable_rounding_amount = file_document_sign * float(payable_rounding_amount_str)
            if not currency.is_zero(payable_rounding_amount):
                legal_monetary_total['payable_rounding_amount'] = payable_rounding_amount
                formatted_amount = formatLang(self.env, payable_rounding_amount, currency_obj=currency)
                collected_values['logs'].append(_("A rounding amount of %s was detected.", formatted_amount))

    def _import_bis3_add_tax_total(self, tree, collected_values):
        file_document_sign = collected_values['file_document_sign']
        odoo_document_type = collected_values['odoo_document_type']

        taxes_values = collected_values['tax_total_values'] = {
            'is_complete': True,
            'tax_mapping': {},
        }

        tax_mapping = taxes_values['tax_mapping']
        for subtotal_elem in tree.findall('./{*}TaxTotal/{*}TaxSubtotal'):
            amount = subtotal_elem.findtext('.//{*}TaxAmount')
            category_code = subtotal_elem.findtext('.//{*}TaxCategory/{*}ID')
            if amount is None or category_code is None:
                taxes_values['is_complete'] = False
                continue

            percentage = subtotal_elem.findtext('.//{*}TaxCategory/{*}Percent')
            if percentage is None:
                percentage = subtotal_elem.find('.//{*}Percent')
            if percentage is None:
                taxes_values['is_complete'] = False
                continue

            percentage = float(percentage)
            tax_key = frozendict({
                'category_code': category_code,
                'percentage': percentage,
            })
            default_tax_values = {
                'amount_type': 'percent',
                'type_tax_use': odoo_document_type,
                'amount': percentage,
                'category_code': category_code,
            }
            tax_values = tax_mapping.setdefault(tax_key, {
                **default_tax_values,
                'tax_amount_currency': 0.0,
                'taxes': self.env['account.tax'],
            })
            tax_values['tax_amount_currency'] += file_document_sign * float(amount)

    def _import_bis3_invoice_line_name(self, line_tree, collected_values, line_collected_values):
        line_collected_values['name'] = (
            line_tree.findtext('.//{*}Item/{*}Description')
            or line_tree.findtext('.//{*}Item/{*}Name')
        )

    def _import_bis3_invoice_line_extension_amount(self, line_tree, collected_values, line_collected_values):
        line_extension_amount_str = line_tree.findtext('.//{*}LineExtensionAmount')

        if line_extension_amount_str:
            line_extension_amount = float(line_extension_amount_str)
        else:
            line_extension_amount = 0.0
            collected_values['tax_total_values']['is_complete'] = False

        line_collected_values['line_extension_amount'] = line_extension_amount

    def _import_bis3_invoice_line_allowance_charges(self, line_tree, collected_values, line_collected_values):
        allowances = line_collected_values['allowances'] = []
        charges = line_collected_values['charges'] = []
        for allowance_charge_elem in line_tree.iterfind('./{*}AllowanceCharge'):
            charge_indicator = allowance_charge_elem.findtext('.//{*}ChargeIndicator')
            amount_str = allowance_charge_elem.findtext('.//{*}Amount')
            base_amount_str = allowance_charge_elem.findtext('.//{*}BaseAmount')
            reason = allowance_charge_elem.findtext('.//{*}AllowanceChargeReason')
            reason_code = allowance_charge_elem.findtext('.//{*}AllowanceChargeReasonCode')

            if amount_str:
                amount = float(amount_str)
            else:
                amount = 0.0
                collected_values['tax_total_values']['is_complete'] = False

            allowance_charge_values = {
                'amount': amount,
                'base_amount': float(base_amount_str) if base_amount_str else None,
                'reason': reason,
                'reason_code': reason_code,
            }
            if charge_indicator.lower() == 'true':
                charges.append(allowance_charge_values)
            else:
                allowances.append(allowance_charge_values)

        allowance_elem = line_tree.find('./{*}Price/{*}AllowanceCharge')
        if allowance_elem is not None:
            amount_str = allowance_elem.findtext('./{*}Amount')
            base_amount_str = allowance_elem.findtext('./{*}BaseAmount')
            reason = allowance_elem.findtext('./{*}AllowanceChargeReason')
            reason_code = allowance_elem.findtext('./{*}AllowanceChargeReasonCode')

            if amount_str:
                amount = float(amount_str)
            else:
                amount = None
                collected_values['tax_total_values']['is_complete'] = False

            line_collected_values['price_allowance_values'] = {
                'amount': amount,
                'base_amount': float(base_amount_str) if base_amount_str else None,
                'reason': reason,
                'reason_code': reason_code,
            }
        else:
            line_collected_values['price_allowance_values'] = {}

    def _import_bis3_invoice_line_price_unit_quantity_discount(self, line_tree, collected_values, line_collected_values):
        file_document_sign = collected_values['file_document_sign']

        quantity_str = (
            line_tree.findtext('.//{*}InvoicedQuantity')
            or line_tree.findtext('.//{*}CreditedQuantity')
        )
        price_amount_str = line_tree.findtext('.//{*}Price/{*}PriceAmount')
        base_quantity_str = line_tree.findtext('./{*}Price/{*}BaseQuantity')
        line_extension_amount = line_collected_values['line_extension_amount']
        total_allowance = sum(allowance['amount'] for allowance in line_collected_values['allowances'])
        total_charges = sum(charge['amount'] for charge in line_collected_values['charges'])
        price_allowance_values = line_collected_values['price_allowance_values']

        if line_extension_amount:

            if quantity_str:
                quantity = float(quantity_str) * file_document_sign
            else:
                quantity = 1.0

            if base_amount := price_allowance_values.get('base_amount'):
                # The allowance on the price gives the original price of the product and the applied discount on it.
                price_unit = base_amount
            else:
                # We do not have the original price of the product.
                price_unit = (line_extension_amount + total_allowance - total_charges) / quantity

            # The charge will be moved to an extra line or a fixed tax.
            # If you have line_extension_amount=950, total_allowance=100, total_charges=50
            # at the very end, you expect 2 lines: 900 + 50 for a total of 950.
            # So, we compute the discount from 950 + 100 = 1050 to 900 on the first line.
            # That's why we need to add back the charges here.
            discount_amount = (price_unit * quantity) - line_extension_amount + total_charges
        elif price_amount_str:
            price_unit = float(price_amount_str)
            discount_amount = 0.0
            if base_quantity_str:
                quantity = float(base_quantity_str) * file_document_sign
                price_unit /= quantity
            else:
                quantity = 1.0
        elif base_amount := price_allowance_values.get('base_amount'):
            price_unit = base_amount
            discount_amount = price_allowance_values['amount'] or 0.0
            if base_quantity_str:
                quantity = float(base_quantity_str) * file_document_sign
                price_unit /= quantity
            else:
                quantity = 1.0
        else:
            collected_values['tax_total_values']['is_complete'] = False
            discount_amount = 0.0
            price_unit = 0.0
            if quantity_str:
                quantity = float(quantity_str) * file_document_sign
            elif base_quantity_str:
                quantity = float(base_quantity_str) * file_document_sign
            else:
                quantity = 1.0

        line_collected_values['quantity'] = quantity
        line_collected_values['price_unit'] = price_unit
        gross_subtotal = (line_collected_values['price_unit'] * line_collected_values['quantity'])
        line_collected_values['discount'] = (discount_amount * 100 / gross_subtotal) if gross_subtotal else 0.0

    def _import_bis3_invoice_line_product(self, line_tree, collected_values, line_collected_values):
        product_values = line_collected_values['product_values'] = {
            'default_code': line_tree.findtext('./{*}Item/{*}SellersItemIdentification/{*}ID'),
            'name': line_tree.findtext('./{*}Item/{*}name'),
            'barcode': line_tree.findtext('./{*}Item/{*}StandardItemIdentification/{*}ID[@schemeID="0160"]'),
        }
        product_values['product'] = self.env['product.product']._retrieve_product(**product_values)

    def _import_bis3_invoice_line_product_uom(self, line_tree, collected_values, line_collected_values):
        product_uom_values = line_collected_values['product_uom_values'] = {
            'uom': None,
        }

        quantity_node = line_tree.find('.//{*}InvoicedQuantity')
        if quantity_node is None:
            quantity_node = line_tree.findtext('.//{*}CreditedQuantity')
        if quantity_node is not None:
            uom_code = quantity_node.attrib.get('unitCode')
            if uom_code:
                matched_uom_xmlid = None
                for odoo_xmlid, uom_unece in UOM_TO_UNECE_CODE.items():
                    if uom_unece == uom_code:
                        matched_uom_xmlid = odoo_xmlid
                        break
                if matched_uom_xmlid:
                    product_uom_values['uom'] = self.env.ref(matched_uom_xmlid, raise_if_not_found=False)

    def _import_bis3_invoice_line_invoice_period(self, line_tree, collected_values, line_collected_values):
        invoice_period_values = line_collected_values['invoice_period_values'] = {}

        start_date = line_tree.findtext('./{*}InvoicePeriod/{*}StartDate')
        end_date = line_tree.findtext('./{*}InvoicePeriod/{*}EndDate')

        if start_date and end_date:
            invoice_period_values.update({
                'start_date': datetime.strptime(start_date.strip(), '%Y-%m-%d'),
                'end_date': datetime.strptime(end_date.strip(), '%Y-%m-%d'),
            })

    def _import_bis3_invoice_line_taxes(self, line_tree, collected_values, line_collected_values):
        AccountTax = self.env['account.tax']
        taxes_values = line_collected_values['taxes_values'] = {
            'taxes': self.env['account.tax'],
        }
        company = collected_values['company']
        tax_total_values = collected_values['tax_total_values']
        invoice = collected_values.get('invoice')
        partner = collected_values.get('customer_values', {}).get('partner')

        for tax_elem in line_tree.findall('.//{*}Item/{*}ClassifiedTaxCategory'):
            percentage = tax_elem.findtext('./{*}Percent')
            category_code = tax_elem.findtext('./{*}ID')

            if not percentage or not category_code:
                tax_total_values['is_complete'] = False
                continue

            percentage = float(percentage)
            tax_key = frozendict({
                'category_code': category_code,
                'percentage': percentage,
            })
            tax_values = tax_total_values['tax_mapping'].get(tax_key)
            if not tax_values:
                tax_total_values['is_complete'] = False
                continue

            extra_domain = []
            if 'ubl_cii_tax_category_code' in AccountTax._fields:
                extra_domain.append(('ubl_cii_tax_category_code', 'in', (False, tax_key['category_code'])))

            extra_values = dict(tax_values)
            if invoice and partner:
                extra_values['invoice_predictive'] = {
                    'invoice': invoice,
                    'name': line_collected_values['name'],
                    'partner': partner,
                    'amount_type': tax_values['amount_type'],
                    'amount': tax_values['amount'],
                    'tax_type': tax_values['type_tax_use'],
                }

            tax = AccountTax._retrieve_tax(
                company=company,
                extra_values=extra_values,
                criteria=[
                    AccountTax._retrieve_tax_with_invoice_predictive,
                    AccountTax._retrieve_tax_with_price_include,
                ],
                extra_domain=extra_domain,
            )
            if not tax:
                tax_total_values['is_complete'] = False
                continue

            taxes_values['taxes'] |= tax
            tax_values['taxes'] |= tax

    def _import_bis3_invoice_line_account(self, line_tree, collected_values, line_collected_values):
        invoice = collected_values.get('invoice')
        name = line_collected_values['name']
        if (
            not invoice
            or not name
            # Check if 'account_accountant' is installed.
            or 'payment_state_before_switch' not in self.env['account.move']._fields
        ):
            return

        line_collected_values['account'] = self.env['account.move.line']._predict_specific_account(
            move=invoice,
            name=name,
            partner=collected_values['customer_values']['partner'] or self.env['res.partner'],
        )

    def _import_bis3_invoice_line_extra_charges_lines(self, line_tree, collected_values, line_collected_values):
        AccountTax = self.env['account.tax']
        company = collected_values['company']
        odoo_document_type = collected_values['odoo_document_type']
        original_taxes = line_collected_values['taxes_values']['taxes']

        extra_charges_lines = line_collected_values['extra_charges_lines'] = []
        for charge in line_collected_values['charges']:
            if charge['reason_code'] == 'AEO':
                fixed_tax_amount = charge['amount'] / line_collected_values['quantity']
                charge_copy = charge.copy()
                charge_copy['amount'] /= charge_copy['line_quantity']

                extra_values = {
                    'amount_type': 'fixed',
                    'type_tax_use': odoo_document_type,
                    'amount': fixed_tax_amount,
                }
                tax = AccountTax._retrieve_tax(
                    company=company,
                    extra_values=extra_values,
                    criteria=[
                        AccountTax._retrieve_tax_with_price_include,
                    ],
                )
                if tax:
                    line_collected_values['taxes_values']['taxes'] |= tax
                    continue

            extra_charges_lines.append({
                'name': f"{charge['reason_code']} {charge['reason']}",
                'quantity': 1.0,
                'price_unit': charge['amount'],
                'tax_ids': original_taxes,
            })

    def _import_bis3_add_invoice_lines(self, tree, collected_values):
        invoice_lines_values = collected_values['invoice_lines_values'] = []
        for xpath in ('./{*}InvoiceLine', './{*}CreditNoteLine'):
            for line_tree in tree.iterfind(xpath):
                line_collected_values = {}

                self._import_bis3_invoice_line_name(line_tree, collected_values, line_collected_values)
                self._import_bis3_invoice_line_extension_amount(line_tree, collected_values, line_collected_values)
                self._import_bis3_invoice_line_allowance_charges(line_tree, collected_values, line_collected_values)
                self._import_bis3_invoice_line_price_unit_quantity_discount(line_tree, collected_values, line_collected_values)
                self._import_bis3_invoice_line_product(line_tree, collected_values, line_collected_values)
                self._import_bis3_invoice_line_product_uom(line_tree, collected_values, line_collected_values)
                self._import_bis3_invoice_line_invoice_period(line_tree, collected_values, line_collected_values)
                self._import_bis3_invoice_line_taxes(line_tree, collected_values, line_collected_values)
                self._import_bis3_invoice_line_account(line_tree, collected_values, line_collected_values)
                self._import_bis3_invoice_line_extra_charges_lines(line_tree, collected_values, line_collected_values)

                invoice_lines_values.append(line_collected_values)

    def _import_bis3_add_allowance_charges(self, tree, collected_values):
        allowances = collected_values['allowances'] = []
        charges = collected_values['charges'] = []

        for element in tree.iterfind('./{*}AllowanceCharge'):
            reason = element.findtext('./{*}AllowanceChargeReason')
            reason_code = element.findtext('./{*}AllowanceChargeReasonCode')
            charge_indicator = element.findtext('./{*}ChargeIndicator')
            amount_str = element.findtext('./{*}Amount')
            base_amount_str = element.findtext('./{*}BaseAmount')
            multiplier_factor_numeric_str = element.findtext('./{*}MultiplierFactorNumeric')
            percentage = element.findtext('./{*}TaxCategory/{*}Percent')
            category_code = element.findtext('./{*}TaxCategory/{*}ID')

            if amount_str:
                amount = float(amount_str)
            else:
                amount = 0.0
                collected_values['tax_total_values']['is_complete'] = False

            allowance_charge_values = {
                'amount': amount,
                'base_amount': float(base_amount_str) if base_amount_str else None,
                'reason': reason,
                'reason_code': reason_code,
                'percentage': float(multiplier_factor_numeric_str) if multiplier_factor_numeric_str else None,
                'tax_percentage': percentage,
                'tax_category_code': category_code,
            }
            if charge_indicator.lower() == 'true':
                charges.append(allowance_charge_values)
            else:
                allowances.append(allowance_charge_values)

    def _import_bis3_invoice_extra_allowance_charges_lines(self, tree, collected_values):
        AccountTax = self.env['account.tax']
        company = collected_values['company']
        odoo_document_type = collected_values['odoo_document_type']
        file_document_sign = collected_values['file_document_sign']
        logs = collected_values['logs']

        extra_allowance_charges_lines = collected_values['extra_allowance_charges_lines'] = []
        for sign, allowance_charges in ((1, collected_values['charges']), (-1, collected_values['allowances'])):
            for allowance_charge in allowance_charges:
                extra_values = {
                    'amount_type': 'percent',
                    'type_tax_use': odoo_document_type,
                    'amount': allowance_charge['tax_percentage'],
                }

                extra_domain = []
                if 'ubl_cii_tax_category_code' in AccountTax._fields:
                    extra_domain.append(('ubl_cii_tax_category_code', 'in', (False, allowance_charge['tax_category_code'])))

                tax = AccountTax._retrieve_tax(
                    company=company,
                    extra_values=extra_values,
                    criteria=[
                        AccountTax._retrieve_tax_with_price_include,
                    ],
                    extra_domain=extra_domain,
                )

                reason = allowance_charge['reason']
                if not tax:
                    collected_values['tax_total_values']['is_complete'] = False

                    if reason:
                        logs.append(_(
                            "Could not retrieve the tax: %(tax_percentage)s %% for line '%(line)s'.",
                            tax_percentage=extra_values['amount'],
                            line=reason,
                        ))
                    else:
                        logs.append(_("Could not retrieve the tax: %s for the document level allowance/charge.", extra_values['amount']))

                amount = allowance_charge['amount']
                base_amount = allowance_charge['base_amount']
                quantity = 1
                if base_amount:
                    price_unit = base_amount * sign * file_document_sign
                    percentage = allowance_charge['percentage']
                    if percentage:
                        quantity = percentage / 100
                else:
                    price_unit = (amount or 0.0) * sign * file_document_sign

                extra_allowance_charges_lines.append({
                    'name': reason,
                    'quantity': quantity,
                    'price_unit': price_unit,
                    'tax_ids': tax or self.env['account.tax'],
                })

    def _import_invoice_ubl_cii(self, invoice, file_data, new=False):
        AccountTax = self.env['account.tax']
        tree = file_data['xml_tree']
        company = invoice.company_id
        collected_values = {
            'invoice': invoice,
            'company': company,
            'odoo_document_type': 'sale' if invoice.journal_id.type == 'sale' else 'purchase',
            'logs': [],
        }

        # Update 'move_type' first.
        self._import_bis3_add_file_type_code_and_file_document_sign(tree, collected_values)
        self._import_bis3_invoice_update_move_type(collected_values)

        self._import_bis3_add_customer(tree, collected_values)
        self._import_bis3_add_currency(tree, collected_values)
        self._import_bis3_add_issue_date(tree, collected_values)
        self._import_bis3_add_due_date(tree, collected_values)
        self._import_bis3_invoice_add_partner_bank(tree, collected_values)
        self._import_bis3_add_reference(tree, collected_values)
        self._import_bis3_add_order_reference(tree, collected_values)
        self._import_bis3_add_payment_terms(tree, collected_values)
        self._import_bis3_add_payment_means(tree, collected_values)
        self._import_bis3_add_delivery(tree, collected_values)
        self._import_bis3_add_incoterm(tree, collected_values)
        self._import_bis3_add_legal_monetary_total(tree, collected_values)
        self._import_bis3_add_tax_total(tree, collected_values)
        self._import_bis3_add_invoice_lines(tree, collected_values)
        self._import_bis3_add_allowance_charges(tree, collected_values)
        self._import_bis3_invoice_extra_allowance_charges_lines(tree, collected_values)

        # Update the invoice.
        to_write = {}
        default_base_line_kwargs = {}
        if partner := collected_values['customer_values']['partner']:
            to_write['partner_id'] = partner.id
            default_base_line_kwargs['partner_id'] = partner
        if issue_date := collected_values['issue_date']:
            to_write['invoice_date'] = issue_date
        else:
            to_write['invoice_date'] = fields.Date.context_today(self)
        if currency := collected_values['currency_values']['currency']:
            to_write['currency_id'] = currency.id
            default_base_line_kwargs['currency_id'] = currency
            default_base_line_kwargs['rate'] = currency._get_conversion_rate(
                from_currency=invoice.company_currency_id,
                to_currency=currency,
                company=company,
                date=to_write['invoice_date'],
            )
        if due_date := collected_values['due_date']:
            to_write['invoice_date_due'] = due_date
        if partner_bank := collected_values['partner_bank_values']['partner_bank']:
            to_write['partner_bank_id'] = partner_bank.id
        if reference := collected_values['reference']:
            to_write['ref'] = reference
            if collected_values['odoo_document_type'] and invoice.quick_edit_mode:
                to_write['name'] = reference
        if order_reference := collected_values['order_reference']:
            to_write['invoice_origin'] = order_reference
        if aggregated_notes := collected_values['payment_terms_values']['aggregated_notes']:
            to_write['narration'] = aggregated_notes
        if reference := collected_values['payment_means_values']['reference']:
            to_write['payment_reference'] = reference
        if delivery_date := collected_values['delivery_values']['date']:
            to_write['delivery_date'] = delivery_date
        if incoterm := collected_values['incoterm_values'].get('incoterm'):
            to_write['invoice_incoterm_id'] = incoterm.id

        base_lines = []
        for line_collected_values in collected_values['invoice_lines_values']:
            base_line_kwargs = {
                **default_base_line_kwargs,
                'quantity': line_collected_values['quantity'],
                'price_unit': line_collected_values['price_unit'],
                'discount': line_collected_values['discount'],
                'tax_ids': line_collected_values['taxes_values']['taxes'],
                'special_mode': 'total_excluded',
            }
            if product := line_collected_values['product_values']['product']:
                base_line_kwargs['product_id'] = product
            if uom := line_collected_values['product_uom_values']['uom']:
                base_line_kwargs['product_uom_id'] = uom

            invoice_line_values = base_line_kwargs['_extra_values'] = {}
            if name := line_collected_values['name']:
                invoice_line_values['name'] = name
            if (
                invoice_period_values := line_collected_values['invoice_period_values']
                and 'deferred_start_date' in self.env['account.move.line']._fields
            ):
                invoice_line_values['deferred_start_date'] = invoice_period_values['start_date']
                invoice_line_values['deferred_end_date'] = invoice_period_values['end_date']
            if account := line_collected_values.get('account'):
                invoice_line_values['account_id'] = account.id

            base_lines.append(AccountTax._prepare_base_line_for_taxes_computation(
                record=None,
                **base_line_kwargs,
            ))

            for extra_charge_values in line_collected_values['extra_charges_lines']:
                base_line_kwargs = {
                    **default_base_line_kwargs,
                    **extra_charge_values,
                    'special_mode': 'total_excluded',
                    '_extra_values': {'name': extra_charge_values['name']},
                }

                base_lines.append(AccountTax._prepare_base_line_for_taxes_computation(
                    record=None,
                    **base_line_kwargs,
                ))

        legal_monetary_total = collected_values['legal_monetary_total_values']
        if legal_monetary_total.get('payable_rounding_amount'):
            base_line_kwargs = {
                **default_base_line_kwargs,
                'quantity': 1.0,
                'price_unit': legal_monetary_total['payable_rounding_amount'],
                'tax_ids': [],
                '_extra_values': {'name': _("Rounding")},
            }

            base_lines.append(AccountTax._prepare_base_line_for_taxes_computation(
                record=None,
                **base_line_kwargs,
            ))

        for extra_allowance_charges_line in collected_values['extra_allowance_charges_lines']:
            base_line_kwargs = {
                **default_base_line_kwargs,
                **extra_allowance_charges_line,
                'special_mode': 'total_excluded',
                '_extra_values': {'name': extra_allowance_charges_line['name']},
            }

            base_lines.append(AccountTax._prepare_base_line_for_taxes_computation(
                record=None,
                **base_line_kwargs,
            ))

        AccountTax._add_tax_details_in_base_lines(base_lines, company)
        AccountTax._round_base_lines_tax_details(base_lines, company)

        # Fix 'price_unit' if some price-included taxes are involved.
        for base_line in base_lines:
            for tax_data in base_line['tax_details']['taxes_data']:
                if tax_data['tax'].price_include:
                    base_line['price_unit'] += tax_data['raw_tax_amount_currency']

        # Fix the tax amounts according the xml.
        tax_total_values = collected_values['tax_total_values']
        if tax_total_values['is_complete']:
            reverse_tax_mapping = {
                tax: tax_key
                for tax_key, tax_values in tax_total_values['tax_mapping'].items()
                for tax in tax_values['taxes']
            }

            def grouping_function(base_line, tax_data):
                return tax_data and reverse_tax_mapping[tax_data['tax']]

            base_lines_aggregated_values = AccountTax._aggregate_base_lines_tax_details(base_lines, grouping_function)
            values_per_grouping_key = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_values)
            for grouping_key, values in values_per_grouping_key.items():
                if not grouping_key:
                    continue

                target_tax_amount_currency = tax_total_values['tax_mapping'][grouping_key]['tax_amount_currency']
                target_factors = [
                    {
                        'factor': tax_data['raw_tax_amount_currency'],
                        'tax_data': tax_data,
                    }
                    for _base_line, taxes_data in values['base_line_x_taxes_data']
                    for tax_data in taxes_data
                ]
                amounts_to_distribute = AccountTax._distribute_delta_amount_smoothly(
                    precision_digits=currency.decimal_places,
                    delta_amount=target_tax_amount_currency,
                    target_factors=target_factors,
                )
                for target_factor, amount_to_distribute in zip(target_factors, amounts_to_distribute):
                    tax_data = target_factor['tax_data']
                    tax_data['tax_amount_currency'] = amount_to_distribute

            # Set 'extra_tax_data' to ensure the totals won't change anymore.
            AccountTax._fix_base_lines_tax_details_on_manual_tax_amounts(base_lines, company)

        # Final invoice lines.
        invoice_line_ids_commands = to_write['invoice_line_ids'] = []
        for base_line in base_lines:
            invoice_line_values = {
                **base_line['_extra_values'],
                'quantity': base_line['quantity'],
                'price_unit': base_line['price_unit'],
                'discount': base_line['discount'],
                'tax_ids': [Command.set(base_line['tax_ids'].ids)],
                'extra_tax_data': AccountTax._export_base_line_extra_tax_data(base_line),
            }
            invoice_line_ids_commands.append(Command.create(invoice_line_values))

        invoice.write(to_write)

        # However, it's quite impossible to predict taxes correctly so most of the time, the user has to edit them after manually.
        # For this reason, let's remove 'extra_tax_data'.
        invoice.invoice_line_ids.extra_tax_data = False
