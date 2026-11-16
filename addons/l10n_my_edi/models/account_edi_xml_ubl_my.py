# Part of Odoo. See LICENSE file for full copyright and licensing details.
import re
from datetime import datetime, UTC

from lxml import etree

from odoo import _, api, models
from odoo.tools import float_round, html2plaintext

from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt

# Far from ideal, but no better solution yet.
COUNTRY_CODE_MAP = {
    "BD": "BGD", "BE": "BEL", "BF": "BFA", "BG": "BGR", "BA": "BIH", "BB": "BRB", "WF": "WLF", "BL": "BLM", "BM": "BMU",
    "BN": "BRN", "BO": "BOL", "BH": "BHR", "BI": "BDI", "BJ": "BEN", "BT": "BTN", "JM": "JAM", "BV": "BVT", "BW": "BWA",
    "WS": "WSM", "BQ": "BES", "BR": "BRA", "BS": "BHS", "JE": "JEY", "BY": "BLR", "BZ": "BLZ", "RU": "RUS", "RW": "RWA",
    "RS": "SRB", "TL": "TLS", "RE": "REU", "TM": "TKM", "TJ": "TJK", "RO": "ROU", "TK": "TKL", "GW": "GNB", "GU": "GUM",
    "GT": "GTM", "GS": "SGS", "GR": "GRC", "GQ": "GNQ", "GP": "GLP", "JP": "JPN", "GY": "GUY", "GG": "GGY", "GF": "GUF",
    "GE": "GEO", "GD": "GRD", "GB": "GBR", "GA": "GAB", "SV": "SLV", "GN": "GIN", "GM": "GMB", "GL": "GRL", "GI": "GIB",
    "GH": "GHA", "OM": "OMN", "TN": "TUN", "JO": "JOR", "HR": "HRV", "HT": "HTI", "HU": "HUN", "HK": "HKG", "HN": "HND",
    "HM": "HMD", "VE": "VEN", "PR": "PRI", "PS": "PSE", "PW": "PLW", "PT": "PRT", "SJ": "SJM", "PY": "PRY", "IQ": "IRQ",
    "PA": "PAN", "PF": "PYF", "PG": "PNG", "PE": "PER", "PK": "PAK", "PH": "PHL", "PN": "PCN", "PL": "POL", "PM": "SPM",
    "ZM": "ZMB", "EH": "ESH", "EE": "EST", "EG": "EGY", "ZA": "ZAF", "EC": "ECU", "IT": "ITA", "VN": "VNM", "SB": "SLB",
    "ET": "ETH", "SO": "SOM", "ZW": "ZWE", "SA": "SAU", "ES": "ESP", "ER": "ERI", "ME": "MNE", "MD": "MDA", "MG": "MDG",
    "MF": "MAF", "MA": "MAR", "MC": "MCO", "UZ": "UZB", "MM": "MMR", "ML": "MLI", "MO": "MAC", "MN": "MNG", "MH": "MHL",
    "MK": "MKD", "MU": "MUS", "MT": "MLT", "MW": "MWI", "MV": "MDV", "MQ": "MTQ", "MP": "MNP", "MS": "MSR", "MR": "MRT",
    "IM": "IMN", "UG": "UGA", "TZ": "TZA", "MY": "MYS", "MX": "MEX", "IL": "ISR", "FR": "FRA", "IO": "IOT", "SH": "SHN",
    "FI": "FIN", "FJ": "FJI", "FK": "FLK", "FM": "FSM", "FO": "FRO", "NI": "NIC", "NL": "NLD", "NO": "NOR", "NA": "NAM",
    "VU": "VUT", "NC": "NCL", "NE": "NER", "NF": "NFK", "NG": "NGA", "NZ": "NZL", "NP": "NPL", "NR": "NRU", "NU": "NIU",
    "CK": "COK", "XK": "XKX", "CI": "CIV", "CH": "CHE", "CO": "COL", "CN": "CHN", "CM": "CMR", "CL": "CHL", "CC": "CCK",
    "CA": "CAN", "CG": "COG", "CF": "CAF", "CD": "COD", "CZ": "CZE", "CY": "CYP", "CX": "CXR", "CR": "CRI", "CW": "CUW",
    "CV": "CPV", "CU": "CUB", "SZ": "SWZ", "SY": "SYR", "SX": "SXM", "KG": "KGZ", "KE": "KEN", "SS": "SSD", "SR": "SUR",
    "KI": "KIR", "KH": "KHM", "KN": "KNA", "KM": "COM", "ST": "STP", "SK": "SVK", "KR": "KOR", "SI": "SVN", "KP": "PRK",
    "KW": "KWT", "SN": "SEN", "SM": "SMR", "SL": "SLE", "SC": "SYC", "KZ": "KAZ", "KY": "CYM", "SG": "SGP", "SE": "SWE",
    "SD": "SDN", "DO": "DOM", "DM": "DMA", "DJ": "DJI", "DK": "DNK", "VG": "VGB", "DE": "DEU", "YE": "YEM", "DZ": "DZA",
    "US": "USA", "UY": "URY", "YT": "MYT", "UM": "UMI", "LB": "LBN", "LC": "LCA", "LA": "LAO", "TV": "TUV", "TW": "TWN",
    "TT": "TTO", "TR": "TUR", "LK": "LKA", "LI": "LIE", "LV": "LVA", "TO": "TON", "LT": "LTU", "LU": "LUX", "LR": "LBR",
    "LS": "LSO", "TH": "THA", "TF": "ATF", "TG": "TGO", "TD": "TCD", "TC": "TCA", "LY": "LBY", "VA": "VAT", "VC": "VCT",
    "AE": "ARE", "AD": "AND", "AG": "ATG", "AF": "AFG", "AI": "AIA", "VI": "VIR", "IS": "ISL", "IR": "IRN", "AM": "ARM",
    "AL": "ALB", "AO": "AGO", "AQ": "ATA", "AS": "ASM", "AR": "ARG", "AU": "AUS", "AT": "AUT", "AW": "ABW", "IN": "IND",
    "AX": "ALA", "AZ": "AZE", "IE": "IRL", "ID": "IDN", "UA": "UKR", "QA": "QAT", "MZ": "MOZ"
}
E_164_REGEX = re.compile(r"^\+[1-9]\d{1,14}$")


