from odoo import _, models


TAX_EXEMPTION_MAPPING = {
    'VATEX-EU-79-C': 'Exempt based on article 79, point c of Council Directive 2006/112/EC',
    'VATEX-EU-132': 'Exempt based on article 132 of Council Directive 2006/112/EC',
    'VATEX-EU-132-1A': 'Exempt based on article 132, section 1 (a) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1B': 'Exempt based on article 132, section 1 (b) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1C': 'Exempt based on article 132, section 1 (c) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1D': 'Exempt based on article 132, section 1 (d) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1E': 'Exempt based on article 132, section 1 (e) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1F': 'Exempt based on article 132, section 1 (f) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1G': 'Exempt based on article 132, section 1 (g) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1H': 'Exempt based on article 132, section 1 (h) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1I': 'Exempt based on article 132, section 1 (i) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1J': 'Exempt based on article 132, section 1 (j) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1K': 'Exempt based on article 132, section 1 (k) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1L': 'Exempt based on article 132, section 1 (l) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1M': 'Exempt based on article 132, section 1 (m) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1N': 'Exempt based on article 132, section 1 (n) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1O': 'Exempt based on article 132, section 1 (o) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1P': 'Exempt based on article 132, section 1 (p) of Council Directive 2006/112/EC',
    'VATEX-EU-132-1Q': 'Exempt based on article 132, section 1 (q) of Council Directive 2006/112/EC',
    'VATEX-EU-143': 'Exempt based on article 143 of Council Directive 2006/112/EC',
    'VATEX-EU-143-1A': 'Exempt based on article 143, section 1 (a) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1B': 'Exempt based on article 143, section 1 (b) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1C': 'Exempt based on article 143, section 1 (c) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1D': 'Exempt based on article 143, section 1 (d) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1E': 'Exempt based on article 143, section 1 (e) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1F': 'Exempt based on article 143, section 1 (f) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1FA': 'Exempt based on article 143, section 1 (fa) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1G': 'Exempt based on article 143, section 1 (g) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1H': 'Exempt based on article 143, section 1 (h) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1I': 'Exempt based on article 143, section 1 (i) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1J': 'Exempt based on article 143, section 1 (j) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1K': 'Exempt based on article 143, section 1 (k) of Council Directive 2006/112/EC',
    'VATEX-EU-143-1L': 'Exempt based on article 143, section 1 (l) of Council Directive 2006/112/EC',
    'VATEX-EU-148': 'Exempt based on article 148 of Council Directive 2006/112/EC',
    'VATEX-EU-148-A': 'Exempt based on article 148, section (a) of Council Directive 2006/112/EC',
    'VATEX-EU-148-B': 'Exempt based on article 148, section (b) of Council Directive 2006/112/EC',
    'VATEX-EU-148-C': 'Exempt based on article 148, section (c) of Council Directive 2006/112/EC',
    'VATEX-EU-148-D': 'Exempt based on article 148, section (d) of Council Directive 2006/112/EC',
    'VATEX-EU-148-E': 'Exempt based on article 148, section (e) of Council Directive 2006/112/EC',
    'VATEX-EU-148-F': 'Exempt based on article 148, section (f) of Council Directive 2006/112/EC',
    'VATEX-EU-148-G': 'Exempt based on article 148, section (g) of Council Directive 2006/112/EC',
    'VATEX-EU-151': 'Exempt based on article 151 of Council Directive 2006/112/EC',
    'VATEX-EU-151-1A': 'Exempt based on article 151, section 1 (a) of Council Directive 2006/112/EC',
    'VATEX-EU-151-1AA': 'Exempt based on article 151, section 1 (aa) of Council Directive 2006/112/EC',
    'VATEX-EU-151-1B': 'Exempt based on article 151, section 1 (b) of Council Directive 2006/112/EC',
    'VATEX-EU-151-1C': 'Exempt based on article 151, section 1 (c) of Council Directive 2006/112/EC',
    'VATEX-EU-151-1D': 'Exempt based on article 151, section 1 (d) of Council Directive 2006/112/EC',
    'VATEX-EU-151-1E': 'Exempt based on article 151, section 1 (e) of Council Directive 2006/112/EC',
    'VATEX-EU-309': 'Exempt based on article 309 of Council Directive 2006/112/EC',
    'VATEX-EU-AE': 'Reverse charge',
    'VATEX-EU-D': 'Intra-Community acquisition from second hand means of transport',
    'VATEX-EU-F': 'Intra-Community acquisition of second hand goods',
    'VATEX-EU-G': 'Export outside the EU',
    'VATEX-EU-I': 'Intra-Community acquisition of works of art',
    'VATEX-EU-IC': 'Intra-Community supply',
    'VATEX-EU-O': 'Not subject to VAT',
    'VATEX-EU-J': 'Intra-Community acquisition of collectors items and antiques',
    'VATEX-FR-FRANCHISE': 'France domestic VAT franchise in base',
    'VATEX-FR-CNWVAT': 'France domestic Credit Notes without VAT, due to supplier forfeit of VAT for discount',
}


