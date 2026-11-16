from odoo import _, models

from odoo.addons.base.models.res_country import EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES


class AccountEdiCenEn16931(models.AbstractModel):
    """ Business rules of the European semantic data model of an electronic invoice, EN 16931-1.

    This layer is syntax independent: it only relies on the hooks of 'account.edi.common' and is meant to be mixed with
    a syntax ('account.edi.ubl' for EN 16931-3-2, 'account.edi.cii' for EN 16931-3-3), e.g.

        _inherit = ['account.edi.cen_en16931', 'account.edi.ubl']

    The rules referenced as 'BR-*' are the ones of the official validation artefacts:
    https://github.com/ConnectingEurope/eInvoicing-EN16931
    """
    _name = 'account.edi.cen_en16931'
    _inherit = ['account.edi.common']
    _description = "EN 16931 business rules"

    # -------------------------------------------------------------------------
    # EXPORT: VALUES
    # -------------------------------------------------------------------------

    def _export_get_document_type(self, invoice):
        # EXTENDS account.edi.common
        # EN 16931 knows only invoices and credit notes: a debit note is an invoice (UNCL 1001: 380).
        document_type = super()._export_get_document_type(invoice)
        if document_type == 'debit_note':
            return 'invoice'
        return document_type

    def _init_invoice_export_values(self, invoice):
        # EXTENDS account.edi.common
        vals = super()._init_invoice_export_values(invoice)

        # [BR-27]-The Item net price (BT-146) shall NOT be negative.
        # [BR-28]-The Item gross price (BT-148) shall NOT be negative.
        self._turn_price_unit_positive(vals)

        return vals

    def _should_export_early_payment_discount_as_line(self, vals):
        # EXTENDS account.edi.common
        # A line can't have a negative net price [BR-27]: the early payment discount is a document level allowance.
        return False

    def _should_export_global_discount_as_line(self, vals):
        # EXTENDS account.edi.common
        # A line can't have a negative net price [BR-27]: the global discount is a document level allowance.
        return False

    def _should_export_cash_rounding_as_line(self, vals):
        # EXTENDS account.edi.common
        # The cash rounding is reported as the Rounding amount (BT-114).
        return False

    def _should_export_party_tax_scheme(self, vals):
        # EXTENDS account.edi.common
        # [BR-O-02]/[BR-O-03]/[BR-O-04] An invoice with the VAT category "Not subject to VAT" (O) shall not contain the
        # Seller VAT identifier (BT-31), the Seller tax representative VAT identifier (BT-63) nor the Buyer VAT
        # identifier (BT-48).
        if (
            'ubl_cii_tax_category_code' in self.env['account.tax']._fields
            and any(
                tax_data['tax'].ubl_cii_tax_category_code == 'O'
                for base_line in vals['base_lines']
                for tax_data in base_line['tax_details']['taxes_data']
            )
        ):
            return False
        return super()._should_export_party_tax_scheme(vals)

    def _get_tax_category_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.common
        # The recycling contribution taxes and the excises are not VAT: they are reported as allowances/charges.
        # The cash rounding is reported as the Rounding amount (BT-114).
        if (
            self._is_cash_rounding_base_line(base_line)
            or self._is_recycling_contribution_tax(tax_data)
            or self._is_excise_tax(tax_data)
        ):
            return None

        grouping_key = super()._get_tax_category_grouping_key(base_line, tax_data, vals, currency)

        # [BR-E-10]-A VAT breakdown (BG-23) with VAT Category code (BT-118) "Exempt from VAT" shall have
        # a VAT exemption reason code (BT-121) or a VAT exemption reason text (BT-120).
        if (
            grouping_key
            and grouping_key['tax_category_code'] == 'E'
            and not grouping_key.get('tax_exemption_reason')
            and not grouping_key.get('tax_exemption_reason_code')
        ):
            grouping_key['tax_exemption_reason'] = _("Exempt from tax")

        return grouping_key

    # -------------------------------------------------------------------------
    # EXPORT: CONSTRAINTS
    # -------------------------------------------------------------------------

    def _is_intracommunity_supply(self, vals):
        """ Whether the document is a supply between two different countries of the European Economic Area. """
        supplier_country = vals['supplier'].commercial_partner_id.country_id
        customer_country = vals['customer'].commercial_partner_id.country_id
        return (
            supplier_country.code in EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES
            and customer_country.code in EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES
            and supplier_country != customer_country
        )

    def _get_exported_line_tax_categories(self, vals):
        """ The VAT categories (BT-151) of each base line reported as an invoice line.

        :return: A list of tuples (base_line, [tax category code, ...]).
        """
        AccountTax = self.env['account.tax']
        results = []
        for base_line in self._get_exported_invoice_base_lines(vals):
            aggregated_values = AccountTax._aggregate_base_line_tax_details(
                base_line=base_line,
                grouping_function=lambda base_line, tax_data: self._get_line_tax_category_grouping_key(
                    base_line=base_line,
                    tax_data=tax_data,
                    vals=vals,
                    currency=vals['currency'],
                ),
            )
            results.append((base_line, [grouping_key['tax_category_code'] for grouping_key in aggregated_values if grouping_key]))
        return results

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.common
        constraints = super()._export_document_constraints(vals)
        if not self._is_document(vals, 'invoice', 'credit_note', 'self_invoice', 'self_credit_note'):
            return constraints

        supplier = vals['supplier'].commercial_partner_id
        customer = vals['customer'].commercial_partner_id

        # [BR-09]-The Seller postal address (BG-5) shall contain a Seller country code (BT-40).
        # [BR-11]-The Buyer postal address shall contain a Buyer country code (BT-55).
        for partner, role in ((supplier, 'supplier'), (customer, 'customer')):
            if not partner.country_id:
                constraints[f'cen_en16931_{role}_country'] = _("The country is required for the %s.", role)

        # [BR-CO-09]-The Seller VAT identifier (BT-31), the Seller tax representative VAT identifier (BT-63)
        # and the Buyer VAT identifier (BT-48) shall have a prefix in accordance with ISO code ISO 3166-1
        # alpha-2 by which the country of issue may be identified. Nevertheless, Greece may use the prefix 'EL'.
        if self._should_export_party_tax_scheme(vals):
            for partner, role in ((supplier, 'supplier'), (customer, 'customer')):
                identifier = self._get_partner_tax_identifier_values(partner)
                if identifier and identifier['scheme_id'] == 'VAT' and not identifier['value'][:2].isalpha():
                    constraints[f'cen_en16931_{role}_vat_country_code'] = _("The VAT of the %s should be prefixed with its country code.", role)

        # [BR-IC-12]-In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
        # "Intra-community supply" the Deliver to country code (BT-80) shall not be blank.
        if self._is_intracommunity_supply(vals) and not vals['delivery'].country_id:
            constraints['cen_en16931_delivery_country_code'] = _("For intracommunity supply, the delivery address should be included.")

        line_tax_categories = self._get_exported_line_tax_categories(vals)

        # [BR-25]-Each Invoice line (BG-25) shall contain the Item name (BT-153).
        if any(not self._get_line_item_name_description(vals, base_line)[0] for base_line, _codes in line_tax_categories):
            constraints['cen_en16931_item_name'] = _("Each invoice line should have a product or a label.")

        # [BR-CO-04]-Each Invoice line (BG-25) shall be categorized with an Invoiced item VAT category code (BT-151).
        # (and the syntax binding allows a single one per line: [UBL-SR-48]/[CII-SR-?]).
        if any(len(codes) != 1 for _base_line, codes in line_tax_categories):
            constraints['cen_en16931_tax_line'] = _("Each invoice line shall have one and only one tax.")

        # [BR-O-11]..[BR-O-14] An invoice containing the VAT category "Not subject to VAT" shall not contain any
        # other VAT category.
        all_codes = [code for _base_line, codes in line_tax_categories for code in codes]
        if 'O' in all_codes and set(all_codes) != {'O'}:
            constraints['cen_en16931_tax_category_o'] = _("Taxes of category 'Service outside scope of tax' shall not be mixed with tax from other categories. You should split your invoice in two")

        return constraints