class AccountEdiXmlUBLMyInvoisMY(models.AbstractModel):
    """ Malaysian e-Invoice (MyInvois) in the UBL 2.1 syntax.

    MyInvois is a national UBL 2.1 customization defined by the Inland Revenue Board of Malaysia (LHDN): it is
    neither an EN 16931 CIUS nor a Peppol format (no CustomizationID/ProfileID, the kind of document is given by the
    InvoiceTypeCode 01-04/11-14, version 1.1), so it only relies on the UBL syntax layer 'account.edi.ubl'.

    A MyInvois document (myinvois.document) is not necessarily a single invoice: it can consolidate several invoices
    (or PoS orders). The export is thus driven by the document ('_export_myinvois_document') instead of an account.move,
    every document being exported with the Invoice template.

    * MyInvois API formats doc: https://sdk.myinvois.hasil.gov.my/documents
    * Invoice v1.1: https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/
    """
    _name = 'account.edi.xml.ubl_myinvois_my'
    _inherit = 'account.edi.ubl'
    _description = "Malaysian implementation of ubl for the MyInvois portal"

    # -------------------------------------------------------------------------
    # EXPORT: Builder interface
    # -------------------------------------------------------------------------

    def _export_myinvois_document(self, myinvois_document):
        """ Entry point of the export of a MyInvois document.

        :param myinvois_document:   The myinvois.document to export.
        :return:                    A tuple (xml_content as bytes, set of error messages).
        """
        vals = self._init_myinvois_document_export_values(myinvois_document)
        self._export_document(vals)
        xml_content = dict_to_xml(
            vals['document_node'],
            nsmap=vals['document_node']['_nsmap'],
            template=vals['document_node']['_template'],
        )
        return etree.tostring(xml_content, xml_declaration=True, encoding='UTF-8'), vals['errors']

    def _init_myinvois_document_export_values(self, myinvois_document):
        """ Collect the values describing the MyInvois document to export (the equivalent of
        '_init_invoice_export_values' for a myinvois.document).
        """
        supplier = myinvois_document.company_id.partner_id.commercial_partner_id

        if myinvois_document._is_consolidated_invoice() or myinvois_document._is_consolidated_invoice_refund():
            customer = self.env["res.partner"].search(
                domain=[
                    *self.env['res.partner']._check_company_domain(myinvois_document.company_id),
                    '|',
                    ('vat', '=', 'EI00000000010'),
                    ('l10n_my_edi_malaysian_tin', '=', 'EI00000000010'),
                ],
                limit=1,
            )

            if not customer and myinvois_document._is_consolidated_invoice():
                # This could happen if the General Public partner wasn't loaded, or was deleted.
                # To keep it simple, we will simply use a temporary partner record with the same data for that case.
                customer = self.env['res.partner'].new({
                    'name': 'General Public',
                    'vat': 'EI00000000010',
                    'country_id': self.env.ref('base.my'),
                    'state_id': self.env.ref('base.state_my_jhr'),
                    'phone': 'NA',
                    'street': 'NA',
                    'city': 'NA',
                    'l10n_my_identification_type': 'BRN',
                    'l10n_my_identification_number': 'NA',
                    'l10n_my_edi_industrial_classification': self.env.ref('l10n_my_edi.class_00000', raise_if_not_found=False),
                })

            delivery = None
            payment_term = None  # wouldn't make sense in a consolidated invoice.
        else:
            invoice = myinvois_document.invoice_ids[0]  # Otherwise it would be a consolidated invoice.
            customer = invoice.partner_id
            delivery = invoice.partner_shipping_id or customer
            payment_term = invoice.invoice_payment_term_id

        document_type_code, original_documents = self._l10n_my_edi_get_document_type_code(myinvois_document)
        # In case of self billing, we want to invert the supplier and customer.
        if document_type_code in ("11", "12", "13", "14"):
            supplier, customer = customer, supplier
            delivery = customer
            document_ref = ','.join([invoice.ref for invoice in myinvois_document.invoice_ids if invoice.ref]) or None
        else:
            document_ref = None

        vals = {
            'myinvois_document': myinvois_document,
            'document_type_code': document_type_code,
            'original_documents': original_documents,
            'document_name': myinvois_document.name,
            'document_ref': document_ref,
            'company': myinvois_document.company_id,
            'currency': myinvois_document.currency_id,
            'company_currency': myinvois_document.company_id.currency_id,
            'supplier': supplier,
            'customer': customer,
            'delivery': delivery,
            'custom_form_reference': myinvois_document.myinvois_custom_form_reference,
            'incoterm': myinvois_document.invoice_ids.invoice_incoterm_id,
            'payment_term': payment_term,
        }
        # Every MyInvois document is an Invoice, the kind of document being given by the type code.
        self._define_document_type(vals, 'invoice')

        self._l10n_my_edi_add_base_lines_vals(vals)
        self._l10n_my_edi_add_monetary_total_vals(vals)
        self._l10n_my_edi_add_paid_amount_vals(vals)
        return vals

    def _l10n_my_edi_add_base_lines_vals(self, vals):
        """ Add the base lines of the document. The recycling contribution taxes (e.g. RECUPEL) are reported as line
        allowances/charges, the emptying taxes as separate lines and the cash rounding as rounding amount.
        """
        myinvois_document = vals['myinvois_document']
        base_lines = myinvois_document._get_rounded_base_lines()

        for base_line in base_lines:
            base_line['_ubl_values'] = {'recycling_contribution_taxes_data': []}
            tax_details = base_line['tax_details']
            new_taxes_data = []
            for tax_data in tax_details['taxes_data']:
                if self._is_recycling_contribution_tax(tax_data):
                    base_line['_ubl_values']['recycling_contribution_taxes_data'].append(tax_data)
                    tax_details['raw_total_excluded_currency'] += tax_data['raw_tax_amount_currency']
                    tax_details['raw_total_excluded'] += tax_data['raw_tax_amount']
                    tax_details['total_excluded_currency'] += tax_data['tax_amount_currency']
                    tax_details['total_excluded'] += tax_data['tax_amount']
                else:
                    new_taxes_data.append(tax_data)
            tax_details['taxes_data'] = new_taxes_data

        base_lines = self._turn_emptying_taxes_as_new_base_lines(base_lines, vals['company'], vals)

        vals['base_lines'] = [base_line for base_line in base_lines if not self._is_cash_rounding_base_line(base_line)]
        vals['cash_rounding_base_lines'] = [base_line for base_line in base_lines if self._is_cash_rounding_base_line(base_line)]

    def _l10n_my_edi_get_tax_grouping_key(self, base_line, tax_data):
        """ How the taxes are grouped in the TaxTotal/TaxSubtotal and ClassifiedTaxCategory nodes. """
        tax = tax_data and tax_data['tax']
        myinvois_document = base_line['myinvois_document']

        if (
            not tax
            and not myinvois_document._is_consolidated_invoice()
            and not myinvois_document._is_consolidated_invoice_refund()
        ):
            return None  # Triggers UserError for missing tax on simple invoice.

        is_exempt_tax = tax and tax.l10n_my_tax_type == 'E'
        tax_exemption_reason = is_exempt_tax and (
            myinvois_document.myinvois_exemption_reason
            or tax.l10n_my_tax_exemption_reason
        )

        return {
            'tax_category_code': tax.l10n_my_tax_type if tax else '06',
            'tax_exemption_reason': tax_exemption_reason,
            'amount': tax.amount if tax else 0.0,
            'amount_type': tax.amount_type if tax else 'percent',
        }

    def _l10n_my_edi_get_fixed_tax_amount(self, base_line, currency_suffix):
        """ The amount of the fixed taxes of a base line, included in the line amounts. """
        return sum(
            tax_data[f'tax_amount{currency_suffix}']
            for tax_data in base_line['tax_details']['taxes_data']
            if tax_data['tax'].amount_type == 'fixed'
        )

    def _l10n_my_edi_add_monetary_total_vals(self, vals):
        AccountTax = self.env['account.tax']

        for currency_suffix in ('', '_currency'):
            for key in ('total_allowance', 'total_charge', 'total_lines'):
                vals[f'{key}{currency_suffix}'] = 0.0

        for base_line in vals['base_lines']:
            for currency_suffix in ('', '_currency'):
                base_line_total_excluded = (
                    base_line['tax_details'][f'total_excluded{currency_suffix}']
                    + base_line['tax_details'][f'delta_total_excluded{currency_suffix}']
                    + self._l10n_my_edi_get_fixed_tax_amount(base_line, currency_suffix)
                )
                if self._is_early_payment_base_line(base_line):
                    if base_line_total_excluded < 0.0:
                        vals[f'total_allowance{currency_suffix}'] += -base_line_total_excluded
                    else:
                        vals[f'total_charge{currency_suffix}'] += base_line_total_excluded
                else:
                    vals[f'total_lines{currency_suffix}'] += base_line_total_excluded

        def non_fixed_grouping_function(base_line, tax_data):
            if tax_data and tax_data['tax'].amount_type == 'fixed':
                return None
            return True

        base_lines_aggregated_tax_details = AccountTax._aggregate_base_lines_tax_details(vals['base_lines'], non_fixed_grouping_function)
        aggregated_tax_details = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_tax_details)
        for currency_suffix in ('', '_currency'):
            vals[f'tax_exclusive_amount{currency_suffix}'] = (
                vals[f'total_lines{currency_suffix}']
                + vals[f'total_charge{currency_suffix}']
                - vals[f'total_allowance{currency_suffix}']
            )
            vals[f'total_tax_amount{currency_suffix}'] = sum(
                tax_details[f'tax_amount{currency_suffix}']
                for grouping_key, tax_details in aggregated_tax_details.items()
                if grouping_key
            )
            vals[f'tax_inclusive_amount{currency_suffix}'] = vals[f'tax_exclusive_amount{currency_suffix}'] + vals[f'total_tax_amount{currency_suffix}']
            vals[f'cash_rounding_base_amount{currency_suffix}'] = sum(
                base_line['tax_details'][f'total_excluded{currency_suffix}']
                for base_line in vals['cash_rounding_base_lines']
            )

    def _l10n_my_edi_add_paid_amount_vals(self, vals):
        """ Add the amount paid in advance ('total_paid_amount' and 'total_paid_amount_currency'). """
        vals['total_paid_amount'] = vals['total_paid_amount_currency'] = 0.0
        myinvois_document = vals['myinvois_document']
        if myinvois_document.invoice_ids:
            # Genuine prepayments only; the base implementation would otherwise treat any reconciled payment,
            # regardless of its date, as a deposit.
            prepaid_amounts = {invoice: self._l10n_my_edi_get_prepaid_amount(invoice) for invoice in myinvois_document.invoice_ids}
            vals.update({
                'total_paid_amount': sum(amount * invoice.invoice_currency_rate for invoice, amount in prepaid_amounts.items()),
                'total_paid_amount_currency': sum(prepaid_amounts.values()),
            })

    def _l10n_my_edi_get_reported_prepaid_amount(self, vals):
        """ The prepaid amount reported in the PrepaidPayment node and deducted from the PayableAmount. """
        myinvois_document = vals['myinvois_document']
        # Consolidated invoices have no genuine prepayment to report.
        # For credit, debit, refund notes, and their self-billed variants, the PrepaidPayment amount must be set to 0:
        # the PayableAmount reflects the full refund/adjustment amount, as per MyInvois specifications.
        if myinvois_document._is_consolidated_invoice() or vals['document_type_code'] in ('02', '03', '04', '12', '13', '14'):
            return 0.0
        return vals['total_paid_amount_currency']

    def _l10n_my_edi_format_amount(self, vals, amount):
        return FloatFmt(amount, min_dp=self._get_currency_decimal_places(vals['currency']))

    def _l10n_my_edi_get_amount_node(self, vals, amount):
        return {
            '_text': self._l10n_my_edi_format_amount(vals, amount),
            'currencyID': vals['currency'].name,
        }

    # -------------------------------------------------------------------------
    # EXPORT: Document nodes
    # -------------------------------------------------------------------------

    def _fill_document_values(self, vals):
        # OVERRIDE account.edi.ubl: a MyInvois document is always an Invoice, without the Peppol optional fields.
        self._fill_template_values(vals)
        self._fill_nsmap_values(vals)
        self._fill_document_values_invoice(vals)

    def _fill_document_values_invoice(self, vals):
        # OVERRIDE account.edi.ubl
        self._ubl_add_version_id_node(vals)
        self._ubl_add_id_node(vals)
        self._ubl_add_issue_date_node(vals)
        self._ubl_add_due_date_node(vals)
        self._ubl_add_invoice_type_code_node(vals)
        self._ubl_add_document_currency_code_node(vals)
        self._ubl_add_buyer_reference_node(vals)
        self._ubl_add_order_reference_node(vals)
        self._ubl_add_billing_reference_nodes(vals)
        self._ubl_add_additional_document_reference_nodes(vals)
        self._ubl_add_accounting_supplier_party_node(vals)
        self._ubl_add_accounting_customer_party_node(vals)
        self._ubl_add_delivery_nodes(vals)
        self._ubl_add_payment_terms_nodes(vals)
        self._ubl_add_prepaid_payment_node(vals)
        self._ubl_add_allowance_charge_nodes(vals)
        self._ubl_add_tax_exchange_rate_node(vals)
        self._ubl_add_tax_totals_nodes(vals)
        self._ubl_add_legal_monetary_total_node(vals)
        self._ubl_add_invoice_line_nodes(vals)

    def _ubl_add_version_id_node(self, vals):
        # OVERRIDE account.edi.ubl
        vals['document_node']['cbc:UBLVersionID'] = None

    def _ubl_add_id_node(self, vals):
        # OVERRIDE account.edi.ubl
        document_id = vals['document_name']
        # Self-billed invoices must use the number given by the supplier.
        if vals['document_type_code'] in ('11', '12', '13', '14') and vals['document_ref'] and not vals['myinvois_document']._is_consolidated_invoice():
            document_id = vals['document_ref']
        vals['document_node']['cbc:ID'] = {'_text': document_id}

    def _ubl_add_issue_date_node(self, vals):
        # OVERRIDE account.edi.ubl
        # The issue date and time must be the current time set in the UTC time zone
        now = datetime.now(tz=UTC)
        vals['document_node']['cbc:IssueDate'] = {'_text': now.strftime("%Y-%m-%d")}
        vals['document_node']['cbc:IssueTime'] = {'_text': now.strftime("%H:%M:%SZ")}

    def _ubl_add_due_date_node(self, vals):
        # OVERRIDE account.edi.ubl
        vals['document_node']['cbc:DueDate'] = None

    def _ubl_add_invoice_type_code_node(self, vals):
        # OVERRIDE account.edi.ubl
        # The current version is 1.1 (document with signature), the type code depends on the move type.
        vals['document_node']['cbc:InvoiceTypeCode'] = {
            '_text': vals['document_type_code'],
            'listVersionID': '1.1',
        }

    def _ubl_add_document_currency_code_node(self, vals):
        # OVERRIDE account.edi.ubl
        self._ubl_add_document_currency_code_node_foreign_currency(vals)

    def _ubl_add_buyer_reference_node(self, vals):
        # OVERRIDE account.edi.ubl
        vals['document_node']['cbc:BuyerReference'] = {'_text': vals['customer'].commercial_partner_id.ref}

    def _ubl_add_order_reference_node(self, vals):
        # OVERRIDE account.edi.ubl
        vals['document_node']['cac:OrderReference'] = None

    def _l10n_my_edi_get_original_document_id(self, vals, original_document):
        if vals['document_type_code'] in {'02', '03', '04', '12', '13', '14'} and original_document:
            if original_document.myinvois_file:
                decoded_vals = self._l10n_my_edi_decode_myinvois_attachment(original_document.myinvois_file)
                return decoded_vals.get('original_document_id')
            original_invoice = original_document.invoice_ids[:1]
            if vals['document_type_code'] in {'12', '13', '14'} and original_invoice.ref:
                return original_invoice.ref
            if original_document.name:
                return original_document.name
        return None

    def _ubl_add_billing_reference_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        # Debit/Credit note original invoice ref.
        # Applies to credit notes, debit notes, refunds for both invoices and self-billed invoices.
        # The original document is mandatory; but in some specific cases it will be empty (sending a credit note for an invoice
        # managed outside Odoo/...)
        nodes = vals['document_node']['cac:BillingReference'] = []
        if vals['document_type_code'] in {'02', '03', '04', '12', '13', '14'}:
            for original_document in vals['original_documents'] or [None]:
                nodes.append({
                    'cac:InvoiceDocumentReference': {
                        'cbc:ID': {'_text': self._l10n_my_edi_get_original_document_id(vals, original_document) or 'NA'},
                        'cbc:UUID': {'_text': (original_document and original_document.myinvois_external_uuid) or 'NA'},
                    }
                })

    def _ubl_add_additional_document_reference_nodes(self, vals):
        nodes = vals['document_node']['cac:AdditionalDocumentReference'] = []
        if vals['document_type_code'] in {'11', '12', '13', '14'} and vals['custom_form_reference']:
            nodes.append({
                'cbc:ID': {'_text': vals['custom_form_reference']},
                'cbc:DocumentType': {'_text': 'CustomsImportForm'},
            })
        if vals['incoterm']:
            nodes.append({
                'cbc:ID': {'_text': vals['incoterm'].code},
            })
        if vals['document_type_code'] in {'01', '02', '03', '04'} and vals['custom_form_reference']:
            nodes.append({
                'cbc:ID': {'_text': vals['custom_form_reference']},
                'cbc:DocumentType': {'_text': 'K2'},
            })

    def _ubl_get_partner_address_node(self, vals, partner):
        # OVERRIDE account.edi.ubl
        # The API expects the iso3166-2 code for the state, in the same way as it expects the iso3166 code for the countries.
        # In Odoo, we mostly use these (although there is no standard format) so we'll try to use what Odoo gives us.
        # For malaysia, the codes were updated..
        subentity_code = ''
        country = partner.country_id

        if partner.state_id:
            if (
                partner._l10n_my_edi_get_tin_for_myinvois() == 'EI00000000010'
                and partner.l10n_my_identification_number == 'NA'
            ) or country.code != 'MY':
                # Special case for consolidated entities (e.g., general public) and non-Malaysian partners:
                # MyInvois requires the CountrySubentityCode to be fixed as '17' ("not applicable") since
                # Malaysian state codes don't apply to them.
                subentity_code = '17'
            else:
                # Get the subentity code for the partner, based on its state.
                subentity_code = partner.state_id.code

            # Strip 'MY-' prefix if present as we only need number part
            subentity_code = subentity_code.split('-')[1] if 'MY-' in subentity_code else subentity_code

        return {
            'cbc:CityName': {'_text': partner.city},
            'cbc:PostalZone': {'_text': partner.zip},
            'cbc:CountrySubentity': {'_text': partner.state_id.name},
            'cbc:CountrySubentityCode': {'_text': subentity_code},
            'cac:AddressLine': [
                {'cbc:Line': {'_text': partner.street}},
                {'cbc:Line': {'_text': partner.street2}},
            ],
            'cac:Country': {
                'cbc:IdentificationCode': {
                    '_text': COUNTRY_CODE_MAP.get(country.code),
                    'listAgencyID': '6',
                    'listID': 'ISO3166-1',
                },
                'cbc:Name': {'_text': country.name},
            },
        }

    def _ubl_add_party_industry_classification_code_node(self, vals):
        commercial_partner = vals['party_vals']['partner'].commercial_partner_id
        vals['party_node']['cbc:IndustryClassificationCode'] = {
            '_text': commercial_partner.l10n_my_edi_industrial_classification.code,
            'name': commercial_partner.l10n_my_edi_industrial_classification.name,
        } if vals['party_vals']['role'] == 'supplier' else None

    def _ubl_add_party_identification_nodes(self, vals):
        """ The id vals list must be filled with two values.
        The TIN, and then one of either:
            - Business registration number (BNR)
            - MyKad/MyTentera identification number (NRIC)
            - Passport number or MyPR/MyKAS identification number (PASSPORT)
            - (ARMY)
        Additionally, companies registered to use SST (sales & services tax) must provide their SST number.
        Finally, if a supplier is using TTX (tourism tax), once again that number must be provided.
        """
        # OVERRIDE account.edi.ubl
        partner = vals['party_vals']['partner'].commercial_partner_id
        role = vals['party_vals']['role']

        tin = partner._l10n_my_edi_get_tin_for_myinvois()

        # If the invoice's commercial partner uses a Generic TIN, set it to the correct generic TIN
        # depending on whether the invoice is self-billed or not.
        if vals['document_type_code'] in ('01', '02', '03', '04') and tin == 'EI00000000030' and role == 'customer':
            tin = 'EI00000000020'  # For normal invoices, this partner TIN should be used
        elif vals['document_type_code'] in ('11', '12', '13', '14') and tin == 'EI00000000020' and role == 'supplier':
            tin = 'EI00000000030'  # For self-billed invoices, this partner TIN should be used

        nodes = vals['party_node']['cac:PartyIdentification'] = [
            {
                'cbc:ID': {
                    '_text': tin,
                    'schemeID': 'TIN',
                }
            }
        ]

        if partner.l10n_my_identification_type and partner.l10n_my_identification_number:
            nodes.append({
                'cbc:ID': {
                    '_text': partner.l10n_my_identification_number,
                    'schemeID': partner.l10n_my_identification_type,
                }
            })
            if partner.sst_registration_number:
                nodes.append({
                    'cbc:ID': {
                        '_text': partner.sst_registration_number,
                        'schemeID': 'SST',
                    }
                })
            if partner.ttx_registration_number and role == 'supplier':
                nodes.append({
                    'cbc:ID': {
                        '_text': partner.ttx_registration_number,
                        'schemeID': 'TTX',
                    }
                })

    def _ubl_add_party_name_node(self, vals):
        # OVERRIDE account.edi.ubl
        partner = vals['party_vals']['partner']
        vals['party_node']['cac:PartyName'] = {
            'cbc:Name': {'_text': partner.display_name},
        } if vals['party_vals']['role'] != 'delivery' else None

    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_legal_entity_nodes(vals)
        vals['party_node']['cac:PartyLegalEntity'].append({
            'cbc:RegistrationName': {'_text': vals['party_vals']['partner'].commercial_partner_id.name},
        })

    def _ubl_add_party_contact_node(self, vals):
        # OVERRIDE account.edi.ubl
        partner = vals['party_vals']['partner']
        vals['party_node']['cac:Contact'] = {
            'cbc:ID': {'_text': partner.id},
            'cbc:Name': {'_text': partner.name},
            'cbc:Telephone': {'_text': self._l10n_my_edi_get_formatted_phone_number(partner.phone)},
            'cbc:ElectronicMail': {'_text': partner.email},
        } if vals['party_vals']['role'] != 'delivery' else None

    def _l10n_my_edi_get_party_node(self, vals, partner, role):
        party_node = {}
        sub_vals = {
            **vals,
            'party_vals': {'partner': partner, 'role': role},
            'party_node': party_node,
        }
        self._ubl_add_party_industry_classification_code_node(sub_vals)
        self._ubl_add_party_identification_nodes(sub_vals)
        self._ubl_add_party_name_node(sub_vals)
        self._ubl_add_party_postal_address_node(sub_vals)
        self._ubl_add_party_legal_entity_nodes(sub_vals)
        self._ubl_add_party_contact_node(sub_vals)
        return party_node

    def _ubl_add_accounting_supplier_party_node(self, vals):
        # OVERRIDE account.edi.ubl
        vals['document_node']['cac:AccountingSupplierParty'] = {
            'cac:Party': self._l10n_my_edi_get_party_node(vals, vals['supplier'], 'supplier'),
        }

    def _ubl_add_accounting_customer_party_node(self, vals):
        # OVERRIDE account.edi.ubl
        vals['document_node']['cac:AccountingCustomerParty'] = {
            'cac:Party': self._l10n_my_edi_get_party_node(vals, vals['customer'], 'customer'),
        }

    def _ubl_add_delivery_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        # The delivery party is the customer; there is no delivery on a consolidated invoice.
        nodes = vals['document_node']['cac:Delivery'] = []
        if not vals['myinvois_document']._is_consolidated_invoice():
            nodes.append({
                'cac:DeliveryParty': self._l10n_my_edi_get_party_node(vals, vals['customer'], 'delivery'),
            })

    def _ubl_add_payment_terms_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        nodes = vals['document_node']['cac:PaymentTerms'] = []
        if vals['payment_term'] and not vals['myinvois_document']._is_consolidated_invoice():
            nodes.append({
                # The payment term's note is automatically embedded in a <p> tag in Odoo
                'cbc:Note': {'_text': html2plaintext(vals['payment_term'].note)},
            })

    def _ubl_add_prepaid_payment_node(self, vals):
        amount_paid = self._l10n_my_edi_get_reported_prepaid_amount(vals)
        # Omit the node entirely rather than emitting it with a 0.00 amount when there is no genuine prepayment.
        vals['document_node']['cac:PrepaidPayment'] = {
            'cbc:PaidAmount': self._l10n_my_edi_get_amount_node(vals, amount_paid),
        } if amount_paid else None

    def _l10n_my_edi_get_tax_category_node(self, vals, grouping_key):
        return {
            'cbc:ID': {'_text': grouping_key['tax_category_code']},
            'cbc:Name': {'_text': grouping_key['tax_exemption_reason']},
            'cbc:Percent': {'_text': grouping_key['amount']} if grouping_key['amount_type'] == 'percent' else None,
            'cbc:TaxExemptionReason': {'_text': grouping_key['tax_exemption_reason']},
            'cac:TaxScheme': {
                'cbc:ID': {
                    '_text': 'OTH',
                    'schemeID': 'UN/ECE 5153',
                    'schemeAgencyID': '6',
                }
            }
        }

    def _l10n_my_edi_get_tax_total_node(self, vals, aggregated_tax_details):
        tax_details_per_key = [
            (grouping_key, tax_details)
            for grouping_key, tax_details in aggregated_tax_details.items()
            if grouping_key
        ]
        return {
            'cbc:TaxAmount': self._l10n_my_edi_get_amount_node(vals, sum(tax_details['tax_amount_currency'] for _key, tax_details in tax_details_per_key)),
            'cac:TaxSubtotal': [
                {
                    'cbc:TaxableAmount': self._l10n_my_edi_get_amount_node(vals, tax_details['base_amount_currency']),
                    'cbc:TaxAmount': self._l10n_my_edi_get_amount_node(vals, tax_details['tax_amount_currency']),
                    'cbc:Percent': {'_text': grouping_key['amount']} if grouping_key['amount_type'] == 'percent' else None,
                    'cac:TaxCategory': self._l10n_my_edi_get_tax_category_node(vals, grouping_key),
                }
                for grouping_key, tax_details in tax_details_per_key
            ],
        }

    def _l10n_my_edi_aggregate_base_line_tax_details(self, base_line):
        return self.env['account.tax']._aggregate_base_line_tax_details(base_line, self._l10n_my_edi_get_tax_grouping_key)

    def _ubl_add_allowance_charge_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        # The early payment discounts are reported as document level allowances/charges.
        nodes = vals['document_node']['cac:AllowanceCharge'] = []
        for base_line in vals['base_lines']:
            if not self._is_early_payment_base_line(base_line):
                continue
            base_amount = base_line['tax_details']['total_excluded_currency']
            nodes.append({
                'cbc:ChargeIndicator': {'_text': 'false' if base_amount < 0.0 else 'true'},
                'cbc:AllowanceChargeReasonCode': {'_text': '66' if base_amount < 0.0 else 'ZZZ'},
                'cbc:AllowanceChargeReason': {'_text': _("Conditional cash/payment discount")},
                'cbc:Amount': self._l10n_my_edi_get_amount_node(vals, abs(base_amount)),
                'cac:TaxCategory': [
                    self._l10n_my_edi_get_tax_category_node(vals, grouping_key)
                    for grouping_key in self._l10n_my_edi_aggregate_base_line_tax_details(base_line)
                    if grouping_key
                ],
            })

    def _ubl_add_tax_exchange_rate_node(self, vals):
        currency = vals['currency']
        if currency.name == 'MYR':
            vals['document_node']['cac:TaxExchangeRate'] = None
            return

        # I couldn't find any information on maximum precision, so we will use the currency format.
        total_amount_in_company_currency = total_amount_in_currency = 0.0
        for base_line in vals['base_lines']:
            total_amount_in_company_currency += base_line['tax_details']['raw_total_included']
            total_amount_in_currency += base_line['tax_details']['raw_total_included_currency']
        # We recalculate the rate so that it works in any cases, even when using consolidated invoices.
        rate = self.env.ref('base.MYR').round(abs(total_amount_in_company_currency) / (total_amount_in_currency or 1))
        # Exchange rate information must be provided if applicable
        vals['document_node']['cac:TaxExchangeRate'] = {
            'cbc:SourceCurrencyCode': {'_text': currency.name},
            'cbc:TargetCurrencyCode': {'_text': 'MYR'},
            'cbc:CalculationRate': {'_text': rate},
        }

    def _ubl_add_tax_totals_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        AccountTax = self.env['account.tax']
        base_lines_aggregated_tax_details = AccountTax._aggregate_base_lines_tax_details(vals['base_lines'], self._l10n_my_edi_get_tax_grouping_key)
        aggregated_tax_details = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_tax_details)
        vals['document_node']['cac:TaxTotal'] = [self._l10n_my_edi_get_tax_total_node(vals, aggregated_tax_details)]
        vals['document_node']['cac:WithholdingTaxTotal'] = None

    def _ubl_add_legal_monetary_total_node(self, vals):
        # OVERRIDE account.edi.ubl
        # For credit, debit, refund notes, and their self-billed variants, the PayableAmount reflects the full
        # refund/adjustment amount without being reduced by the prepayment, as per MyInvois specifications.
        amount_paid = self._l10n_my_edi_get_reported_prepaid_amount(vals)
        vals['document_node']['cac:LegalMonetaryTotal'] = {
            'cbc:LineExtensionAmount': self._l10n_my_edi_get_amount_node(vals, vals['total_lines_currency']),
            'cbc:TaxExclusiveAmount': self._l10n_my_edi_get_amount_node(vals, vals['tax_exclusive_amount_currency']),
            'cbc:TaxInclusiveAmount': self._l10n_my_edi_get_amount_node(vals, vals['tax_inclusive_amount_currency']),
            'cbc:AllowanceTotalAmount': self._l10n_my_edi_get_amount_node(vals, vals['total_allowance_currency']) if vals['total_allowance_currency'] else None,
            'cbc:ChargeTotalAmount': self._l10n_my_edi_get_amount_node(vals, vals['total_charge_currency']) if vals['total_charge_currency'] else None,
            'cbc:PrepaidAmount': self._l10n_my_edi_get_amount_node(vals, 0.0),
            'cbc:PayableRoundingAmount': self._l10n_my_edi_get_amount_node(vals, vals['cash_rounding_base_amount_currency']) if vals['cash_rounding_base_amount_currency'] else None,
            'cbc:PayableAmount': self._l10n_my_edi_get_amount_node(vals, vals['tax_inclusive_amount_currency'] - amount_paid),
        }

    # -------------------------------------------------------------------------
    # EXPORT: Line nodes
    # -------------------------------------------------------------------------

    def _should_export_early_payment_discount_as_line(self, vals):
        # EXTENDS account.edi.common
        # The early payment discounts are reported as document level allowances/charges.
        return False

    def _l10n_my_edi_add_line_amounts_vals(self, vals):
        """ Compute the amounts of a line: the total excluded (including the fixed taxes), the gross price unit and the
        discount amount (in 'line_vals').
        """
        line_vals = vals['line_vals']
        base_line = line_vals['base_line']
        company_currency = vals['company_currency']

        for currency_suffix in ('', '_currency'):
            line_vals[f'total_excluded{currency_suffix}'] = (
                base_line['tax_details'][f'total_excluded{currency_suffix}']
                + base_line['tax_details'][f'delta_total_excluded{currency_suffix}']
                + self._l10n_my_edi_get_fixed_tax_amount(base_line, currency_suffix)
            )

        raw_total_excluded_currency = base_line['tax_details']['raw_total_excluded_currency']
        raw_total_excluded = base_line['tax_details']['raw_total_excluded']
        total_excluded_currency = base_line['tax_details']['total_excluded_currency']
        total_excluded = base_line['tax_details']['total_excluded']
        for tax_data in base_line.get('_ubl_values', {}).get('recycling_contribution_taxes_data', []):
            raw_total_excluded_currency -= tax_data['raw_tax_amount_currency']
            raw_total_excluded -= tax_data['raw_tax_amount']
            total_excluded_currency -= tax_data['tax_amount_currency']
            total_excluded -= tax_data['tax_amount']

        discount_factor = 1 - (base_line['discount'] / 100.0)

        if discount_factor != 0.0:
            gross_subtotal_currency = base_line['currency_id'].round(raw_total_excluded_currency / discount_factor)
            gross_subtotal = company_currency.round(raw_total_excluded / discount_factor)
        else:
            gross_subtotal_currency = base_line['currency_id'].round(base_line['price_unit'] * base_line['quantity'])
            gross_subtotal = company_currency.round(gross_subtotal_currency / base_line['rate'])

        if base_line['quantity'] == 0.0 or discount_factor == 0.0:
            gross_price_unit_currency = base_line['price_unit']
            gross_price_unit = company_currency.round(base_line['price_unit'] / base_line['rate'])
        else:
            gross_price_unit_currency = gross_subtotal_currency / base_line['quantity']
            gross_price_unit = gross_subtotal / base_line['quantity']

        line_vals.update({
            'discount_amount_currency': gross_subtotal_currency - total_excluded_currency,
            'discount_amount': gross_subtotal - total_excluded,
            'gross_price_unit_currency': gross_price_unit_currency,
            'gross_price_unit': gross_price_unit,
        })

        # As we group lines together when consolidating, we lose the discount percentage in the process.
        # During the grouping, we stored the actual amount in the base line, so we use that pre-computed amount.
        if vals['myinvois_document']._is_consolidated_invoice():
            for currency_suffix in ('', '_currency'):
                discount_amount = base_line[f'discount_amount{currency_suffix}']
                line_vals[f'discount_amount{currency_suffix}'] = discount_amount
                line_vals[f'gross_price_unit{currency_suffix}'] += discount_amount  # Price unit should be excluding discounts.

    def _ubl_add_invoice_line_nodes(self, vals, filter_function=None):
        # OVERRIDE account.edi.ubl: no Peppol optional fields.
        nodes = vals['document_node']['cac:InvoiceLine'] = []
        for sub_vals in self._line_nodes_filter_base_lines(vals, filter_function=filter_function):
            self._ubl_add_invoice_line_node(sub_vals)
            nodes.append(sub_vals['line_node'])

    def _ubl_add_invoice_line_node(self, vals):
        # OVERRIDE account.edi.ubl
        self._l10n_my_edi_add_line_amounts_vals(vals)
        self._ubl_add_line_id_node(vals)
        self._ubl_add_line_invoiced_quantity_node(vals)
        self._ubl_add_line_extension_amount_node(vals)
        self._ubl_add_line_allowance_charge_nodes(vals)
        self._ubl_add_line_tax_totals_nodes(vals)
        self._ubl_add_line_item_node(vals)
        self._ubl_add_line_price_node(vals)
        self._ubl_add_line_item_price_extension_node(vals)

    def _ubl_add_line_extension_amount_node(self, vals, in_foreign_currency=True):
        # OVERRIDE account.edi.ubl
        vals['line_node']['cbc:LineExtensionAmount'] = self._l10n_my_edi_get_amount_node(vals, vals['line_vals']['total_excluded_currency'])

    def _ubl_add_line_allowance_charge_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_line_allowance_charge_nodes(vals)
        nodes = vals['line_node']['cac:AllowanceCharge']
        line_vals = vals['line_vals']

        # Discount.
        discount_amount = line_vals['discount_amount_currency']
        if not vals['currency'].is_zero(discount_amount):
            nodes.append({
                'cbc:ChargeIndicator': {'_text': 'false' if discount_amount > 0 else 'true'},
                'cbc:AllowanceChargeReasonCode': {'_text': '95'},
                'cbc:Amount': self._l10n_my_edi_get_amount_node(vals, abs(discount_amount)),
            })

        # Recycling contribution taxes.
        for tax_data in line_vals['base_line'].get('_ubl_values', {}).get('recycling_contribution_taxes_data', []):
            tax_amount = tax_data['tax_amount_currency']
            nodes.append({
                'cbc:ChargeIndicator': {'_text': 'true' if tax_amount > 0 else 'false'},
                'cbc:AllowanceChargeReasonCode': {'_text': 'AEO' if tax_amount > 0 else '100'},
                'cbc:AllowanceChargeReason': {'_text': tax_data['tax'].name},
                'cbc:Amount': self._l10n_my_edi_get_amount_node(vals, abs(tax_amount)),
            })

    def _ubl_add_line_tax_totals_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        aggregated_tax_details = self._l10n_my_edi_aggregate_base_line_tax_details(vals['line_vals']['base_line'])
        vals['line_node']['cac:TaxTotal'] = [self._l10n_my_edi_get_tax_total_node(vals, aggregated_tax_details)]

    def _ubl_add_line_item_name_description_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        base_line = vals['line_vals']['base_line']
        product = base_line['product_id']
        record = base_line['record']
        if record and record.name:
            line_name = record.name.replace('\n', ' ')
        else:
            line_name = base_line.get('line_name', '')
        vals['item_node']['cbc:Description'] = {'_text': line_name or product.description_sale}
        vals['item_node']['cbc:Name'] = {'_text': product.name or line_name}

    def _ubl_add_line_item_identification_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_line_item_identification_nodes(vals)
        vals['item_node']['cac:BuyersItemIdentification'] = None

    def _ubl_add_line_item_additional_item_property_nodes(self, vals):
        # OVERRIDE account.edi.ubl: only the product attributes (no vehicle plate number).
        product = vals['line_vals']['base_line']['product_id']
        vals['item_node']['cac:AdditionalItemProperty'] = [
            {
                'cbc:Name': {'_text': value.attribute_id.name},
                'cbc:Value': {'_text': value.name},
            }
            for value in product.product_template_attribute_value_ids
        ]

    def _ubl_add_line_item_commodity_classification_nodes(self, vals):
        # OVERRIDE account.edi.ubl
        # When the invoice is sent for the general public (refunding an order in a consolidated invoice/...) the item code
        # must be fixed to 004 (consolidated invoice) even if the product has something else set.
        myinvois_document = vals['myinvois_document']
        base_line = vals['line_vals']['base_line']
        if myinvois_document._is_consolidated_invoice() or myinvois_document._is_consolidated_invoice_refund():
            class_code = '004'
        else:
            class_code = base_line['record'].l10n_my_edi_classification_code or \
                         base_line['record'].product_id.product_tmpl_id.l10n_my_edi_classification_code

        vals['item_node']['cac:CommodityClassification'] = {
            'cbc:ItemClassificationCode': {
                '_text': class_code,
                'listID': 'CLASS',
            }
        } if class_code else None

    def _ubl_add_line_item_classified_tax_category_nodes(self, vals, in_foreign_currency=True):
        # OVERRIDE account.edi.ubl
        vals['item_node']['cac:ClassifiedTaxCategory'] = [
            self._l10n_my_edi_get_tax_category_node(vals, grouping_key)
            for grouping_key in self._l10n_my_edi_aggregate_base_line_tax_details(vals['line_vals']['base_line'])
            if grouping_key
        ]

    def _ubl_add_line_price_node(self, vals, in_foreign_currency=True):
        # OVERRIDE account.edi.ubl
        product_price_dp = self.env['decimal.precision'].precision_get('Product Price')
        vals['line_node']['cac:Price'] = {
            'cbc:PriceAmount': {
                '_text': float_round(vals['line_vals']['gross_price_unit_currency'], precision_digits=product_price_dp),
                'currencyID': vals['currency'].name,
            },
        }

    def _ubl_add_line_item_price_extension_node(self, vals):
        vals['line_node']['cac:ItemPriceExtension'] = {
            'cbc:Amount': self._l10n_my_edi_get_amount_node(vals, vals['line_vals']['base_line']['tax_details']['total_excluded_currency']),
        }

    # -------------------------------------------------------------------------
    # EXPORT: Constraints
    # -------------------------------------------------------------------------

    def _export_document_constraints(self, vals):
        # OVERRIDE account.edi.ubl: the exported record is a myinvois.document, not an account.move.
        constraints = {
            'myinvois_supplier_name_required': self._check_required_fields(vals['supplier'], 'name'),
            'myinvois_customer_name_required': self._check_required_fields(vals['customer'].commercial_partner_id, 'name'),
            'myinvois_document_name_required': self._check_required_fields(vals, 'document_name'),
        }

        if not vals['supplier'].commercial_partner_id.l10n_my_edi_industrial_classification:
            self._l10n_my_edi_make_validation_error(constraints, 'industrial_classification_required', 'supplier', vals['supplier'].display_name)

        for partner_type in ('supplier', 'customer'):
            partner = vals[partner_type]
            phone_number = partner.phone
            # 'NA' is a valid value in some cases, e.g. consolidated invoices.
            if phone_number != 'NA':
                phone = self._l10n_my_edi_get_formatted_phone_number(phone_number)
                if E_164_REGEX.match(phone) is None:
                    self._l10n_my_edi_make_validation_error(constraints, 'phone_number_format', partner_type, partner.display_name)
            elif not phone_number:
                self._l10n_my_edi_make_validation_error(constraints, 'phone_number_required', partner_type, partner.display_name)

            # We need to provide both l10n_my_identification_type and l10n_my_identification_number
            if not partner.commercial_partner_id.l10n_my_identification_type or not partner.commercial_partner_id.l10n_my_identification_number:
                self._l10n_my_edi_make_validation_error(constraints, 'required_id', partner_type, partner.commercial_partner_id.display_name)

            if not partner.state_id:
                self._l10n_my_edi_make_validation_error(constraints, 'no_state', partner_type, partner.display_name)
            if not partner.city:
                self._l10n_my_edi_make_validation_error(constraints, 'no_city', partner_type, partner.display_name)
            if not partner.country_id:
                self._l10n_my_edi_make_validation_error(constraints, 'no_country', partner_type, partner.display_name)
            if not partner.street:
                self._l10n_my_edi_make_validation_error(constraints, 'no_street', partner_type, partner.display_name)

            if partner.commercial_partner_id.sst_registration_number and len(partner.commercial_partner_id.sst_registration_number.split(';')) > 2:
                self._l10n_my_edi_make_validation_error(constraints, 'too_many_sst', partner_type, partner.commercial_partner_id.display_name)

        myinvois_document = vals["myinvois_document"]
        for line_vals in vals['document_node']['cac:InvoiceLine']:
            line_item = line_vals['cac:Item']
            if not line_item.get('cac:CommodityClassification'):
                self._l10n_my_edi_make_validation_error(constraints, 'class_code_required', line_vals['cbc:ID']['_text'], line_item['cbc:Name']['_text'])
            if not line_item.get('cac:ClassifiedTaxCategory'):
                self._l10n_my_edi_make_validation_error(constraints, 'tax_ids_required', line_vals['cbc:ID']['_text'], line_item['cbc:Name']['_text'])
            for tax_category in line_item['cac:ClassifiedTaxCategory']:
                if tax_category['cbc:ID']['_text'] == 'E' and not tax_category['cbc:TaxExemptionReason']['_text']:
                    if not myinvois_document._is_consolidated_invoice():
                        self._l10n_my_edi_make_validation_error(constraints, 'tax_exemption_required', line_vals['cbc:ID']['_text'], line_item['cbc:Name']['_text'])
                    else:  # On consolidated invoices, you cannot define the reason on the invoice and so the message should be different for clarity
                        self._l10n_my_edi_make_validation_error(constraints, 'tax_exemption_required_on_tax', line_vals['cbc:ID']['_text'], line_item['cbc:Name']['_text'])

        # Code '004' (Consolidated e-Invoice) requires the General Public TIN + identification number, and
        # vice-versa: that TIN + identification number requires every line to use code '004'.
        invoice_type_code = vals['document_node']['cbc:InvoiceTypeCode']['_text']
        if invoice_type_code in ("11", "12", "13", "14"):  # For self billed, we validate the supplier
            party_identification_nodes = vals['document_node']['cac:AccountingSupplierParty']['cac:Party']['cac:PartyIdentification']
        else:
            party_identification_nodes = vals['document_node']['cac:AccountingCustomerParty']['cac:Party']['cac:PartyIdentification']
        vat = party_identification_nodes[0]['cbc:ID']['_text']
        identification_number = party_identification_nodes[1]['cbc:ID']['_text'] if len(party_identification_nodes) > 1 else None
        is_general_public = vat == 'EI00000000010' and identification_number == 'NA'

        line_classification_codes = [
            (line_vals['cac:Item']['cac:CommodityClassification'] or {}).get('cbc:ItemClassificationCode', {}).get('_text')
            for line_vals in vals['document_node']['cac:InvoiceLine']
        ]

        if any(code == '004' for code in line_classification_codes) and not is_general_public:
            self._l10n_my_edi_make_validation_error(constraints, 'missing_general_public', vals['customer'].id, vals['customer'].name)
        if is_general_public and any(code != '004' for code in line_classification_codes):
            self._l10n_my_edi_make_validation_error(constraints, 'general_public_requires_004', vals['customer'].id, vals['customer'].name)

        # MyInvois limits the InternalID to 50 characters.
        document_id = vals['document_node']['cbc:ID']['_text']
        if document_id and len(document_id) > 50:
            self._l10n_my_edi_make_validation_error(constraints, 'document_id_too_long', vals['myinvois_document'].id, vals['myinvois_document'].display_name)

        return constraints

    @api.model
    def _l10n_my_edi_make_validation_error(self, constraints, code, record_identifier, record_name):
        """ Small helper that add new constrains into provided constrains dict.
        This helper is mainly there to keep the check method tidy, and focused on its purpose (validating data)
        """
        message_mapping = {
            'industrial_classification_required': self.env._(
                "The industrial classification must be defined on company: %(company_name)s",
                company_name=record_name
            ),
            'phone_number_format': self.env._(
                "The following partner's phone number should follow the E.164 format: %(partner_name)s",
                partner_name=record_name
            ),
            'phone_number_required': self.env._(
                "The following partner's phone number is missing: %(partner_name)s",
                partner_name=record_name
            ),
            'required_id': self.env._(
                "The following partner's identification type or number is missing: %(partner_name)s",
                partner_name=record_name
            ),
            'no_state': self.env._(
                "The following partner's state is missing: %(partner_name)s",
                partner_name=record_name
            ),
            'no_city': self.env._(
                "The following partner's city is missing: %(partner_name)s",
                partner_name=record_name
            ),
            'no_country': self.env._(
                "The following partner's country is missing: %(partner_name)s",
                partner_name=record_name
            ),
            'no_street': self.env._(
                "The following partner's street is missing: %(partner_name)s",
                partner_name=record_name
            ),
            'class_code_required': self.env._(
                "You must set a classification code either on the line itself or on the product of line: %(line_name)s",
                line_name=record_name
            ),
            'adjustment_origin': self.env._(
                "You cannot send a debit / credit note for invoice %(invoice_number)s as it has not yet been sent to MyInvois.",
                invoice_number=record_name
            ),
            'too_many_sst': self.env._(
                "The following partner's should have at most two SST numbers, separated by a semicolon : %(partner_name)s",
                partner_name=record_name
            ),
            'tax_ids_required': self.env._(
                "You must set a tax on the line : %(line_name)s.\nIf taxes are not applicable, please set a 0%% tax with a tax type 'Not Applicable'.",
                line_name=record_name
            ),
            'tax_exemption_required': self.env._(
                "You must set a Tax Exemption Reason on the invoice : %(invoice_name)s as some taxes have the type 'Tax exemption' without a reason set.",
                invoice_name=record_name
            ),
            'tax_exemption_required_on_tax': self.env._(
                "You must set a Tax Exemption Reason on each tax exempt taxes in order to use them in a Consolidated Invoice.",
            ),
            'missing_general_public': self.env._(
                "Classification code '004' can only be used for consolidated e-invoice issued to general public "
                "(TIN of 'EI00000000010', BRN/NRIC of 'NA')"
            ),
            'general_public_requires_004': self.env._(
                "TIN 'EI00000000010' (General Public / Consolidated e-Invoice) with BRN/NRIC of 'NA' requires "
                "classification code '004' on every invoice line."
            ),
            'document_id_too_long': self.env._(
                'The "Bill Reference" for %(invoice_name)s exceeds the maximum limit of 50 characters.',
                invoice_name=record_name
            ),
        }

        constraints[f'myinvois_{record_identifier}_{code}'] = message_mapping[code]

    @api.model
    def _l10n_my_edi_decode_myinvois_attachment(self, myinvois_file):
        """ Extract data from MyInvois xml. """
        def get_node(node, xpath):
            nodes = node.xpath(xpath)
            return nodes[0] if nodes else None

        def get_value(node):
            if node is None:
                return None
            return node.text

        vals = {}
        try:
            root = etree.fromstring(myinvois_file.content)
            invoice_id_node = get_node(root, "//*[local-name()='Invoice']/*[local-name()='ID']")
        except etree.XMLSyntaxError:
            # Not an xml
            return {}
        except AttributeError:
            # Not a MyInvois xml
            return {}

        vals['original_document_id'] = get_value(invoice_id_node)
        return vals

    # ----------------
    # EXPORT: Business methods
    # ----------------

    @api.model
    def _l10n_my_edi_get_document_type_code(self, myinvois_document):
        """ Returns the code matching the invoice type, as well as the original document(s) if any. """
        document_type_code = '01'
        original_documents = None

        # For consolidated invoices, we treat PoS documents as invoice (01) but for accounting documents, we need to look into it for the exact type.
        if not myinvois_document._is_consolidated_invoice() or bool(myinvois_document.invoice_ids):
            invoices = myinvois_document.invoice_ids
            ref_invoice = invoices[0]  # There is only ever one move_type in a same document
            if self.env['myinvois.document']._myinvois_is_debit_notes_used() and ref_invoice.debit_origin_id:
                document_type_code = '03' if ref_invoice.move_type == 'out_invoice' else '13'
                original_documents = invoices.debit_origin_id._get_active_myinvois_document()
            elif ref_invoice.is_refund():
                is_refund, refunded_document = self._l10n_my_edi_get_refund_details(invoices)
                if is_refund:
                    document_type_code = '04' if ref_invoice.move_type == 'out_refund' else '14'
                else:
                    document_type_code = '02' if ref_invoice.move_type == 'out_refund' else '12'

                original_documents = refunded_document
            else:
                document_type_code = '01' if ref_invoice.move_type == 'out_invoice' else '11'

        return document_type_code, original_documents

    @api.model
    def _l10n_my_edi_get_refund_details(self, invoices):
        """
        Helper which returns the refunded document in case of out_refund/in_refund.
        In some cases, such as PoS, we could need a different logic than from the regular flow.
        :param invoices: The credit note for which we want to get the refunded document.
        :return: A tuple, where the first parameter indicates if this credit note is a refund and the second the credited/refunded document.
        """
        # We consider a credit note a refund if it is paid and fully reconciled with a payment or bank transaction.
        payment_terms = invoices.line_ids.filtered(lambda aml: aml.display_type == 'payment_term')
        counterpart_amls = payment_terms.reconciled_lines_ids
        counterpart_move_type = 'out_invoice' if invoices[0].move_type == 'out_refund' else 'in_invoice'
        has_payments = bool(counterpart_amls.move_id.filtered(lambda move: move.move_type != counterpart_move_type))
        # In practice, as a check on this is done when separating invoices for consolidation, checking all of them this way would be enough.
        is_paid = all(invoice.payment_state in ('in_payment', 'paid', 'reversed') for invoice in invoices)

        refunded_document = invoices.reversed_entry_id._get_active_myinvois_document()
        is_refund = is_paid and has_payments
        return is_refund, refunded_document

    @api.model
    def _l10n_my_edi_get_prepaid_amount(self, invoice):
        """ Compute the amount of the invoice that was genuinely paid in advance.

        LHDN only recognizes a reconciled payment as a deposit/prepayment if it was made strictly before the
        invoice date; a payment made on or after the invoice date is a regular settlement, not a prepayment.
        Additionally, LHDN never accepts a PayableAmount of 0, so a 100% advance payment must not be reported
        as a prepayment either: in that case, the full invoice amount is reported as payable instead.
        Credit/debit notes reconciled against the invoice are not prepayments.
        """
        if not invoice.invoice_date:
            return 0.0

        invoice_partials, exchange_diff_moves = invoice._get_reconciled_invoices_partials()
        prepaid_amount = sum(
            amount
            for partial, amount, aml in invoice_partials
            if (
                aml.move_id.id not in exchange_diff_moves
                and aml.move_id.move_type not in ('out_refund', 'in_refund')
                and aml.date and aml.date < invoice.invoice_date
            )
        )
        if invoice.currency_id.compare_amounts(prepaid_amount, invoice.amount_total) >= 0:
            return 0.0
        return prepaid_amount

    @api.model
    def _l10n_my_edi_get_formatted_phone_number(self, number):
        # the phone number MUST follow the E.164 format.
        # Don't try to reformat too much, we don't want to risk messing it up
        if not number:
            return ''  # This wouldn't happen in the file as it's caught in the validation errors, but the vals are exported before these checks are done.
        return number.replace(' ', '').replace('(', '').replace(')', '').replace('-', '')
