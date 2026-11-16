"""
Common ZATCA EDI functionality shared between Account and POS modules.

This mixin provides base implementation for ZATCA-compliant UBL 2.1 XML generation, on top of the UBL 2.1 syntax
layer (account.edi.ubl), that can be used by both account.edi.xml.ubl_zatca and a pos.order builder.
"""
import re
from base64 import b64encode
from hashlib import sha256

from lxml import etree

from odoo import _, fields, models
from odoo.tools import html2plaintext
from odoo.tools.float_utils import float_is_zero
from odoo.tools.misc import file_path

from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt

# ZATCA Tax Classification Constants
TAX_EXEMPTION_CODES = ['VATEX-SA-29', 'VATEX-SA-29-7', 'VATEX-SA-30']
TAX_ZERO_RATE_CODES = ['VATEX-SA-32', 'VATEX-SA-33', 'VATEX-SA-34-1', 'VATEX-SA-34-2', 'VATEX-SA-34-3', 'VATEX-SA-34-4', 'VATEX-SA-34-5', 'VATEX-SA-35', 'VATEX-SA-36', 'VATEX-SA-EDU', 'VATEX-SA-HEA']

# ZATCA Payment Means Codes (UN/ECE 4461)
PAYMENT_MEANS_CODE = {
    'bank': 42,      # Payment to bank account
    'card': 48,      # Bank card
    'cash': 10,      # In cash
    'transfer': 30,  # Credit transfer
    'unknown': 1,     # Instrument not defined
}


