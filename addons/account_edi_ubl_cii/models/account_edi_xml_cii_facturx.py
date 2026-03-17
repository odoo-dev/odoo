from odoo import _, models, Command
from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_ubl_cii.tools import CrossIndustryInvoice
from odoo.tools import float_repr, is_html_empty, html2plaintext, cleanup_xml_node
from odoo.tools.misc import str2bool
from lxml import etree

from datetime import datetime

import logging

_logger = logging.getLogger(__name__)

DEFAULT_FACTURX_DATE_FORMAT = '%Y%m%d'
CII_NAMESPACES = {
    'ram': "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    'rsm': "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
    'udt': "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
}

# Imcomplete, full list on https://service.unece.org/trade/untdid/d16b/tred/tred4461.htm
PAYMENT_MEAN_CODES = {
    'Payment to bank account': 42,
    'SEPA direct debit': 59
}


class AccountEdiXmlCII(models.AbstractModel):
    _name = "account.edi.xml.cii"
    _inherit = 'account.edi.cii'
    _description = "Factur-x/ZUGFeRD CII 2.2.0"

    def _find_value(self, xpath, tree, nsmap=False):
        # EXTENDS account.edi.common
        return super()._find_value(xpath, tree, CII_NAMESPACES)

    def _export_invoice_filename(self, invoice):
        if invoice.commercial_partner_id.country_code == 'DE':
            return f"{invoice.name.replace('/', '_')}_zugferd.xml"
        return f"{invoice.name.replace('/', '_')}_factur_x.xml"

    def _export_invoice_ecosio_schematrons(self):
        return {
            'invoice': 'de.xrechnung:cii:2.2.0',
            'credit_note': 'de.xrechnung:cii:2.2.0',
        }

    def _export_invoice_constraints(self, invoice, vals):
        constraints = self._invoice_constraints_common(invoice)
        if invoice.move_type == 'out_invoice':
            # [BR-DE-1] An Invoice must contain information on "PAYMENT INSTRUCTIONS" (BG-16)
            # first check that a partner_bank_id exists, then check that there is an account number
            constraints.update({
                'seller_payment_instructions_1': self._check_required_fields(
                    vals['record'], 'partner_bank_id'
                ),
                'seller_payment_instructions_2': self._check_required_fields(
                    vals['record']['partner_bank_id'], 'sanitized_acc_number',
                    _("The field 'Sanitized Account Number' is required on the Recipient Bank.")
                ),
            })
        constraints.update({
            # [BR-08]-An Invoice shall contain the Seller postal address (BG-5).
            # [BR-09]-The Seller postal address (BG-5) shall contain a Seller country code (BT-40).
            'seller_postal_address': self._check_required_fields(
                vals['record']['company_id']['partner_id']['commercial_partner_id'], 'country_id'
            ),
            # [BR-CO-26]-In order for the buyer to automatically identify a supplier, the Seller identifier (BT-29),
            # the Seller legal registration identifier (BT-30) and/or the Seller VAT identifier (BT-31) shall be present.
            'seller_identifier': self._check_required_fields(
                vals['record']['company_id'], ['vat']  # 'siret'
            ),
            # [BR-DE-6] The element "Seller contact telephone number" (BT-42) must be transmitted.
            'seller_phone': self._check_required_fields(
                vals['record']['company_id']['partner_id']['commercial_partner_id'], ['phone', 'mobile'],
            ),
            # [BR-DE-7] The element "Seller contact email address" (BT-43) must be transmitted.
            'seller_email': self._check_required_fields(
                vals['record']['company_id'], 'email'
            ),
            # [BR-CO-04]-Each Invoice line (BG-25) shall be categorized with an Invoiced item VAT category code (BT-151).
            'tax_invoice_line': self._check_required_tax(vals),
            # [BR-IC-02]-An Invoice that contains an Invoice line (BG-25) where the Invoiced item VAT category code (BT-151)
            # is "Intra-community supply" shall contain the Seller VAT Identifier (BT-31) or the Seller tax representative
            # VAT identifier (BT-63) and the Buyer VAT identifier (BT-48).
            'intracom_seller_vat': self._check_required_fields(vals['record']['company_id'], 'vat') if vals['intracom_delivery'] else None,
            'intracom_buyer_vat': self._check_required_fields(vals['record']['commercial_partner_id'], 'vat') if vals['intracom_delivery'] else None,
            # [BR-IG-05]-In an Invoice line (BG-25) where the Invoiced item VAT category code (BT-151) is "IGIC" the
            # invoiced item VAT rate (BT-152) shall be greater than 0 (zero).
            'igic_tax_rate': self._check_non_0_rate_tax(vals)
                if vals['record']['partner_id']['country_id']['code'] == 'ES'
                    and vals['record']['partner_id']['zip']
                    and vals['record']['partner_id']['zip'][:2] in ['35', '38'] else None,
        })
        return constraints

    def _check_required_tax(self, vals):
        for line_vals in vals['invoice_line_vals_list']:
            line = line_vals['line']
            if not vals['tax_details']['tax_details_per_record'][line]['tax_details']:
                return _("You should include at least one tax per invoice line. [BR-CO-04]-Each Invoice line (BG-25) "
                         "shall be categorized with an Invoiced item VAT category code (BT-151).")

    def _check_non_0_rate_tax(self, vals):
        for line_vals in vals['tax_details']['tax_details_per_record']:
            tax_rate_list = line_vals.tax_ids.flatten_taxes_hierarchy().mapped("amount")
            if not any([rate > 0 for rate in tax_rate_list]):
                return _("When the Canary Island General Indirect Tax (IGIC) applies, the tax rate on "
                         "each invoice line should be greater than 0.")

    def _get_scheduled_delivery_time(self, invoice):
        # don't create a bridge only to get line.sale_line_ids.order_id.picking_ids.date_done
        # line.sale_line_ids.order_id.picking_ids.scheduled_date or line.sale_line_ids.order_id.commitment_date
        return invoice.delivery_date or invoice.invoice_date

    def _get_invoicing_period(self, invoice):
        # get the Invoicing period (BG-14): a list of dates covered by the invoice
        # don't create a bridge to get the date range from the timesheet_ids
        return [invoice.invoice_date]

    def _get_exchanged_document_vals(self, invoice):
        return {
            'id': invoice.name,
            'type_code': '380' if invoice.move_type == 'out_invoice' else '381',
            'issue_date_time': invoice.invoice_date,
            'included_note': html2plaintext(invoice.narration) if invoice.narration else "",
        }

    def _export_invoice_vals(self, invoice):

        def format_date(dt):
            # Format the date in the Factur-x standard.
            dt = dt or datetime.now()
            return dt.strftime(DEFAULT_FACTURX_DATE_FORMAT)

        def format_monetary(number, decimal_places=2):
            # Facturx requires the monetary values to be rounded to 2 decimal values
            return float_repr(number, decimal_places)

        def grouping_key_generator(base_line, tax_data):
            tax = tax_data['tax']
            customer = invoice.commercial_partner_id
            supplier = invoice.company_id.partner_id.commercial_partner_id
            grouping_key = {
                **self._get_tax_unece_codes(customer, supplier, tax),
                'amount': tax.amount,
                'amount_type': tax.amount_type,
            }
            # If the tax is fixed, we want to have one group per tax
            # s.t. when the invoice is imported, we can try to guess the fixed taxes
            if tax.amount_type == 'fixed':
                grouping_key['tax_name'] = tax.name
            return grouping_key

        # Validate the structure of the taxes
        self._validate_taxes(invoice.invoice_line_ids.tax_ids)

        # Create file content.
        tax_details = invoice._prepare_invoice_aggregated_taxes(grouping_key_generator=grouping_key_generator)

        # Fixed Taxes: filter them on the document level, and adapt the totals
        # Fixed taxes are not supposed to be taxes in real live. However, this is the way in Odoo to manage recupel
        # taxes in Belgium. Since only one tax is allowed, the fixed tax is removed from totals of lines but added
        # as an extra charge/allowance.
        fixed_taxes_keys = [k for k in tax_details['tax_details'] if k['amount_type'] == 'fixed']
        for key in fixed_taxes_keys:
            fixed_tax_details = tax_details['tax_details'].pop(key)
            tax_details['tax_amount_currency'] -= fixed_tax_details['tax_amount_currency']
            tax_details['tax_amount'] -= fixed_tax_details['tax_amount']
            tax_details['base_amount_currency'] += fixed_tax_details['tax_amount_currency']
            tax_details['base_amount'] += fixed_tax_details['tax_amount']

        if 'siret' in invoice.company_id._fields and invoice.company_id.siret:
            seller_siret = invoice.company_id.siret
        else:
            seller_siret = invoice.company_id.company_registry

        buyer_siret = invoice.commercial_partner_id.company_registry
        if 'siret' in invoice.commercial_partner_id._fields and invoice.commercial_partner_id.siret:
            buyer_siret = invoice.commercial_partner_id.siret
        template_values = {
            **invoice._prepare_edi_vals_to_export(),
            'tax_details': tax_details,
            'format_date': format_date,
            'format_monetary': format_monetary,
            'is_html_empty': is_html_empty,
            'scheduled_delivery_time': self._get_scheduled_delivery_time(invoice),
            'intracom_delivery': False,
            'ExchangedDocument_vals': self._get_exchanged_document_vals(invoice),
            'seller_specified_legal_organization': seller_siret,
            'buyer_specified_legal_organization': buyer_siret,
            'ship_to_trade_party': invoice.partner_shipping_id if 'partner_shipping_id' in invoice._fields and invoice.partner_shipping_id
                else invoice.commercial_partner_id,
            # Chorus Pro fields
            'buyer_reference': invoice.buyer_reference if 'buyer_reference' in invoice._fields
                and invoice.buyer_reference else invoice.commercial_partner_id.ref,
            'purchase_order_reference': invoice.purchase_order_reference if 'purchase_order_reference' in invoice._fields
                and invoice.purchase_order_reference else invoice.ref or invoice.name,
            'contract_reference': invoice.contract_reference if 'contract_reference' in invoice._fields and invoice.contract_reference else '',
            'document_context_id': "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended",
        }

        # data used for IncludedSupplyChainTradeLineItem / SpecifiedLineTradeSettlement
        for line_vals in template_values['invoice_line_vals_list']:
            line = line_vals['line']
            line_vals['unece_uom_code'] = self._get_uom_unece_code(line.product_uom_id)

            if line._fields.get('deferred_start_date') and (line.deferred_start_date or line.deferred_end_date):
                line_vals['billing_start'] = line.deferred_start_date
                line_vals['billing_end'] = line.deferred_end_date

        # [BR - IC - 11] - In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is
        # "Intra-community supply" the Actual delivery date (BT-72) or the Invoicing period (BG-14) shall not be blank.
        billing_start_dates = [invoice.invoice_date] if invoice.invoice_date else []
        billing_start_dates += [line_vals['billing_start'] for line_vals in template_values['invoice_line_vals_list'] if line_vals.get('billing_start')]
        billing_end_dates = [invoice.invoice_date_due] if invoice.invoice_date_due else []
        billing_end_dates += [line_vals['billing_end'] for line_vals in template_values['invoice_line_vals_list'] if line_vals.get('billing_end')]
        if billing_start_dates:
            template_values['billing_start'] = min(billing_start_dates)
        if billing_end_dates:
            template_values['billing_end'] = max(billing_end_dates)

        # data used for ApplicableHeaderTradeSettlement / ApplicableTradeTax (at the end of the xml)
        for tax_detail_vals in template_values['tax_details']['tax_details'].values():
            # /!\ -0.0 == 0.0 in python but not in XSLT, so it can raise a fatal error when validating the XML
            # if 0.0 is expected and -0.0 is given.
            amount_currency = tax_detail_vals['tax_amount_currency']
            tax_detail_vals['calculated_amount'] = amount_currency if not invoice.currency_id.is_zero(amount_currency) else 0

            if tax_detail_vals.get('tax_category_code') == 'K':
                template_values['intracom_delivery'] = True

        # Fixed taxes: add them as charges on the invoice lines
        for line_vals in template_values['invoice_line_vals_list']:
            line_vals['allowance_charge_vals_list'] = []
            for grouping_key, tax_detail in tax_details['tax_details_per_record'][line_vals['line']]['tax_details'].items():
                if grouping_key['amount_type'] == 'fixed':
                    line_vals['allowance_charge_vals_list'].append({
                        'indicator': 'true',
                        'reason': tax_detail['tax_name'],
                        'reason_code': 'AEO',
                        'amount': tax_detail['tax_amount_currency'],
                    })
            sum_fixed_taxes = sum(x['amount'] for x in line_vals['allowance_charge_vals_list'])
            line_vals['line_total_amount'] = line_vals['line'].price_subtotal + sum_fixed_taxes

            # The quantity is the line.quantity since we keep the unece_uom_code!
            line_vals['quantity'] = line_vals['line'].quantity

            # Invert the quantity and the gross_price_total_unit if a line has a negative price total
            if line_vals['line'].currency_id.compare_amounts(line_vals['gross_price_total_unit'], 0) == -1:
                line_vals['quantity'] *= -1
                line_vals['gross_price_total_unit'] *= -1
                line_vals['price_subtotal_unit'] *= -1

        # Fixed taxes: set the total adjusted amounts on the document level
        template_values['tax_basis_total_amount'] = tax_details['base_amount_currency']
        template_values['tax_total_amount'] = tax_details['tax_amount_currency']

        if self.env['account.payment']._fields.get('sdd_mandate_id') and invoice.reconciled_payment_ids.sdd_mandate_id:
            template_values['payment_means_code'] = PAYMENT_MEAN_CODES['SEPA direct debit']
        else:
            template_values['payment_means_code'] = PAYMENT_MEAN_CODES['Payment to bank account']

        return template_values

    def _export_invoice(self, invoice):
        if str2bool(
            self.env['ir.config_parameter'].sudo().get_param('account_edi_ubl_cii.use_new_dict_to_xml_helpers', True),
            default=True,
        ):
            return self._export_invoice_new(invoice)

        vals = self._export_invoice_vals(invoice.with_context(lang=invoice.partner_id.lang))
        errors = [constraint for constraint in self._export_invoice_constraints(invoice, vals).values() if constraint]
        xml_content = self.env['ir.qweb']._render('account_edi_ubl_cii.account_invoice_facturx_export_22', vals)
        return etree.tostring(cleanup_xml_node(xml_content), xml_declaration=True, encoding='UTF-8'), set(errors)

    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _import_retrieve_partner_vals(self, tree, role):
        return {
            'vat': self._find_value(f".//ram:{role}/ram:SpecifiedTaxRegistration/ram:ID[string-length(text()) > 5]", tree),
            'name': self._find_value(f".//ram:{role}/ram:Name", tree),
            'phone': self._find_value(f".//ram:{role}/ram:DefinedTradeContact/ram:TelephoneUniversalCommunication/ram:CompleteNumber", tree),
            'email': self._find_value(f".//ram:{role}//ram:EmailURIUniversalCommunication/ram:URIID", tree),
            'country_code': self._find_value(f'.//ram:{role}/ram:PostalTradeAddress//ram:CountryID', tree),
        }

    def _import_fill_invoice(self, invoice, tree, qty_factor):
        logs = []
        invoice_values = {}
        if qty_factor == -1:
            logs.append(_("The invoice has been converted into a credit note and the quantities have been reverted."))
        role = 'SellerTradeParty' if invoice.journal_id.type == 'purchase' else 'BuyerTradeParty'
        partner, partner_logs = self._import_partner(invoice.company_id, **self._import_retrieve_partner_vals(tree, role))
        # Need to set partner before to compute bank and lines properly
        invoice.partner_id = partner.id
        invoice_values['currency_id'], currency_logs = self._import_currency(tree, './/{*}InvoiceCurrencyCode')

        # ==== partner_bank_id ====
        bank_detail_nodes = tree.findall('.//{*}SpecifiedTradeSettlementPaymentMeans')
        bank_details = [
            bank_detail_node.findtext('{*}PayeePartyCreditorFinancialAccount/{*}IBANID')
            or bank_detail_node.findtext('{*}PayeePartyCreditorFinancialAccount/{*}ProprietaryID')
            for bank_detail_node in bank_detail_nodes
            if bank_detail_node.findtext('{*}PayeePartyCreditorFinancialAccount/{*}IBANID')
            or bank_detail_node.findtext('{*}PayeePartyCreditorFinancialAccount/{*}ProprietaryID')
        ]
        if bank_details:
            self._import_partner_bank(invoice, bank_details=bank_details)

        # ==== ref, invoice_origin, narration, payment_reference ====
        invoice_values['ref'] = tree.findtext('./{*}ExchangedDocument/{*}ID')
        invoice_values['invoice_origin'] = tree.findtext(
            './/{*}BuyerOrderReferencedDocument/{*}IssuerAssignedID'
        )
        invoice_values['narration'] = self._import_description(tree, xpaths=[
            './{*}ExchangedDocument/{*}IncludedNote/{*}Content',
            './/{*}SpecifiedTradePaymentTerms/{*}Description',
        ])
        invoice_values['payment_reference'] = tree.findtext(
            './{*}SupplyChainTradeTransaction/{*}ApplicableHeaderTradeSettlement/{*}PaymentReference'
        )

        # ==== invoice_date, invoice_date_due ====
        issue_date = tree.findtext('./{*}ExchangedDocument/{*}IssueDateTime/{*}DateTimeString')
        if issue_date:
            invoice_values['invoice_date'] = datetime.strptime(issue_date.strip(), DEFAULT_FACTURX_DATE_FORMAT)
        due_date = tree.findtext('.//{*}SpecifiedTradePaymentTerms/{*}DueDateDateTime/{*}DateTimeString')
        if due_date:
            invoice_values['invoice_date_due'] = datetime.strptime(due_date.strip(), DEFAULT_FACTURX_DATE_FORMAT)

        # ==== Document level AllowanceCharge, Prepaid Amounts, Invoice Lines ====
        allowance_charges_line_vals, allowance_charges_logs = self._import_document_allowance_charges(
            tree, invoice, invoice.journal_id.type, qty_factor,
        )
        logs += self._import_prepaid_amount(invoice, tree, './/{*}ApplicableHeaderTradeSettlement/{*}SpecifiedTradeSettlementHeaderMonetarySummation/{*}TotalPrepaidAmount', qty_factor)
        invoice_line_vals, line_logs = self._import_invoice_lines(invoice, tree, './{*}SupplyChainTradeTransaction/{*}IncludedSupplyChainTradeLineItem', qty_factor)
        line_vals = allowance_charges_line_vals + invoice_line_vals

        invoice_values = {
            **invoice_values,
            'invoice_line_ids': [Command.create(line_value) for line_value in line_vals],
        }
        invoice.write(invoice_values)
        logs += partner_logs + currency_logs + line_logs + allowance_charges_logs
        return logs

    def _get_tax_nodes(self, tree):
        return tree.findall('.//{*}ApplicableTradeTax/{*}RateApplicablePercent')

    def _get_document_allowance_charge_xpaths(self):
        return {
            'root': './{*}SupplyChainTradeTransaction/{*}ApplicableHeaderTradeSettlement/{*}SpecifiedTradeAllowanceCharge',
            'charge_indicator': './{*}ChargeIndicator/{*}Indicator',
            'base_amount': './{*}BasisAmount',
            'amount': './{*}ActualAmount',
            'reason': './{*}Reason',
            'percentage': './{*}CalculationPercent',
            'tax_percentage': './{*}CategoryTradeTax/{*}RateApplicablePercent',
        }

    def _get_invoice_line_xpaths(self, document_type=False, qty_factor=1):
        return {
            'deferred_start_date': './{*}SpecifiedLineTradeSettlement/{*}BillingSpecifiedPeriod/{*}StartDateTime/{*}DateTimeString',
            'deferred_end_date': './{*}SpecifiedLineTradeSettlement/{*}BillingSpecifiedPeriod/{*}EndDateTime/{*}DateTimeString',
            'date_format': DEFAULT_FACTURX_DATE_FORMAT,
        }

    def _get_line_xpaths(self, document_type=False, qty_factor=1):
        return {
            'basis_qty': (
                './ram:SpecifiedLineTradeAgreement/ram:GrossPriceProductTradePrice/ram:BasisQuantity',
                './ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:BasisQuantity',
            ),
            'gross_price_unit': './{*}SpecifiedLineTradeAgreement/{*}GrossPriceProductTradePrice/{*}ChargeAmount',
            'rebate': './{*}SpecifiedLineTradeAgreement/{*}GrossPriceProductTradePrice/{*}AppliedTradeAllowanceCharge/{*}ActualAmount',
            'net_price_unit': './{*}SpecifiedLineTradeAgreement/{*}NetPriceProductTradePrice/{*}ChargeAmount',
            'delivered_qty': './{*}SpecifiedLineTradeDelivery/{*}BilledQuantity',
            'allowance_charge': './/{*}SpecifiedLineTradeSettlement/{*}SpecifiedTradeAllowanceCharge',
            'allowance_charge_indicator': './{*}ChargeIndicator/{*}Indicator',
            'allowance_charge_amount': './{*}ActualAmount',
            'allowance_charge_reason': './{*}Reason',
            'allowance_charge_reason_code': './{*}ReasonCode',
            'line_total_amount': './{*}SpecifiedLineTradeSettlement/{*}SpecifiedTradeSettlementLineMonetarySummation/{*}LineTotalAmount',
            'name': [
                './ram:SpecifiedTradeProduct/ram:Description',
                './ram:SpecifiedTradeProduct/ram:Name',
            ],
            'product': {
                'default_code': './ram:SpecifiedTradeProduct/ram:SellerAssignedID',
                'name': './ram:SpecifiedTradeProduct/ram:Name',
                'barcode': './ram:SpecifiedTradeProduct/ram:GlobalID',
            },
        }

    # -------------------------------------------------------------------------
    # IMPORT : helpers
    # -------------------------------------------------------------------------

    def _get_import_document_amount_sign(self, tree):
        """
        In factur-x, an invoice has code 380 and a credit note has code 381. However, a credit note can be expressed
        as an invoice with negative amounts. For this case, we need a factor to take the opposite of each quantity
        in the invoice.
        """
        move_type_code = tree.find('.//{*}ExchangedDocument/{*}TypeCode')
        if move_type_code is None:
            return None, None
        if move_type_code.text == '381':
            return 'refund', 1
        if move_type_code.text == '380':
            amount_node = tree.find('.//{*}SpecifiedTradeSettlementHeaderMonetarySummation/{*}TaxBasisTotalAmount')
            if amount_node is not None and float(amount_node.text) < 0:
                return 'refund', -1
            return 'invoice', 1
        return None, None

    # -------------------------------------------------------------------------
    # NEW EXPORT : helpers
    # -------------------------------------------------------------------------

    def _export_invoice_new(self, invoice):
        # Validate the structure of the taxes
        self._validate_taxes(invoice.invoice_line_ids.tax_ids)

        vals = {'invoice': invoice.with_context(lang=invoice.partner_id.lang)}
        document_node = self._get_invoice_node(vals)

        errors = [constraint for constraint in self._export_invoice_constraints_new(invoice, vals).values() if constraint]

        nsmap = self._get_document_nsmap()

        xml_content = dict_to_xml(document_node, nsmap=nsmap, template=CrossIndustryInvoice)

        return etree.tostring(xml_content, xml_declaration=True, encoding='UTF-8'), set(errors)

    def _export_invoice_constraints_new(self, invoice, vals):
        constraints = self._invoice_constraints_common(invoice)
        constraints.update(
            self._cii_constraints(invoice, vals)
        )
        return constraints

    def _get_document_nsmap(self):
        return {
            'ram': "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
            'rsm': "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
            'udt': "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
            'qdt': "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
            'xsi': "http://www.w3.org/2001/XMLSchema-instance",
        }

    def _get_invoice_node(self, vals):
        self._add_invoice_config_vals(vals)
        self._add_invoice_base_lines_vals(vals)
        self._add_invoice_currency_vals(vals)
        self._add_invoice_tax_grouping_function_vals(vals)
        self._setup_base_lines(vals)
        self._add_invoice_tax_details_vals(vals)
        self._add_total_amount_vals(vals)

        document_node = {}
        self._add_exchanged_document_context_node(document_node, vals)
        self._add_exchanged_document_node(document_node, vals)
        self._add_supply_chain_trade_transaction_node(document_node, vals)

        return document_node

    def _add_invoice_config_vals(self, vals):
        invoice = vals['invoice']
        supplier = invoice.company_id.partner_id.commercial_partner_id
        customer = invoice.partner_id
        partner_shipping = invoice.partner_shipping_id or invoice.partner_id
        if invoice.is_purchase_document():
            supplier, customer = customer, supplier
            partner_shipping = customer

        exchanged_document = {
            'id': invoice.name,
            'type_code': '380' if invoice.move_type == 'out_invoice' else '381',
            'issue_date_time': invoice.invoice_date,
            'included_note': html2plaintext(invoice.narration) if invoice.narration else "",
        }

        if 'siret' in invoice.company_id._fields and invoice.company_id.siret:
            seller_siret = invoice.company_id.siret
        else:
            seller_siret = invoice.company_id.company_registry

        if 'siret' in invoice.commercial_partner_id._fields and invoice.commercial_partner_id.siret:
            buyer_siret = invoice.commercial_partner_id.siret
        else:
            buyer_siret = invoice.commercial_partner_id.company_registry

        seller_vat = None
        if invoice.fiscal_position_id.foreign_vat:
            seller_vat = invoice.fiscal_position_id.foreign_vat
        elif invoice.company_id.vat:
            seller_vat = invoice.company_id.vat

        buyer_vat = customer.vat
        buyer_reference = invoice.buyer_reference if 'buyer_reference' in invoice._fields and invoice.buyer_reference else invoice.commercial_partner_id.ref
        purchase_order_reference = invoice.purchase_order_reference if 'purchase_order_reference' in invoice._fields and invoice.purchase_order_reference else invoice.ref or invoice.name
        contract_reference = invoice.contract_reference if 'contract_reference' in invoice._fields and invoice.contract_reference else ''
        delivery_date = invoice.delivery_date or invoice.invoice_date

        if self.env['account.payment']._fields.get('sdd_mandate_id') and invoice.reconciled_payment_ids.sdd_mandate_id:
            payment_means_code = PAYMENT_MEAN_CODES['SEPA direct debit']
        else:
            payment_means_code = PAYMENT_MEAN_CODES['Payment to bank account']

        billing_start_dates = [invoice.invoice_date] if invoice.invoice_date else []
        billing_start_dates += [move_line.deferred_start_date for move_line in invoice.invoice_line_ids if move_line.deferred_start_date]
        billing_end_dates = [invoice.invoice_date_due] if invoice.invoice_date_due else []
        billing_end_dates += [move_line.deferred_end_date for move_line in invoice.invoice_line_ids if move_line.deferred_end_date]
        start_date = end_date = None
        if billing_start_dates:
            start_date = min(billing_start_dates)
        if billing_end_dates:
            end_date = max(billing_end_dates)

        vals.update({
            'supplier': supplier,
            'customer': customer,
            'partner_shipping': partner_shipping,

            'currency_id': invoice.currency_id,
            'company_currency_id': invoice.company_id.currency_id,

            'use_company_currency': False,  # If true, use the company currency for the amounts instead of the invoice currency
            'fixed_taxes_as_allowance_charges': True,  # If true, include fixed taxes as AllowanceCharges on lines instead of as taxes

            'document_context_id': "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended",
            'exchanged_document_vals': exchanged_document,
            'seller_specified_legal_organization': seller_siret,
            'buyer_specified_legal_organization': buyer_siret,
            'seller_tax_registration': seller_vat,
            'buyer_tax_registration': buyer_vat,
            'buyer_reference': buyer_reference,
            'purchase_order_reference': purchase_order_reference,
            'contract_reference': contract_reference,
            'delivery_date': delivery_date,
            'payment_means_code': payment_means_code,
            'billing_start_date': start_date,
            'billing_end_date': end_date,
            'intracom_delivery': False,
        })

    def _add_invoice_base_lines_vals(self, vals):
        invoice = vals['invoice']
        vals['base_lines'], _tax_lines = invoice._get_rounded_base_and_tax_lines()

    def _add_invoice_currency_vals(self, vals):
        vals['currency_suffix'] = '' if vals['use_company_currency'] else '_currency'

        currency = vals['company_currency_id'] if vals['use_company_currency'] else vals['currency_id']
        vals['currency_dp'] = self._get_currency_decimal_places(currency)
        vals['currency_name'] = currency.name

    def _add_invoice_tax_grouping_function_vals(self, vals):
        # Add the grouping functions for the monetary totals and tax totals
        customer = vals['customer']
        supplier = vals['supplier']

        def tax_grouping_function(base_line, tax_data):
            tax = tax_data and tax_data['tax']
            if not tax:
                return None
            grouping_key = {
                **self._get_tax_unece_codes(customer, supplier, tax),
                'amount': tax.amount,
                'amount_type': tax.amount_type,
            }
            # If the tax is fixed, we want to have one group per tax
            # s.t. when the invoice is imported, we can try to guess the fixed taxes
            if tax and tax.amount_type == 'fixed':
                grouping_key['tax_name'] = tax.name
            return grouping_key

        vals['tax_grouping_function'] = tax_grouping_function

    def _setup_base_lines(self, vals):
        base_lines = vals['base_lines']

        for base_line in base_lines:

            self._cii_turn_price_unit_positive(base_line)

            base_line['allowance_charge_vals_list'] = allowance_charge_vals_list = []
            base_line['main_tax'] = main_tax = []
            tax_details = base_line['tax_details']
            taxes_data = tax_details['taxes_data']
            for tax_data in taxes_data:
                tax = tax_data['tax']
                # Fixed taxes as allowance and charges
                if tax and tax.amount_type == 'fixed':
                    allowance_charge_vals_list.append({'tax_data': tax_data})
                    for currency_suffix in ['', '_currency']:
                        tax_details[f'raw_total_excluded{currency_suffix}'] += tax_data[f'raw_tax_amount{currency_suffix}']
                        tax_details[f'total_excluded{currency_suffix}'] += tax_data[f'tax_amount{currency_suffix}']
                elif tax:
                    main_tax.append(tax_data)

        self._cii_extract_cash_rounding_lines(vals)
        self._cii_extract_early_pay_discount_lines(vals)

    def _add_invoice_tax_details_vals(self, vals):
        base_lines_aggregated_tax_details = self.env['account.tax']._aggregate_base_lines_tax_details(vals['base_lines'], vals['tax_grouping_function'])
        aggregated_tax_details = self.env['account.tax']._aggregate_base_lines_aggregated_values(base_lines_aggregated_tax_details)
        vals['tax_details'] = {}
        for grouping_key, values in aggregated_tax_details.items():
            if grouping_key and grouping_key['amount_type'] != 'fixed':
                vals['tax_details'][grouping_key] = values

            if grouping_key and grouping_key['tax_category_code'] == 'K':
                vals['intracom_delivery'] = True

    def _add_total_amount_vals(self, vals):
        for currency_suffix in ['', '_currency']:
            # Total base amount
            vals[f'line_total_amount{currency_suffix}'] = sum(
                tax_data[f'base_amount{currency_suffix}']
                for _grouping_key, tax_data in vals['tax_details'].items()
            )
            # Total tax amount
            vals[f'tax_total_amount{currency_suffix}'] = sum(
                tax_data[f'tax_amount{currency_suffix}']
                for _grouping_key, tax_data in vals['tax_details'].items()
            )
            # Cash rounding for 'add_invoice_line' cash rounding strategy
            vals[f'cash_rounding_base_amount{currency_suffix}'] = sum(
                base_line['tax_details'][f'total_excluded{currency_suffix}']
                for base_line in vals.setdefault('cash_rounding_base_lines', [])
            )
            # Total grand amount
            vals[f'grand_total_amount{currency_suffix}'] = (
                    vals[f'line_total_amount{currency_suffix}'] +
                    vals[f'tax_total_amount{currency_suffix}'] +
                    vals[f'cash_rounding_base_amount{currency_suffix}']
            )
            # Prepaid amount
            vals[f'total_prepaid_amount{currency_suffix}'] = (
                vals[f'grand_total_amount{currency_suffix}'] -
                vals['invoice'].amount_residual
            )
            # Due payable amount
            vals[f'due_payable_amount{currency_suffix}'] = (
                vals[f'grand_total_amount{currency_suffix}'] -
                vals[f'total_prepaid_amount{currency_suffix}']
            )

    def _add_exchanged_document_context_node(self, node, vals):
        node['rsm:ExchangedDocumentContext'] = {
            'ram:GuidelineSpecifiedDocumentContextParameter': {
                'ram:ID': {'_text': vals['document_context_id']}
            }
        }

    def _add_exchanged_document_node(self, node, vals):
        exchanged_document_vals = vals['exchanged_document_vals']
        node['rsm:ExchangedDocument'] = {
            'ram:ID': {'_text': exchanged_document_vals['id']},
            'ram:TypeCode': {'_text': exchanged_document_vals['type_code']},
            'ram:IssueDateTime': self._get_date_time_string_node(exchanged_document_vals['issue_date_time']),
            'ram:IncludedNote': {
                'ram:Content': {'_text': exchanged_document_vals['included_note']},
            },
        }

    def _add_supply_chain_trade_transaction_node(self, document_node, vals):
        document_node['rsm:SupplyChainTradeTransaction'] = self._get_supply_chain_trade_transaction_node(vals)

    def _get_supply_chain_trade_transaction_node(self, vals):
        supply_chain_node = {}
        self._add_line_item_nodes(supply_chain_node, vals)
        self._add_trade_agreement_node(supply_chain_node, vals)
        self._add_trade_delivery_node(supply_chain_node, vals)
        self._add_trade_settlement_node(supply_chain_node, vals)
        return supply_chain_node

    def _add_line_item_nodes(self, node, vals):
        node['ram:IncludedSupplyChainTradeLineItem'] = line_nodes = []
        for idx, base_line in enumerate(vals['base_lines']):
            line_vals = {
                **vals,
                'line_idx': idx + 1,
                'base_line': base_line,
            }
            line_node = self._get_line_node(line_vals)
            line_nodes.append(line_node)

    def _get_line_node(self, vals):
        self._add_invoice_line_vals(vals)

        line_node = {}

        self._add_line_id_node(line_node, vals)
        self._add_line_product_node(line_node, vals)
        self._add_line_amounts_node(line_node, vals)
        self._add_line_quantity_node(line_node, vals)
        self._add_line_trade_settlement_node(line_node, vals)
        return line_node

    def _add_invoice_line_vals(self, vals):
        base_line = vals['base_line']
        move_line = base_line['record']
        company_currency = vals['company_currency_id']
        invoice_currency = base_line['currency_id']
        tax = base_line['main_tax'][0]['tax'] if base_line['main_tax'] else None

        gross_charge_amount_currency = invoice_currency.round(base_line['price_unit'])
        if tax and tax.price_include:
            gross_charge_amount_currency = invoice_currency.round(base_line['price_unit'] / (1 + (tax.amount / 100)))
            for allowance_charge in base_line['allowance_charge_vals_list']:
                gross_charge_amount_currency -= invoice_currency.round(allowance_charge['tax_data']['tax_amount'] / base_line['quantity'])
        gross_charge_amount = company_currency.round(gross_charge_amount_currency / base_line['rate'])

        discount_data = None
        if base_line.get('discount'):
            discount_percentage = base_line['discount'] / 100.0
            discount_data = {
                'charge_indicator': 'false',
                'actual_amount_currency': invoice_currency.round(gross_charge_amount_currency * discount_percentage),
                'actual_amount': company_currency.round(gross_charge_amount * discount_percentage),
            }

        net_charge_amount_currency = gross_charge_amount_currency - (discount_data or {}).get('actual_amount_currency', 0.0)
        net_charge_amount = gross_charge_amount - (discount_data or {}).get('actual_amount', 0.0)

        vals.update({
            'gross_charge_amount_currency': gross_charge_amount_currency,
            'gross_charge_amount': gross_charge_amount,
            'discount': discount_data,
            'net_charge_amount_currency': net_charge_amount_currency,
            'net_charge_amount': net_charge_amount,
            'deferred_start_date': move_line.deferred_start_date,
            'deferred_end_date': move_line.deferred_end_date,
        })

    def _add_line_id_node(self, line_node, vals):
        line_node['ram:AssociatedDocumentLineDocument'] = {
            'ram:LineID': {'_text': vals['line_idx']},
        }

    def _add_line_product_node(self, line_node, line_vals):
        product = line_vals['base_line']['product_id']
        line_node['ram:SpecifiedTradeProduct'] = {
            'ram:GlobalID': {
                '_text': product.barcode,
                'schemeID': "0160",
            } if product.barcode else None,
            'ram:SellerAssignedID': {
                '_text': product.default_code,
            } if product.default_code else None,
            'ram:Name': {'_text': product.name},
            'ram:Description': {
                '_text': html2plaintext(product.description),
            } if product.description else None,
        }

    def _add_line_amounts_node(self, line_node, line_vals):
        currency_suffix = line_vals['currency_suffix']
        line_node['ram:SpecifiedLineTradeAgreement'] = {
            'ram:GrossPriceProductTradePrice': {
                'ram:ChargeAmount': {'_text': self._cii_format_monetary(line_vals[f'gross_charge_amount{currency_suffix}'], 2)},
                'ram:AppliedTradeAllowanceCharge': {
                    'ram:ChargeIndicator': {
                        'udt:Indicator': {
                            '_text': line_vals['discount']['charge_indicator'],
                        },
                    },
                    'ram:ActualAmount': {'_text': self._cii_format_monetary(line_vals['discount'][f'actual_amount{currency_suffix}'], 2)}
                } if line_vals['discount'] else None,
            },
            'ram:NetPriceProductTradePrice': {
                'ram:ChargeAmount': {'_text': self._cii_format_monetary(line_vals[f'net_charge_amount{currency_suffix}'], 2)},
            },
        }

    def _add_line_quantity_node(self, line_node, line_vals):
        base_line = line_vals['base_line']
        line_node['ram:SpecifiedLineTradeDelivery'] = {
            'ram:BilledQuantity': {
                'unitCode': self._get_uom_unece_code(base_line['product_uom_id']),
                '_text': base_line['quantity'],
            },
        }

    def _add_line_trade_settlement_node(self, line_node, line_vals):
        line_node['ram:SpecifiedLineTradeSettlement'] = self._get_line_trade_settlement_node(line_vals)

    def _get_line_trade_settlement_node(self, line_vals):
        trade_node = {}
        self._add_line_tax_details_node(trade_node, line_vals)
        self._add_billing_period_node(trade_node, line_vals['deferred_start_date'], line_vals['deferred_end_date'])
        self._add_line_allowance_charge_node(trade_node, line_vals)
        self._add_line_subtotal_node(trade_node, line_vals)
        return trade_node

    def _add_line_tax_details_node(self, trade_node, line_vals):
        tax_data = line_vals['base_line']['main_tax'][0] if line_vals['base_line']['main_tax'] else None
        trade_node['ram:ApplicableTradeTax'] = {
            'ram:TypeCode': {'_text': 'VAT'},
            'ram:CategoryCode': {
                '_text': self._get_tax_category_code(line_vals['customer'].commercial_partner_id, line_vals['supplier'], tax_data['tax'])},
            'ram:RateApplicablePercent': {'_text': tax_data['tax'].amount},
        } if tax_data else None

    def _add_billing_period_node(self, line_node, start_date, end_date):
        line_node['ram:BillingSpecifiedPeriod'] = {
            'ram:StartDateTime': self._get_date_time_string_node(start_date),
            'ram:EndDateTime': self._get_date_time_string_node(end_date),
        } if start_date and end_date else None

    def _get_date_time_string_node(self, date):
        return {
            'udt:DateTimeString': {
                '_text': self._cii_format_date(date),
                'format': "102",
            },
        }

    def _add_line_allowance_charge_node(self, trade_node, line_vals):
        trade_node['ram:SpecifiedTradeAllowanceCharge'] = charge_nodes = []
        base_line = line_vals['base_line']
        currency_suffix = line_vals['currency_suffix']
        for allowance_charge in base_line['allowance_charge_vals_list']:
            tax_data = allowance_charge['tax_data']
            tax = tax_data['tax']
            charge_nodes.append({
                'ram:ChargeIndicator': {
                    'udt:Indicator': {'_text': 'true'},
                },
                'ram:ActualAmount': {'_text': self._cii_format_monetary(tax_data[f'tax_amount{currency_suffix}'], 2)},
                'ram:ReasonCode': {'_text': 'AEO'},  # Collection and recycling, for eco-taxes
                'ram:Reason': {'_text': tax.name},
            })

    def _add_line_subtotal_node(self, trade_node, line_vals):
        currency_suffix = line_vals['currency_suffix']
        trade_node['ram:SpecifiedTradeSettlementLineMonetarySummation'] = {
            'ram:LineTotalAmount': {'_text': self._cii_format_monetary(line_vals['base_line']['tax_details'][f'total_excluded{currency_suffix}'], 2)},
        }

    def _add_trade_agreement_node(self, node, vals):
        node['ram:ApplicableHeaderTradeAgreement'] = self._get_trade_agreement_node(vals)

    def _get_trade_agreement_node(self, vals):
        partner_node = {}
        self._add_buyer_reference_node(partner_node, vals)
        self._add_seller_trade_party_node(partner_node, vals)
        self._add_buyer_trade_party_node(partner_node, vals)
        self._add_order_reference_node(partner_node, vals)
        self._add_contract_reference_node(partner_node, vals)
        return partner_node

    def _add_buyer_reference_node(self, node, vals):
        node['ram:BuyerReference'] = {'_text': vals['buyer_reference']}

    def _add_seller_trade_party_node(self, node, vals):
        node['ram:SellerTradeParty'] = self._get_seller_party_node(vals)

    def _get_seller_party_node(self, vals):
        seller_party_node = {}
        self._add_trade_party_node(seller_party_node, vals['supplier'], vals['seller_specified_legal_organization'])
        self._add_tax_registration_node(seller_party_node, vals['seller_tax_registration'])
        return seller_party_node

    def _add_buyer_trade_party_node(self, node, vals):
        node['ram:BuyerTradeParty'] = self._get_buyer_party_node(vals)

    def _get_buyer_party_node(self, vals):
        buyer_party_node = {}
        self._add_trade_party_node(buyer_party_node, vals['customer'], vals['buyer_specified_legal_organization'])
        self._add_tax_registration_node(buyer_party_node, vals['buyer_tax_registration'])
        return buyer_party_node

    def _add_trade_party_node(self, node, partner, specified_legal_organisation):
        self._add_partner_name_node(node, partner)
        self._add_partner_specified_legal_organisation_node(node, specified_legal_organisation)
        self._add_partner_contact_node(node, partner)
        self._add_partner_address_node(node, partner)

    def _add_partner_name_node(self, node, partner):
        node['ram:Name'] = {'_text': partner.name}

    def _add_partner_specified_legal_organisation_node(self, node, specified_legal_organisation):
        if specified_legal_organisation:
            node['ram:SpecifiedLegalOrganization'] = {
                '_text': specified_legal_organisation,
                'schemeID': '0002',
            }

    def _add_partner_contact_node(self, node, partner):
        node['ram:DefinedTradeContact'] = {
            'ram:PersonName': {'_text': partner.name},
            'ram:TelephoneUniversalCommunication': {
                'ram:CompleteNumber': {'_text': partner.phone or partner.mobile},
            } if partner.phone or partner.mobile else None,
            'ram:EmailURIUniversalCommunication': {
                'ram:URIID': {'_text': partner.email},
            } if partner.email else None,
        }

    def _add_partner_address_node(self, node, partner):
        node['ram:PostalTradeAddress'] = {
            'ram:PostcodeCode': {'_text': partner.zip},
            'ram:LineOne': {'_text': partner.street},
            'ram:LineTwo': {'_text': partner.street2} if partner.street2 else None,
            'ram:CityName': {'_text': partner.city},
            'ram:CountryID': {'_text': partner.country_id.code},
        }

    def _add_tax_registration_node(self, node, vat):
        node['ram:SpecifiedTaxRegistration'] = {
            'ram:ID': {
                '_text': vat,
                'schemeID': 'VA',
            },
        } if vat else None

    def _add_order_reference_node(self, node, vals):
        node['ram:BuyerOrderReferencedDocument'] = {
            'ram:IssuerAssignedID': {'_text': vals['purchase_order_reference']},
        }

    def _add_contract_reference_node(self, node, vals):
        node['ram:ContractReferencedDocument'] = {
            'ram:IssuerAssignedID': {'_text': vals['contract_reference']},
        }

    def _add_trade_delivery_node(self, node, vals):
        node['ram:ApplicableHeaderTradeDelivery'] = self._get_trade_delivery_node(vals)

    def _get_trade_delivery_node(self, vals):
        delivery_node = {}
        self._add_shipping_trade_party_node(delivery_node, vals)
        self._add_delivery_date_node(delivery_node, vals)
        return delivery_node

    def _add_shipping_trade_party_node(self, node, vals):
        node['ram:ShipToTradeParty'] = self._get_shipping_trade_party_node(vals)

    def _get_shipping_trade_party_node(self, vals):
        shipping_trade_party_node = {}
        self._add_trade_party_node(shipping_trade_party_node, vals['partner_shipping'], None)
        return shipping_trade_party_node

    def _add_delivery_date_node(self, node, vals):
        node['ram:ActualDeliverySupplyChainEvent'] = {
            'ram:OccurrenceDateTime': self._get_date_time_string_node(vals['delivery_date'])
        } if vals['delivery_date'] else None

    def _add_trade_settlement_node(self, node, vals):
        node['ram:ApplicableHeaderTradeSettlement'] = self._get_trade_settlement_node(vals)

    def _get_trade_settlement_node(self, vals):
        trade_settlement_node = {}
        self._add_payment_reference_node(trade_settlement_node, vals)
        self._add_currency_code_node(trade_settlement_node, vals)
        self._add_payment_means_node(trade_settlement_node, vals)
        self._add_tax_details_node(trade_settlement_node, vals)
        self._add_billing_period_node(trade_settlement_node, vals['billing_start_date'], vals['billing_end_date'])
        self._add_payment_terms_node(trade_settlement_node, vals)
        self._add_summary_node(trade_settlement_node, vals)
        return trade_settlement_node

    def _add_payment_reference_node(self, node, vals):
        invoice = vals['invoice']
        node['ram:PaymentReference'] = {'_text': invoice.payment_reference}

    def _add_currency_code_node(self, node, vals):
        currency = vals['currency_id']
        node['ram:InvoiceCurrencyCode'] = {'_text': currency.name}

    def _add_payment_means_node(self, node, vals):
        invoice = vals['invoice']
        if invoice.partner_bank_id.sanitized_acc_number:
            node['ram:SpecifiedTradeSettlementPaymentMeans'] = self._get_payment_means_node(vals)

    def _get_payment_means_node(self, vals):
        payment_means_node = {}
        self._add_payment_type_code_node(payment_means_node, vals)
        self._add_payment_creditor_financial_account_node(payment_means_node, vals)
        return payment_means_node

    def _add_payment_type_code_node(self, node, vals):
        node['ram:TypeCode'] = {'_text': vals['payment_means_code']}

    def _add_payment_creditor_financial_account_node(self, node, vals):
        invoice = vals['invoice']
        if invoice.partner_bank_id.acc_type == 'iban':
            node['ram:PayeePartyCreditorFinancialAccount'] = {
                'ram:IBANID': {'_text': invoice.partner_bank_id.sanitized_acc_number},
            }
        else:
            node['ram:PayeePartyCreditorFinancialAccount'] = {
                'ram:ProprietaryID': {'_text': invoice.partner_bank_id.sanitized_acc_number},
            }

    def _add_tax_details_node(self, node, vals):
        node['ram:ApplicableTradeTax'] = tax_nodes = []
        for grouping_key, tax_details in vals['tax_details'].items():
            tax_node = self._get_tax_node({**vals, **grouping_key, **tax_details})
            tax_nodes.append(tax_node)

    def _get_tax_node(self, vals):
        invoice = vals['invoice']
        currency_suffix = vals['currency_suffix']
        amount_currency = vals[f'tax_amount{currency_suffix}']
        return {
            'ram:CalculatedAmount': {
                '_text': self._cii_format_monetary(amount_currency if not invoice.currency_id.is_zero(amount_currency) else 0.0, 2),
            },
            'ram:TypeCode': {'_text': "VAT"},
            'ram:ExemptionReason': {'_text': vals['tax_exemption_reason']},
            'ram:BasisAmount': {'_text': self._cii_format_monetary(vals[f'base_amount{currency_suffix}'], 2)},
            'ram:CategoryCode': {'_text': vals['tax_category_code']},
            'ram:ExemptionReasonCode': {'_text': vals['tax_exemption_reason_code']},
            'ram:DueDateTypeCode': {'_text': 5},
            'ram:RateApplicablePercent': {
                '_text': vals['amount'],
            } if vals['amount_type'] == 'percent' else None,
        }

    def _add_payment_terms_node(self, node, vals):
        invoice = vals['invoice']
        node['ram:SpecifiedTradePaymentTerms'] = {
            'ram:Description': {
                '_text': invoice.invoice_payment_term_id.name,
            } if invoice.invoice_payment_term_id else None,
            'ram:DueDateDateTime': self._get_date_time_string_node(invoice.invoice_date_due) if invoice.invoice_date_due else None,
            'ram:ApplicableTradePaymentDiscountTerms': {
                'ram:BasisPeriodMeasure': {
                    '_text': invoice.invoice_payment_term_id.discount_days,
                    'unitCode': 'DAY',
                },
                'ram:CalculationPercent': {'_text': invoice.invoice_payment_term_id.discount_percentage},
            } if invoice.invoice_payment_term_id.early_discount else None,
        }

    def _add_summary_node(self, node, vals):
        currency = vals['currency_id']
        currency_suffix = vals['currency_suffix']
        node['ram:SpecifiedTradeSettlementHeaderMonetarySummation'] = {
            'ram:LineTotalAmount': {'_text': self._cii_format_monetary(vals[f'line_total_amount{currency_suffix}'], 2)},
            'ram:TaxBasisTotalAmount': {'_text': self._cii_format_monetary(vals[f'line_total_amount{currency_suffix}'], 2)},
            'ram:TaxTotalAmount': {
                'currencyID': currency.name,
                '_text': self._cii_format_monetary(vals[f'tax_total_amount{currency_suffix}'], 2),
            },
            'ram:RoundingAmount': {
                '_text': self._cii_format_monetary(vals[f'cash_rounding_base_amount{currency_suffix}'], 2),
            } if vals[f'cash_rounding_base_amount{currency_suffix}'] else None,
            'ram:GrandTotalAmount': {'_text': self._cii_format_monetary(vals[f'grand_total_amount{currency_suffix}'], 2)},
            'ram:TotalPrepaidAmount': {'_text': self._cii_format_monetary(vals[f'total_prepaid_amount{currency_suffix}'], 2)},
            'ram:DuePayableAmount': {'_text': self._cii_format_monetary(vals[f'due_payable_amount{currency_suffix}'], 2)},
        }