class AccountEdiCommon(models.AbstractModel):
    _name = 'account.edi.common2'
    _description = "Common functions for EDI documents: generate the data, the constraints, etc"

    # -------------------------------------------------------------------------
    # EXPORT COMMON
    # -------------------------------------------------------------------------

    def _export_filename(self, document_name):
        head_name = document_name.replace('/', '_')
        trailing_name = self._name.split('.')[2:].replace('.', '_')
        return f"{head_name}_{trailing_name}.xml"

    def format_monetary(self, amount, currency):
        return FloatFmt(amount, currency.decimal_places)

    def _add_common_extra_values(self, collected_values):
        collected_values['_is_sale_module_installed'] = self.env['ir.module.module']._get('sale')

    def _is_root_company(self, company):
        return True

    def _add_common_company_values(self, collected_values, company):
        root_company = company.sudo().parent_ids[::-1].filtered(self._is_root_company)[:1] or company
        collected_values['_root_company'] = root_company
        collected_values['_company'] = company
        collected_values['_company_currency'] = company.currency_id

    def _add_common_currency_values(self, collected_values, currency):
        collected_values['_currency'] = currency
        collected_values['_currency_round'] = lambda amount: FloatFmt(amount, min_dp=currency.decimal_places)

    def _add_common_supplier_values(self, collected_values):
        supplier = collected_values['_company'].partner_id.commercial_partner_id
        collected_values['_supplier'] = supplier

    def _add_common_customer_values(self, collected_values, customer):
        collected_values['_customer'] = customer

    def _add_common_invoice_values(self, collected_values, invoice):
        invoice = collected_values['_invoice'] = invoice.with_context(lang=invoice.partner_id.lang)

        if 'debit_origin_id' in self.env['account.move']._fields and invoice.debit_origin_id:
            collected_values['_invoice_type'] = 'debit_note'
        else:
            collected_values['_invoice_type'] = invoice.move_type

        base_lines, tax_lines = invoice._get_rounded_base_and_tax_lines()
        collected_values['_base_lines'] = base_lines
        collected_values['_tax_lines'] = tax_lines

    def _add_common_partner_values(self, collected_values, partner):
        collected_values.update({
            '_partner': partner,
            '_commercial_partner': partner.commercial_partner_id,
        })

    def _add_common_partner_bank_values(self, collected_values, partner_bank):
        collected_values.update({
            '_partner_bank': partner_bank,
            '_account_number': partner_bank.acc_number.replace(' ', ''),
        })

    def _add_common_payment_term_values(self, collected_values, payment_term):
        collected_values.update({
            '_payment_term': payment_term,
            '_payment_term_note': html2plaintext(payment_term.note) or None,
        })

    def _add_common_product_values(self, collected_values, product):
        collected_values['_product'] = product

    def _add_common_uom_values(self, collected_values, uom):
        collected_values['_uom'] = uom

    def _deduce_tax_category_code(self, collected_values):
        """
        Predicts the tax category code for a tax applied to a given base line.
        If the tax has a defined category code, it is returned.
        Otherwise, a reasonable default is provided, though it may not always be accurate.

        Source: doc of Peppol (but the CEF norm is also used by factur-x, yet not detailed)
        https://docs.peppol.eu/poacc/billing/3.0/syntax/ubl-invoice/cac-TaxTotal/cac-TaxSubtotal/cac-TaxCategory/cbc-TaxExemptionReasonCode/
        https://docs.peppol.eu/poacc/billing/3.0/codelist/vatex/
        https://docs.peppol.eu/poacc/billing/3.0/codelist/UNCL5305/
        """
        tax = collected_values['_tax']
        customer = collected_values['_customer']

        # add Norway, Iceland, Liechtenstein
        country_code = tax.country_code
        customer_country_code = customer.country_id.code

        if not tax:
            return 'E'

        if tax.ubl_cii_tax_category_code:
            return tax.ubl_cii_tax_category_code

        if customer_country_code == 'ES' and customer.zip:
            if customer.zip[:2] in ('35', '38'):  # Canary
                # [BR-IG-10]-A VAT breakdown (BG-23) with VAT Category code (BT-118) "IGIC" shall not have a VAT
                # exemption reason code (BT-121) or VAT exemption reason text (BT-120).
                return 'L'
            if customer.zip[:2] in ('51', '52'):
                return 'M'  # Ceuta & Mellila

        if country_code == customer_country_code:
            if not tax or tax.amount == 0:
                # in theory, you should indicate the precise law article
                return 'E'
            elif tax.has_negative_factor:
                # Special case: Purchase reverse-charge taxes for self-billed invoices.
                # From the buyer's perspective, this is a standard tax with a non-zero percentage but
                # two tax repartition lines that cancel each other out.
                # But from the seller's perspective, this is a zero-percent tax (VAT liability is deferred
                # to the buyer).
                # For a self-billed invoice we, the buyer, create the invoice on behalf of the seller.
                # So in the XML we put the zero-percent tax with code 'AE' that the seller would have used.
                return 'AE'
            else:
                return 'S'  # standard VAT

        european_economic_area = self.env.ref('base.europe').country_ids.mapped('code') + ['NO', 'IS', 'LI']
        if country_code in european_economic_area:
            if tax.amount != 0 and not tax.has_negative_factor:
                # Special case: Purchase reverse-charge taxes for self-billed invoices.
                # See explanation above.
                # In the XML we put the zero-percent tax with code 'G' or 'K' that the buyer would have used.
                return 'S'
            if customer_country_code not in european_economic_area:
                return 'G'
            if customer_country_code in european_economic_area:
                return 'K'

        if tax.amount != 0:
            return 'S'
        else:
            return 'E'

    def _deduce_tax_exemption_reason(self, collected_values):
        """ Returns the reason and code from the tax if available.
            If not, it falls back to the default tax exemption reason defined for the respective tax category code.

            Note: In Peppol, taxes should be grouped by tax category code but *not* by
            exemption reason, see https://docs.peppol.eu/poacc/billing/3.0/bis/#_calculation_of_vat
        """
        tax = collected_values['_tax']

        if tax.ubl_cii_tax_exemption_reason_code:
            return {
                'tax_exemption_reason_code': tax.ubl_cii_tax_exemption_reason_code,
                'tax_exemption_reason': TAX_EXEMPTION_MAPPING.get(tax.ubl_cii_tax_exemption_reason_code),
            }

        tax_category_code = collected_values['_tax_category_code']
        tax_exemption_reason = tax_exemption_reason_code = None

        if tax_category_code == 'E':
            tax_exemption_reason = _('Articles 226 items 11 to 15 Directive 2006/112/EN')
        elif tax_category_code == 'G':
            tax_exemption_reason = _('Export outside the EU')
            tax_exemption_reason_code = 'VATEX-EU-G'
        elif tax_category_code == 'K':
            tax_exemption_reason = _('Intra-Community supply')
            tax_exemption_reason_code = 'VATEX-EU-IC'

        return {
            'tax_exemption_reason': tax_exemption_reason,
            'tax_exemption_reason_code': tax_exemption_reason_code,
        }

    def _add_common_tax_values(self, collected_values, tax):
        collected_values.update({
            '_tax': tax,
            '_tax_amount': tax.amount,
            '_tax_amount_type': tax.amount_type,
            '_tax_percent': tax.amount if tax.amount_type == 'percent' else None,
        })
        tax_category_code = self._deduce_tax_category_code(collected_values)
        collected_values['_tax_category_code'] = tax_category_code
        tax_exemption_reason_values = self._deduce_tax_exemption_reason(collected_values)
        collected_values.update({
            '_tax_exemption_reason': tax_exemption_reason_values['tax_exemption_reason'],
            '_tax_exemption_reason_code': tax_exemption_reason_values['tax_exemption_reason_code'],
        })

    def _add_common_base_line_values(self, collected_values, base_line):
        uom = base_line['product_uom_id']
        uom_values = {}
        if uom:
            self._add_common_uom_values(uom_values, uom)

        product = base_line['product_id']
        product_values = {}
        if product:
            self._add_common_product_values(product_values, product)

        collected_values.update({
            '_base_line': base_line,
            '_taxes_values': [],
            '_uom_values': uom_values,
            '_product_values': product_values,
            '_label': self.env['account.tax']._get_base_line_field_value_from_record(
                base_line['record'],
                'name',
                {},
                base_line['product_id'].name,
            ),
        }),

        discount_factor = 1 - (base_line['discount'] / 100.0)
        if discount_factor:
            gross_subtotal_currency = base_line['tax_details']['raw_total_excluded_currency'] / discount_factor
            gross_subtotal = base_line['tax_details']['raw_total_excluded'] / discount_factor
        else:
            gross_subtotal_currency = base_line['price_unit'] * base_line['quantity']
            gross_subtotal = gross_subtotal_currency / base_line['rate']

        if base_line['quantity'] and discount_factor:
            gross_price_unit_currency = gross_subtotal_currency / base_line['quantity']
            gross_price_unit = gross_subtotal / base_line['quantity']
        else:
            gross_price_unit_currency = base_line['price_unit']
            gross_price_unit = base_line['price_unit'] / base_line['rate']

        discount_amount_currency = gross_subtotal_currency - base_line['tax_details']['raw_total_excluded_currency']
        discount_amount = gross_subtotal - base_line['tax_details']['raw_total_excluded']

        collected_values.update({
            '_discount_amount_currency': discount_amount_currency,
            '_discount_amount': discount_amount,
            '_gross_subtotal_currency': gross_subtotal_currency,
            '_gross_subtotal': gross_subtotal,
            '_gross_price_unit_currency': gross_price_unit_currency,
            '_gross_price_unit': gross_price_unit,
        })

        for tax_data in base_line['tax_details']['taxes_data']:
            tax = tax_data['tax']
            # Temporary add the customer in values while all tax_category code are not specified in all COAs
            tax_collected_values = {'_customer': base_line['partner_id']}
            self._add_common_tax_values(tax_collected_values, tax)
            collected_values['_taxes'].append(tax_collected_values)

    def _get_base_lines_values(self, collected_values):
        for i, base_line in enumerate(collected_values['_base_lines'], start=1):
            line_collected_values = {'_index': i}
            self._add_common_base_line_values(line_collected_values, base_line)

            # Double chain link from base_line to access custom values from aggregators.
            base_line['_collected_values'] = line_collected_values
            for tax_data, tax_collected_values in zip(base_line['tax_details']['taxes_data'], line_collected_values['_taxes']):
                tax_data['_collected_values'] = tax_collected_values

            yield line_collected_values

    # -------------------------------------------------------------------------
    # IMPORT HELPERS
    # -------------------------------------------------------------------------