class ZatcaUblMixin(models.AbstractModel):
    """
    Common mixin for ZATCA EDI implementations.

    This provides shared functionality for generating ZATCA-compliant UBL 2.1 XML
    documents for both regular invoices (account.move) and POS orders (pos.order).
    It is meant to be inherited together with (before) 'account.edi.ubl'.
    """

    _name = 'zatca.ubl.mixin'
    _description = 'ZATCA UBL Mixin'

    # -------------------------------------------------------------------------
    # EXPORT: Helpers
    # -------------------------------------------------------------------------

    def format_float(self, amount, precision_digits=2):
        return FloatFmt(amount, precision_digits)

    def _l10n_sa_get_currency_values(self, vals, in_foreign_currency=True):
        currency = vals['currency'] if in_foreign_currency else vals['company_currency']
        return {
            'suffix': '_currency' if in_foreign_currency else '',
            'currency_dp': self._get_currency_decimal_places(currency),
            'currency_name': currency.name,
        }

    def _l10n_sa_total_grouping_key(self, base_line, tax_data):
        """ Grouping function used to compute the monetary totals: always ignore withholding taxes in the UBL. """
        tax = tax_data and tax_data['tax']
        if tax and tax.amount < 0:
            return None
        return True

    def _l10n_sa_tax_grouping_key(self, base_line, tax_data, vals):
        """ Grouping function used to compute the tax totals (document and line levels) by tax category. """
        tax = tax_data and tax_data['tax']

        # Ignore withholding taxes
        if tax and tax.amount < 0:
            return None
        customer = vals['customer'].commercial_partner_id
        supplier = vals['supplier']
        return {
            'tax_category_code': self._get_tax_category_code(customer, supplier, tax),
            **self._get_tax_exemption_reason(customer, supplier, tax),
            'amount': tax.amount if tax else 0.0,
            'amount_type': tax.amount_type if tax else 'percent',
        }

    def _l10n_sa_aggregate_base_line_tax_details(self, vals, base_line):
        return self.env['account.tax']._aggregate_base_line_tax_details(
            base_line,
            lambda base_line, tax_data: self._l10n_sa_tax_grouping_key(base_line, tax_data, vals),
        )

    def _l10n_sa_aggregate_base_lines_tax_details(self, vals, base_lines, grouping_function=None):
        AccountTax = self.env['account.tax']
        grouping_function = grouping_function or (lambda base_line, tax_data: self._l10n_sa_tax_grouping_key(base_line, tax_data, vals))
        base_lines_aggregated_tax_details = AccountTax._aggregate_base_lines_tax_details(base_lines, grouping_function)
        return AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_tax_details)

    def _l10n_sa_prepare_base_lines(self, vals):
        """ Turn the recycling contribution taxes into line allowances/charges, the emptying taxes into new base
        lines and extract the cash rounding base lines (vals['cash_rounding_base_lines']).
        """
        base_lines = vals['base_lines']
        for base_line in base_lines:
            line_name = base_line['record'] and base_line['record'].name
            base_line['_line_name'] = line_name and line_name.replace('\n', ' ')

            # Manage taxes for recycling contribution such as RECUPEL / AUVIBEL: they are reported as
            # allowances/charges and included in the line amount.
            tax_details = base_line['tax_details']
            taxes_data = tax_details['taxes_data']
            recycling_contribution_taxes_data = base_line['_l10n_sa_recycling_contribution_taxes_data'] = []
            new_taxes_data = tax_details['taxes_data'] = []
            for tax_data in taxes_data:
                if self._is_recycling_contribution_tax(tax_data):
                    recycling_contribution_taxes_data.append(tax_data)
                    tax_details['raw_total_excluded_currency'] += tax_data['raw_tax_amount_currency']
                    tax_details['raw_total_excluded'] += tax_data['raw_tax_amount']
                    tax_details['total_excluded_currency'] += tax_data['tax_amount_currency']
                    tax_details['total_excluded'] += tax_data['tax_amount']
                else:
                    new_taxes_data.append(tax_data)

        # Manage taxes for emptying.
        base_lines = self._turn_emptying_taxes_as_new_base_lines(base_lines, vals['company'], vals)

        # Extract cash rounding lines.
        vals['base_lines'] = [base_line for base_line in base_lines if base_line['special_type'] != 'cash_rounding']
        vals['cash_rounding_base_lines'] = [base_line for base_line in base_lines if base_line['special_type'] == 'cash_rounding']

    def _round_base_lines_tax_details(self, vals, in_company_currency=True):
        # EXTENDS account.edi.common
        # The ZATCA amounts are computed from the raw amounts of the base lines (see '_l10n_sa_get_line_amounts'),
        # rounded with the currency precision: don't round them with 6 digits beforehand.
        return

    def _l10n_sa_is_document_allowance_charge(self, base_line):
        """ Whether the base line should be treated as a document-level AllowanceCharge (early payment discount
        and lines with a negative amount, e.g. global discounts).
        """
        return base_line['special_type'] == 'early_payment' or base_line['tax_details']['total_excluded_currency'] < 0

    def _get_exported_invoice_base_lines(self, vals):
        # EXTENDS account.edi.common
        return [base_line for base_line in vals['base_lines'] if not self._l10n_sa_is_document_allowance_charge(base_line)]

    def _l10n_sa_get_line_amounts(self, vals, base_line):
        """ Compute the amounts of a document line: the total excluding taxes (including the fixed taxes),
        the gross unit price and the discount amount, in the document currency.
        """
        tax_details = base_line['tax_details']

        total_fixed_taxes_currency = sum(
            tax_data['tax_amount_currency']
            for tax_data in tax_details['taxes_data']
            if tax_data['tax'].amount_type == 'fixed' and self._l10n_sa_total_grouping_key(base_line, tax_data)
        )
        total_excluded_currency = tax_details['total_excluded_currency'] + tax_details['delta_total_excluded_currency'] + total_fixed_taxes_currency

        raw_total_excluded_currency = tax_details['raw_total_excluded_currency']
        net_total_excluded_currency = tax_details['total_excluded_currency']
        for tax_data in base_line.get('_l10n_sa_recycling_contribution_taxes_data', []):
            raw_total_excluded_currency -= tax_data['raw_tax_amount_currency']
            net_total_excluded_currency -= tax_data['tax_amount_currency']

        discount_factor = 1 - (base_line['discount'] / 100.0)
        if discount_factor != 0.0:
            gross_subtotal_currency = base_line['currency_id'].round(raw_total_excluded_currency / discount_factor)
        else:
            gross_subtotal_currency = base_line['currency_id'].round(base_line['price_unit'] * base_line['quantity'])

        if base_line['quantity'] == 0.0 or discount_factor == 0.0:
            gross_price_unit_currency = base_line['price_unit']
        else:
            gross_price_unit_currency = gross_subtotal_currency / base_line['quantity']

        return {
            'total_excluded_currency': total_excluded_currency,
            'gross_subtotal_currency': gross_subtotal_currency,
            'gross_price_unit_currency': gross_price_unit_currency,
            'discount_amount_currency': gross_subtotal_currency - net_total_excluded_currency,
        }

    def _l10n_sa_get_monetary_totals(self, vals):
        """ Compute the document totals in the document currency. """
        totals = {'total_allowance': 0.0, 'total_charge': 0.0, 'total_lines': 0.0}
        for base_line in vals['base_lines']:
            base_line_total_excluded = self._l10n_sa_get_line_amounts(vals, base_line)['total_excluded_currency']
            if self._l10n_sa_is_document_allowance_charge(base_line):
                if base_line_total_excluded < 0.0:
                    totals['total_allowance'] += -base_line_total_excluded
                else:
                    totals['total_charge'] += base_line_total_excluded
            else:
                totals['total_lines'] += base_line_total_excluded
        totals['tax_exclusive_amount'] = totals['total_lines'] + totals['total_charge'] - totals['total_allowance']

        def non_fixed_total_grouping_function(base_line, tax_data):
            if tax_data and tax_data['tax'].amount_type == 'fixed':
                return None
            return self._l10n_sa_total_grouping_key(base_line, tax_data)

        aggregated_tax_details = self._l10n_sa_aggregate_base_lines_tax_details(vals, vals['base_lines'], non_fixed_total_grouping_function)
        totals['total_tax_amount'] = sum(
            tax_details['tax_amount_currency']
            for grouping_key, tax_details in aggregated_tax_details.items()
            if grouping_key
        )
        totals['tax_inclusive_amount'] = totals['tax_exclusive_amount'] + totals['total_tax_amount']
        totals['cash_rounding_base_amount'] = sum(
            base_line['tax_details']['total_excluded_currency']
            for base_line in vals.get('cash_rounding_base_lines', [])
        )
        return totals

    # -------------------------------------------------------------------------
    # EXPORT: Party nodes
    # -------------------------------------------------------------------------

    def _l10n_sa_get_party_node(self, vals, partner, role):
        commercial_partner = partner.commercial_partner_id

        party_node = {}

        if identification_number := self._get_partner_party_identification_number(commercial_partner):
            scheme_id = 'OTH' if commercial_partner.country_code != 'SA' else commercial_partner.l10n_sa_edi_additional_identification_scheme
            party_node['cac:PartyIdentification'] = {
                'cbc:ID': {
                    '_text': identification_number,
                    'schemeID': scheme_id,
                },
            }

        party_node.update({
            'cac:PartyName': {
                'cbc:Name': {'_text': partner.display_name},
            },
            'cac:PostalAddress': self._ubl_get_partner_address_node(vals, partner),
            'cac:PartyTaxScheme': {
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {'_text': commercial_partner.vat},
                'cac:RegistrationAddress': self._ubl_get_partner_address_node(vals, commercial_partner),
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'VAT'}
                }
            } if (role != 'customer' or partner.country_id.code == 'SA') and commercial_partner.vat and commercial_partner.vat != '/' else None,  # BR-KSA-46
            'cac:PartyLegalEntity': {
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {'_text': commercial_partner.vat} if commercial_partner.country_code == 'SA' else None,
                'cac:RegistrationAddress': self._ubl_get_partner_address_node(vals, commercial_partner),
            },
            'cac:Contact': {
                'cbc:ID': {'_text': partner.id},
                'cbc:Name': {'_text': partner.name},
                'cbc:Telephone': {
                    '_text': re.sub(r"[^+\d]", '', partner.phone) if partner.phone else None,
                },
                'cbc:ElectronicMail': {'_text': partner.email},
            },
        })
        return party_node

    def _ubl_get_partner_address_node(self, vals, partner):
        # OVERRIDE account.edi.ubl
        # Also used for the address of a res.partner.bank.
        building_number = partner.l10n_sa_edi_building_number if partner._name == 'res.partner' else ''
        edi_plot_identification = partner.l10n_sa_edi_plot_identification if partner._name == 'res.partner' else ''

        return {
            'cbc:StreetName': {'_text': partner.street},
            'cbc:BuildingNumber': {'_text': building_number},
            'cbc:PlotIdentification': {'_text': edi_plot_identification},
            'cbc:CitySubdivisionName': {'_text': partner.street2},
            'cbc:CityName': {'_text': partner.city},
            'cbc:PostalZone': {'_text': partner.zip},
            'cbc:CountrySubentity': {'_text': partner.state_id.name},
            'cbc:CountrySubentityCode': {'_text': partner.state_id.code},
            'cac:AddressLine': None,
            'cac:Country': {
                'cbc:IdentificationCode': {'_text': partner.country_id.code},
                'cbc:Name': {'_text': partner.country_id.name},
            },
        }

    def _ubl_get_partner_bank_address_node(self, vals, partner_bank):
        # OVERRIDE account.edi.ubl
        return self._ubl_get_partner_address_node(vals, partner_bank)

    def _get_partner_party_identification_number(self, partner):
        """ Override to include/update values specific to ZATCA's UBL 2.1 specs """
        identification_number = partner.l10n_sa_edi_additional_identification_number
        vat = re.sub(r'[^a-zA-Z0-9]', '', partner.vat or "")
        if partner.country_code != "SA":
            identification_number = vat or identification_number
        elif partner.l10n_sa_edi_additional_identification_scheme == 'TIN':
            # according to ZATCA, the TIN number is always the first 10 digits of the VAT number
            identification_number = partner._l10n_sa_get_tin_from_vat(vat)
        return identification_number

    def _ubl_add_accounting_supplier_party_node(self, vals):
        # OVERRIDE account.edi.ubl
        vals['document_node']['cac:AccountingSupplierParty'] = {
            'cac:Party': self._l10n_sa_get_party_node(vals, vals['supplier'], 'supplier'),
        }

    def _ubl_add_accounting_customer_party_node(self, vals):
        # OVERRIDE account.edi.ubl
        vals['document_node']['cac:AccountingCustomerParty'] = {
            'cac:Party': self._l10n_sa_get_party_node(vals, vals['customer'], 'customer'),
        }

    # -------------------------------------------------------------------------
    # EXPORT: Tax nodes
    # -------------------------------------------------------------------------

    def _get_tax_category_node(self, vals, grouping_key):
        return {
            'cbc:ID': {'_text': grouping_key['tax_category_code']},
            'cbc:Name': {'_text': grouping_key.get('name')},
            'cbc:Percent': {'_text': grouping_key['amount']} if grouping_key['amount_type'] == 'percent' else None,
            'cbc:TaxExemptionReasonCode': {'_text': grouping_key.get('tax_exemption_reason_code')},
            'cbc:TaxExemptionReason': {'_text': grouping_key.get('tax_exemption_reason')},
            'cac:TaxScheme': {
                'cbc:ID': {'_text': 'VAT'},
            }
        }

    def _l10n_sa_get_tax_total_node(self, vals, aggregated_tax_details, in_foreign_currency=True):
        currency_values = self._l10n_sa_get_currency_values(vals, in_foreign_currency=in_foreign_currency)
        suffix = currency_values['suffix']
        currency_dp = currency_values['currency_dp']
        currency_name = currency_values['currency_name']
        return {
            'cbc:TaxAmount': {
                '_text': self.format_float(sum(
                    values[f'tax_amount{suffix}']
                    for grouping_key, values in aggregated_tax_details.items()
                    if grouping_key
                ), currency_dp),
                'currencyID': currency_name,
            },
            'cac:TaxSubtotal': [
                {
                    'cbc:TaxableAmount': {
                        '_text': self.format_float(values[f'base_amount{suffix}'], currency_dp),
                        'currencyID': currency_name,
                    },
                    'cbc:TaxAmount': {
                        '_text': self.format_float(values[f'tax_amount{suffix}'], currency_dp),
                        'currencyID': currency_name,
                    },
                    'cbc:Percent': {'_text': grouping_key['amount']} if grouping_key['amount_type'] == 'percent' else None,
                    'cac:TaxCategory': self._get_tax_category_node(vals, grouping_key),
                }
                for grouping_key, values in aggregated_tax_details.items()
                if grouping_key
            ] if in_foreign_currency else None,
        }

    def _ubl_add_tax_totals_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        # Two TaxTotal: the first one in the document currency with the tax breakdown, the second one in the company
        # currency (ZATCA's tax currency) without breakdown.
        aggregated_tax_details = self._l10n_sa_aggregate_base_lines_tax_details(vals, vals['base_lines'])
        vals['document_node']['cac:TaxTotal'] = [
            self._l10n_sa_get_tax_total_node(vals, aggregated_tax_details),
            self._l10n_sa_get_tax_total_node(vals, aggregated_tax_details, in_foreign_currency=False),
        ]
        vals['document_node']['cac:WithholdingTaxTotal'] = None

    # -------------------------------------------------------------------------
    # EXPORT: Line nodes
    # -------------------------------------------------------------------------

    def _ubl_add_line_id_node(self, vals):
        vals['line_node']['cbc:ID'] = {'_text': vals['line_vals']['index']}

    def _ubl_add_line_note_nodes(self, vals):
        vals['line_node']['cbc:Note'] = None

    def _ubl_add_line_extension_amount_node(self, vals, in_foreign_currency=True):
        line_amounts = self._l10n_sa_get_line_amounts(vals, vals['line_vals']['base_line'])
        vals['line_node']['cbc:LineExtensionAmount'] = {
            '_text': self.format_float(line_amounts['total_excluded_currency'], self._get_currency_decimal_places(vals['currency'])),
            'currencyID': vals['currency'].name,
        }

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        nodes = vals['line_node']['cac:AllowanceCharge'] = []
        base_line = vals['line_vals']['base_line']
        currency_dp = self._get_currency_decimal_places(vals['currency'])
        currency_name = vals['currency'].name

        discount_amount_currency = self._l10n_sa_get_line_amounts(vals, base_line)['discount_amount_currency']
        if not float_is_zero(discount_amount_currency, precision_digits=currency_dp):
            nodes.append({
                'cbc:ChargeIndicator': {'_text': 'false' if discount_amount_currency > 0 else 'true'},
                'cbc:AllowanceChargeReasonCode': {'_text': '95'},
                'cbc:Amount': {
                    '_text': self.format_float(abs(discount_amount_currency), currency_dp),
                    'currencyID': currency_name,
                },
            })

        for tax_data in base_line.get('_l10n_sa_recycling_contribution_taxes_data', []):
            nodes.append({
                'cbc:ChargeIndicator': {'_text': 'true' if tax_data['tax_amount_currency'] > 0 else 'false'},
                'cbc:AllowanceChargeReasonCode': {'_text': 'AEO' if tax_data['tax_amount_currency'] > 0 else '100'},
                'cbc:AllowanceChargeReason': {'_text': tax_data['tax'].name},
                'cbc:Amount': {
                    '_text': self.format_float(abs(tax_data['tax_amount_currency']), currency_dp),
                    'currencyID': currency_name,
                },
            })

    def _ubl_add_line_tax_totals_nodes(self, vals):
        aggregated_tax_details = self._l10n_sa_aggregate_base_line_tax_details(vals, vals['line_vals']['base_line'])
        currency_dp = self._get_currency_decimal_places(vals['currency'])
        currency_name = vals['currency'].name

        total_tax_amount = sum(
            values['tax_amount_currency']
            for grouping_key, values in aggregated_tax_details.items()
            if grouping_key
        )
        total_base_amount = sum(
            values['base_amount_currency']
            for grouping_key, values in aggregated_tax_details.items()
            if grouping_key
        )
        total_amount = total_base_amount + total_tax_amount

        vals['line_node']['cac:TaxTotal'] = [{
            'cbc:TaxAmount': {
                '_text': self.format_float(total_tax_amount, currency_dp),
                'currencyID': currency_name,
            },
            'cbc:RoundingAmount': {
                # This should simply contain the net (base + tax) amount for the line.
                '_text': self.format_float(total_amount, currency_dp),
                'currencyID': currency_name,
            },
            # No TaxSubtotal: BR-KSA-80: only downpayment lines should have a tax subtotal breakdown.
        }]

    def _ubl_add_line_item_node(self, vals):
        base_line = vals['line_vals']['base_line']
        product = base_line['product_id']
        line_name = base_line.get('_line_name')
        item_node = vals['line_node']['cac:Item'] = {
            'cbc:Description': {'_text': line_name or product.description_sale},
            'cbc:Name': {'_text': product.name or line_name},
            'cac:SellersItemIdentification': {
                'cbc:ID': {'_text': product.code or product.default_code},
            },
            'cac:StandardItemIdentification': {
                'cbc:ID': {
                    '_text': product.barcode,
                    'schemeID': '0160',  # GTIN
                } if product.barcode else None,
            },
            'cac:AdditionalItemProperty': [
                {
                    'cbc:Name': {'_text': value.attribute_id.name},
                    'cbc:Value': {'_text': value.name},
                } for value in product.product_template_attribute_value_ids
            ],
        }
        aggregated_tax_details = self._l10n_sa_aggregate_base_line_tax_details(vals, base_line)
        item_node['cac:ClassifiedTaxCategory'] = [
            self._get_tax_category_node(vals, grouping_key)
            for grouping_key in aggregated_tax_details
            if grouping_key
        ]

    def _ubl_add_line_price_node(self, vals, in_foreign_currency=True):
        """
        Use 10 decimal places for PriceAmount to satisfy ZATCA validation BR-KSA-EN16931-11
        """
        line_amounts = self._l10n_sa_get_line_amounts(vals, vals['line_vals']['base_line'])
        vals['line_node']['cac:Price'] = {
            'cbc:PriceAmount': {
                '_text': round(line_amounts['gross_price_unit_currency'], 10),
                'currencyID': vals['currency'].name,
            },
        }

    # -------------------------------------------------------------------------
    # EXPORT: Helpers for hash generation
    # -------------------------------------------------------------------------

    def _l10n_sa_get_namespaces(self):
        """
        Namespaces used in the final UBL declaration, required to canonalize the finalized XML document of the Invoice
        """
        return {
            'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
            'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
            'ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
            'sig': 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2',
            'sac': 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2',
            'sbc': 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2',
            'ds': 'http://www.w3.org/2000/09/xmldsig#',
            'xades': 'http://uri.etsi.org/01903/v1.3.2#',
        }

    # -------------------------------------------------------------------------
    # EXPORT: Templates for document allowance charge nodes
    # -------------------------------------------------------------------------

    def _l10n_sa_get_document_allowance_charge_node(self, vals, base_line):
        """
        Charge Reasons & Codes (As per ZATCA):
        https://unece.org/fileadmin/DAM/trade/untdid/d16b/tred/tred5189.htm
        As far as ZATCA is concerned, we calculate Allowance/Charge vals for global discounts as
        a document level allowance, and we do not include any other charges or allowances.
        """
        aggregated_tax_details = self._l10n_sa_aggregate_base_line_tax_details(vals, base_line)
        tax_category_nodes = [
            self._get_tax_category_node(vals, grouping_key)
            for grouping_key in aggregated_tax_details
            if grouping_key
        ]

        base_amount_currency = base_line['tax_details']['total_excluded_currency']
        if base_line['special_type'] == 'early_payment':
            return {
                'cbc:ChargeIndicator': {'_text': 'false' if base_amount_currency < 0.0 else 'true'},
                'cbc:AllowanceChargeReasonCode': {'_text': '66' if base_amount_currency < 0.0 else 'ZZZ'},
                'cbc:AllowanceChargeReason': {'_text': _("Conditional cash/payment discount")},
                'cbc:Amount': {
                    '_text': self.format_float(abs(base_amount_currency), self._get_currency_decimal_places(vals['currency'])),
                    'currencyID': vals['currency'].name,
                },
                'cac:TaxCategory': tax_category_nodes,
            }
        if base_amount_currency < 0:
            return {
                'cbc:ChargeIndicator': {'_text': 'false'},
                'cbc:AllowanceChargeReasonCode': {'_text': '95'},
                'cbc:AllowanceChargeReason': {'_text': 'Discount'},
                'cbc:Amount': {
                    '_text': self.format_float(abs(base_amount_currency), 2),
                    'currencyID': vals['currency'].name,
                },
                'cac:TaxCategory': tax_category_nodes,
            }

        return {}

    def _ubl_add_allowance_charge_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        vals['document_node']['cac:AllowanceCharge'] = [
            self._l10n_sa_get_document_allowance_charge_node(vals, base_line)
            for base_line in vals['base_lines']
            if self._l10n_sa_is_document_allowance_charge(base_line)
        ]

    # -------------------------------------------------------------------------
    # EXPORT: Templates for document header nodes helpers
    # -------------------------------------------------------------------------

    def _l10n_sa_get_delivery_node(self, vals, record, delivery_date=None):
        issue_date = fields.Datetime.context_timestamp(
            self.with_context(tz='Asia/Riyadh'),
            record.l10n_sa_confirmation_datetime,
        )
        node = {
            # The delivery address is not reported.
            'cac:DeliveryLocation': None,
            'cbc:ActualDeliveryDate': {'_text': delivery_date or issue_date},
        }
        if record.l10n_sa_edi_supply_end_date:
            node['cbc:LatestDeliveryDate'] = {'_text': record.l10n_sa_edi_supply_end_date}
        return node

    def _l10n_sa_get_payment_means_node(self, vals, record):
        """ PaymentMeans with the ZATCA payment means code (UN/ECE 4461) and the adjustment reason (KSA-10). """
        node = {
            'cbc:PaymentMeansCode': {
                '_text': PAYMENT_MEANS_CODE.get(
                    record._l10n_sa_get_payment_means_code(),
                    PAYMENT_MEANS_CODE['unknown'],
                ),
                'listID': 'UN/ECE 4461',
            },
            'cbc:InstructionNote': {'_text': record._l10n_sa_get_adjustment_reason()},
        }
        return node

    def _ubl_add_notes_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        record = vals.get('invoice')
        vals['document_node']['cbc:Note'] = [
            {'_text': html2plaintext(record.narration) if record and record.narration else None},
        ]

    # -------------------------------------------------------------------------
    # Tax Category and Exemption
    # -------------------------------------------------------------------------

    def _get_tax_category_code(self, customer, supplier, tax):
        """
        Get ZATCA tax category code based on tax configuration.

        ZATCA Tax Categories:
        - S: Standard rated
        - E: Exempted (VATEX-SA-29, 29-7, 30)
        - Z: Zero rated with VAT (VATEX-SA-32 through 36, EDU, HEA)
        - O: Not subject to VAT

        :param customer: res.partner - Customer/buyer
        :param supplier: res.partner - Supplier/seller
        :param tax: account.tax - Tax record
        :return: str - Tax category code
        """
        if supplier.country_id.code == 'SA':
            if tax and tax.amount != 0:
                return 'S'
            if tax and tax.ubl_cii_tax_exemption_reason_code in TAX_EXEMPTION_CODES:
                return 'E'
            if tax and tax.ubl_cii_tax_exemption_reason_code in TAX_ZERO_RATE_CODES:
                return 'Z'

            return 'O'
        return super()._get_tax_category_code(customer, supplier, tax)

    def _get_tax_exemption_reason(self, customer, supplier, tax):
        """
        Get tax exemption reason code and description for ZATCA.

        :param customer: res.partner - Customer/buyer
        :param supplier: res.partner - Supplier/seller
        :param tax: account.tax - Tax record
        :return: dict - Contains tax_exemption_reason_code and tax_exemption_reason
        """
        if supplier.country_id.code != 'SA':
            return super()._get_tax_exemption_reason(customer, supplier, tax)

        if tax and tax.amount == 0:
            exemption_reason_by_code = dict(tax._fields["ubl_cii_tax_exemption_reason_code"]._description_selection(self.env))
            code = tax.ubl_cii_tax_exemption_reason_code or "VATEX-SA-OOS"
            exemption_reason = exemption_reason_by_code[code].split(code)[1].lstrip() if code else "Not subject to VAT"

            if code == "VATEX-SA-OOS" and (tax_exemption_reason := tax.ubl_cii_tax_exemption_reason):
                # In case of VATEX-SA-OOS we allow the user to use his own defined exemption reason
                exemption_reason = tax_exemption_reason

            return {
                'tax_exemption_reason_code': code,
                'tax_exemption_reason': exemption_reason,
            }

        return {
            'tax_exemption_reason_code': None,
            'tax_exemption_reason': None,
        }

    # -------------------------------------------------------------------------
    # XML Hash Generation
    # -------------------------------------------------------------------------

    def _l10n_sa_generate_invoice_xml_sha(self, xml_content):
        """
        Generate SHA256 hash of transformed and canonicalized invoice XML.

        Process:
        1. Parse XML content
        2. Transform using XSLT to remove signatures
        3. Canonicalize using c14n method
        4. Hash using SHA256

        :param xml_content: bytes or str - XML content
        :return: hashlib.sha256 object
        """
        def _canonicalize_xml(content):
            """Canonicalize XML using c14n method."""
            return etree.tostring(
                content,
                method="c14n",
                exclusive=False,
                with_comments=False,
                inclusive_ns_prefixes=self._l10n_sa_get_namespaces(),
            )

        def _transform_and_canonicalize_xml(content):
            """Transform XML to remove signatures then canonicalize."""
            invoice_xsl = etree.parse(file_path('l10n_sa_edi/data/pre-hash_invoice.xsl'))
            transform = etree.XSLT(invoice_xsl)
            return _canonicalize_xml(transform(content))

        root = etree.fromstring(xml_content)
        transformed_xml = _transform_and_canonicalize_xml(root)
        return sha256(transformed_xml)

    def _l10n_sa_generate_invoice_xml_hash(self, xml_content, mode='hexdigest'):
        """
        Generate the b64 encoded sha256 hash of a given xml string:
            - First: Transform the xml content using a pre-hash_invoice.xsl file
            - Second: Canonicalize the transformed xml content using the c14n method
            - Third: hash the canonicalized content using the sha256 algorithm then encode it into b64 format
        """
        xml_sha = self._l10n_sa_generate_invoice_xml_sha(xml_content)
        if mode == 'hexdigest':
            xml_hash = xml_sha.hexdigest().encode()
        elif mode == 'digest':
            xml_hash = xml_sha.digest()
        return b64encode(xml_hash)

    # -------------------------------------------------------------------------
    # Common Filename Generation
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, record):
        """
            Generate the name of the invoice XML file according to ZATCA business rules:
            Seller Vat Number (BT-31), Date (BT-2), Time (KSA-25), Invoice Number (BT-1)
        """
        vat = record.company_id.partner_id.commercial_partner_id.vat
        record_number = re.sub(r'[^a-zA-Z0-9 -]+', '-', record.name)
        record_date = fields.Datetime.context_timestamp(self.with_context(tz='Asia/Riyadh'), record.l10n_sa_confirmation_datetime)
        file_name = f"{vat}_{record_date.strftime('%Y%m%dT%H%M%S')}_{record_number}"
        file_format = self.env.context.get('l10n_sa_file_format', 'xml')
        if file_format:
            file_name = f'{file_name}.{file_format}'
        return file_name
