from markupsafe import Markup

from odoo import fields, models, Command
from odoo.addons.account_edi_ubl_cii.models.account_edi_common import UOM_TO_UNECE_CODE
from odoo.exceptions import UserError
from odoo.tools import float_repr, formatLang, frozendict
from datetime import datetime

DEFAULT_CII_DATE_FORMAT = '%Y%m%d'

class AccountEdiCii(models.AbstractModel):
    _name = "account.edi.cii"
    _inherit = 'account.edi.common'
    _description = "Base helpers for CII"

    def _cii_format_date(self, dt):
        """ Format the date in the CII standard. """
        dt = dt or datetime.now()
        return dt.strftime(DEFAULT_CII_DATE_FORMAT)

    def _cii_format_monetary(self, number, decimal_places=2):
        """ CII requires the monetary values to be rounded to 2 decimal values. """
        return float_repr(number, decimal_places)

    def _cii_turn_price_unit_positive(self, base_line):
        """
        Turn the unit_price positive and the quantity negative of the base_line when negative unit_price.
        [BR-27]-The Item net price (BT-146) shall NOT be negative.
        [BR-28]-The Item gross price (BT-148) shall NOT be negative.

        :param base_line: The base line of the item.
        """
        if base_line['price_unit'] < 0.0:
            base_line['quantity'] *= -1
            base_line['price_unit'] *= -1

    def _cii_extract_cash_rounding_lines(self, vals):
        """
        Extract the cash rounding lines for the 'add_invoice_line' cash rounding strategy.

        :param vals: Some custom data
        """
        base_lines = vals['base_lines']
        vals['base_lines'] = [base_line for base_line in base_lines if base_line['special_type'] != 'cash_rounding']
        vals['cash_rounding_base_lines'] = [base_line for base_line in base_lines if base_line['special_type'] == 'cash_rounding']

    def _cii_extract_early_pay_discount_lines(self, vals):
        """
        Extract the early payment discount lines.

        :param vals: Some custom data
        """
        base_lines = vals['base_lines']
        vals['base_lines'] = [base_line for base_line in base_lines if base_line['special_type'] != 'early_payment']
        vals['early_payment_discount_lines'] = [base_line for base_line in base_lines if base_line['special_type'] == 'early_payment']

    def _cii_constraints(self, invoice, vals):
        constraints = {}
        self._cii_check_seller(invoice, vals, constraints)
        self._cii_check_buyer(vals, constraints)
        self._cii_check_one_tax_per_line(invoice, vals, constraints)

        if vals['intracom_delivery']:
            self._cii_check_intracom_delivery(vals, constraints)

        if vals['invoice']['partner_id']['country_id']['code'] == 'ES' \
            and vals['invoice']['partner_id']['zip'] \
            and vals['invoice']['partner_id']['zip'][:2] in ['35', '38']:
            self._cii_check_igi_tax_rate(invoice, vals, constraints)

        return constraints

    def _cii_check_seller(self, invoice, vals, constraints):
        self._cii_check_invoice_payment_instructions(invoice, vals, constraints)
        self._cii_check_seller_postal_address(vals, constraints)
        self._cii_check_seller_identifier(vals, constraints)
        self._cii_check_seller_contact(vals, constraints)

    def _cii_check_buyer(self, vals, constraints):
        self._cii_check_buyer_postal_address(vals, constraints)

    def _cii_check_invoice_payment_instructions(self, invoice, vals, constraints):
        """
        [BR-DE-1] An Invoice must contain information on "PAYMENT INSTRUCTIONS" (BG-16).
        First check that a partner_bank_id exists, then check that there is an account number.
        """
        if invoice.move_type == 'out_invoice':
            constraints.update({
                'seller_payment_instructions_1': self._check_required_fields(
                    vals['invoice'], 'partner_bank_id'
                ),
                'seller_payment_instructions_2': self._check_required_fields(
                    vals['invoice']['partner_bank_id'], 'sanitized_acc_number',
                    self.env._("The field 'Sanitized Account Number' is required on the Recipient Bank.")
                ),
            })

    def _cii_check_seller_postal_address(self, vals, constraints):
        """
        [BR-08]-An Invoice shall contain the Seller postal address (BG-5).
        [BR-09]-The Seller postal address (BG-5) shall contain a Seller country code (BT-40).
        """
        constraints.update({
            'seller_postal_address': self._check_required_fields(
            vals['invoice']['company_id']['partner_id']['commercial_partner_id'], 'country_id'
            ),
        })

    def _cii_check_seller_identifier(self, vals, constraints):
        """
        [BR-CO-26]-In order for the buyer to automatically identify a supplier, the Seller identifier (BT-29),
        the Seller legal registration identifier (BT-30) and/or the Seller VAT identifier (BT-31) shall be present.
        """
        constraints.update({
            'seller_identifier': self._check_required_fields(
                vals['invoice']['company_id'], ['vat']
            ),
        })

    def _cii_check_seller_contact(self, vals, constraints):
        """
        [BR-DE-6] The element "Seller contact telephone number" (BT-42) must be transmitted.
        [BR-DE-7] The element "Seller contact email address" (BT-43) must be transmitted.
        """
        constraints.update({
            'seller_phone': self._check_required_fields(
                vals['invoice']['company_id']['partner_id']['commercial_partner_id'], ['phone', 'mobile'],
            ),
            'seller_email': self._check_required_fields(
                vals['invoice']['company_id'], 'email'
            ),
        })

    def _cii_check_buyer_postal_address(self, vals, constraints):
        """
        [BR-10]-An Invoice shall contain the Buyer postal address (BG-8).
        [BR-11]-The Buyer postal address shall contain a Buyer country code (BT-55).
        """
        constraints.update({
            'buyer_postal_address': self._check_required_fields(
                vals['invoice']['commercial_partner_id'], 'country_id'
            ),
        })

    def _cii_check_one_tax_per_line(self, invoice, vals, constraints):
        """
        Element 'ram:ApplicableTradeTax' must occur exactly 1 times
        Each invoice line must have one and only one tax
        """
        for line in invoice.invoice_line_ids.filtered(lambda x: x.display_type not in ('line_note', 'line_section')):
            if len(line.tax_ids.flatten_taxes_hierarchy().filtered(lambda t: t.amount_type != 'fixed')) != 1:
                constraints.update({
                    'one_tax_per_line': self.env._("Each invoice line shall have one and only one tax."),
                })

    def _cii_check_intracom_delivery(self, vals, constraints):
        """
        [BR-IC-02]-An Invoice that contains an Invoice line (BG-25) where the Invoiced item VAT category code (BT-151)
        is "Intra-community supply" shall contain the Seller VAT Identifier (BT-31) or the Seller tax representative
        VAT identifier (BT-63) and the Buyer VAT identifier (BT-48).
        """
        constraints.update({
            'intracom_seller_vat': self._check_required_fields(
                vals['invoice']['company_id'], 'vat'
            ),
            'intracom_buyer_vat': self._check_required_fields(
                vals['invoice']['commercial_partner_id'], 'vat'
            ),
        })

    def _cii_check_igi_tax_rate(self, invoice, vals, constraints):
        for line in invoice.invoice_line_ids.filtered(lambda x: x.display_type not in ('line_note', 'line_section')):
            tax_rate_list = line.tax_ids.flatten_taxes_hierarchy().mapped("amount")
            if not any(rate > 0 for rate in tax_rate_list):
                constraints.update({
                    'igic_tax_rate': self.env._("When the Canary Island General Indirect Tax (IGIC) applies, the tax rate on "
                         "each invoice line should be greater than 0."),
                })

    # -------------------------------------------------------------------------
    # NEW IMPORT : helpers
    # -------------------------------------------------------------------------

    def _cii_import_invoice(self, invoice, file_data, new=False):

        collected_values = self._import_ubl_cii_init_collected_values(invoice, file_data)

        self._import_ubl_cii_invoice_document_sign(collected_values)
        self._import_ubl_cii_invoice_update_move_type(collected_values)

        # invoice ref / invoice_origin / date / date_due / delivery_date / narration
        self._import_cii_invoice_add_ref(collected_values)
        self._import_cii_invoice_add_invoice_origin(collected_values)
        self._import_cii_invoice_add_issue_date(collected_values)
        self._import_cii_invoice_add_date_due(collected_values)
        self._import_cii_invoice_add_invoice_delivery_date(collected_values)
        self._import_cii_invoice_add_narration(collected_values)

        # customer
        self._import_cii_invoice_add_customer_values(collected_values)
        self._import_ubl_cii_retrieve_customer(collected_values)
        self._import_ubl_cii_create_missing_customer(collected_values)

        # currency
        self._import_cii_invoice_add_currency_code(collected_values)
        self._import_ubl_cii_invoice_add_currency(collected_values)

        # bank account
        self._import_cii_invoice_add_partner_bank_values(collected_values)
        self._import_ubl_cii_retrieve_partner_bank(collected_values)

        # Prepaid / rounding amounts / Tax total values.
        self._import_cii_invoice_add_prepaid_amount(collected_values)
        self._import_cii_invoice_add_tax_total_values(collected_values)

        # allowance / charge of the document
        self._import_cii_invoice_add_allowances_charges_values(collected_values)

        # Invoice lines values.
        self._import_cii_invoice_add_invoice_line_values(collected_values)
        self._import_ubl_cii_invoice_retrieve_products(collected_values)
        self._import_ubl_cii_invoice_retrieve_product_uoms(collected_values)
        self._import_ubl_cii_invoice_retrieve_accounts(collected_values)
        self._import_ubl_cii_invoice_retrieve_taxes(collected_values)
        self._import_ubl_cii_invoice_add_base_lines(collected_values)

        # End the invoice.
        self._import_ubl_cii_invoice_write_collected_values(collected_values)
        self._import_ubl_cii_invoice_fix_taxes_amounts(collected_values)
        self._import_cii_invoice_fix_untaxed_amount(collected_values)
        self._import_ubl_cii_invoice_post_processing(collected_values)
        return True

    def _import_cii_invoice_document_sign(self, collected_values):
        tree = collected_values['tree']
        suffix_invoice_type, document_sign = self._get_import_document_amount_sign(tree)
        collected_values['is_refund'] = suffix_invoice_type == 'refund'
        collected_values['file_document_sign'] = document_sign or 1

    def _import_cii_invoice_add_ref(self, collected_values):
        tree = collected_values['tree']
        if ref := tree.findtext('./{*}ExchangedDocument/{*}ID'):
            collected_values['to_write']['ref'] = ref

    def _import_cii_invoice_add_invoice_origin(self, collected_values):
        tree = collected_values['tree']
        if invoice_origin := tree.findtext('.//{*}BuyerOrderReferencedDocument/{*}IssuerAssignedID'):
            collected_values['to_write']['invoice_origin'] = invoice_origin

    def _import_cii_invoice_add_issue_date(self, collected_values):
        tree = collected_values['tree']
        if issue_date_str := tree.findtext('./{*}ExchangedDocument/{*}IssueDateTime/{*}DateTimeString'):
            collected_values['to_write']['invoice_date'] = datetime.strptime(issue_date_str.strip(), DEFAULT_CII_DATE_FORMAT)

    def _import_cii_invoice_add_date_due(self, collected_values):
        tree = collected_values['tree']
        if invoice_date_due_str := tree.findtext(".//{*}SpecifiedTradePaymentTerms/{*}DueDateDateTime/{*}DateTimeString"):
            collected_values['to_write']['invoice_date_due'] = datetime.strptime(invoice_date_due_str.strip(), DEFAULT_CII_DATE_FORMAT)

    def _import_cii_invoice_add_invoice_delivery_date(self, collected_values):
        tree = collected_values['tree']
        if delivery_date_str := tree.findtext(".//{*}ActualDeliverySupplyChainEvent/{*}OccurrenceDateTime/{*}DateTimeString"):
            collected_values['to_write']['delivery_date'] = datetime.strptime(delivery_date_str.strip(), DEFAULT_CII_DATE_FORMAT)

    def _import_cii_invoice_add_narration(self, collected_values):
        tree = collected_values['tree']
        if narration := tree.findtext('./{*}ExchangedDocument/{*}IncludedNote/{*}Content'):
            collected_values['to_write']['narration'] = narration

    def _import_cii_invoice_add_customer_values(self, collected_values):
        customer_values = collected_values['customer_values'] = {}
        odoo_document_type = collected_values['odoo_document_type']
        party_tag = "BuyerTradeParty" if odoo_document_type == 'sale' else "SellerTradeParty"
        tree = collected_values['tree']
        party_node = tree.find(f".//{{*}}ApplicableHeaderTradeAgreement/{{*}}{party_tag}")
        if party_node is None:
            return

        for key, xpath in (
            ('name', "./{*}Name"),
            ('phone', ".//{*}TelephoneUniversalCommunication/{*}CompleteNumber"),
            ('email', ".//{*}EmailURIUniversalCommunication/{*}URIID"),
            ('zip', ".//{*}PostcodeCode"),
            ('street', ".//{*}LineOne"),
            ('street2', ".//{*}LineTwo"),
            ('city', ".//{*}CityName"),
            ('country_code', ".//{*}CountryID"),
            ('vat', "./{*}SpecifiedTaxRegistration/{*}ID")
        ):
            customer_values[key] = None
            if (node := party_node.find(xpath)) is not None:
                customer_values[key] = node.text

    def _import_ubl_cii_retrieve_customer_search_plan(self, collected_values):
        # EXTENDS account.edi.common
        ResPartner = self.env['res.partner']
        return [
            ResPartner._import_retrieve_customer_from_vat,
            ResPartner._import_retrieve_customer_from_email,
            ResPartner._import_retrieve_customer_from_phone,
            ResPartner._import_retrieve_customer_from_name,
        ]

    def _import_ubl_cii_prepare_missing_customer_create_values(self, collected_values):
        customer_values = collected_values['customer_values']
        partner_create_values = {
            'is_company': True,
        }
        for key in ('phone', 'name', 'email', 'street', 'street2', 'zip', 'city'):
            if value := customer_values.get(key):
                partner_create_values[key] = value

        country = None
        if country_code := customer_values.get('country_code'):
            if country_code == 'GB':
                # While the code is gb, the xml_id is uk
                country_code = 'UK'
            country = self.env.ref(f'base.{country_code.lower()}', raise_if_not_found=False)
            if country:
                partner_create_values['country_id'] = country.id
        if customer_values.get('vat') and self.env['res.partner']._run_vat_test(customer_values['vat'], country, True):
            partner_create_values['vat'] = customer_values['vat']
        return partner_create_values

    def _import_cii_invoice_add_currency_code(self, collected_values):
        currency_values = collected_values['currency_values'] = {}
        tree = collected_values['tree']
        currency_values['currency_code'] = tree.findtext('.//{*}InvoiceCurrencyCode')

    def _import_cii_invoice_add_partner_bank_values(self, collected_values):
        partner_bank_values = collected_values['partner_bank_values'] = {}
        tree = collected_values['tree']
        financial_nodes = tree.findall(".//{*}SpecifiedTradeSettlementPaymentMeans/{*}PayeePartyCreditorFinancialAccount")
        partner_bank_values['account_numbers']  = account_numbers = set()
        for node in financial_nodes:
            account_number = node.findtext('./{*}IBANID') or node.findtext('./{*}ProprietaryID')
            if account_number :
                account_numbers.add(account_number)

    def _import_cii_invoice_add_prepaid_amount(self, collected_values):
        file_document_sign = collected_values['file_document_sign']
        currency = collected_values['currency_values']['currency']
        tree = collected_values['tree']
        prepaid_amount_str = tree.findtext('.//{*}SpecifiedTradeSettlementHeaderMonetarySummation/{*}TotalPrepaidAmount')
        prepaid_amount = file_document_sign * float(prepaid_amount_str or 0.0)
        if currency.is_zero(prepaid_amount):
            return

        collected_values['prepaid_amount'] = prepaid_amount
        formatted_prepaid_amount = formatLang(self.env, prepaid_amount, currency_obj=currency)
        collected_values['logs'].append(self.env._("A payment of %s was detected.", formatted_prepaid_amount))

    def _import_cii_invoice_add_tax_total_values(self, collected_values):
        file_document_sign = collected_values['file_document_sign']
        odoo_document_type = collected_values['odoo_document_type']

        taxes_values = collected_values['tax_total_values'] = {}
        tree = collected_values['tree']
        for subtotal_elem in tree.findall('.//{*}ApplicableHeaderTradeSettlement/{*}ApplicableTradeTax'):
            amount = subtotal_elem.findtext('./{*}CalculatedAmount')
            category_code = subtotal_elem.findtext('./{*}CategoryCode')
            if amount is None or category_code is None:
                continue

            percentage = subtotal_elem.findtext('./{*}RateApplicablePercent')
            if percentage is None:
                continue

            percentage = float(percentage)
            tax_key = frozendict({
                'category_code': category_code,
                'percentage': percentage,
            })
            tax_values = taxes_values.setdefault(tax_key, {
                'amount_type': 'percent',
                'type_tax_use': odoo_document_type,
                'amount': percentage,
                'ubl_cii_tax_category_code': category_code,
                'tax_amount_currency': 0.0,
                'related_taxes_values': [],
            })
            tax_values['tax_amount_currency'] += file_document_sign * float(amount)

    def _import_cii_invoice_add_allowances_charges_values(self, collected_values):
        tree = collected_values['tree']
        allowances = collected_values['allowances'] = []
        charges = collected_values['charges'] = []

        for element in tree.iterfind('./{*}SupplyChainTradeTransaction/{*}ApplicableHeaderTradeSettlement/{*}SpecifiedTradeAllowanceCharge'):
            reason = element.findtext('./{*}Reason')
            reason_code = element.findtext('./{*}ReasonCode')
            charge_indicator = element.findtext('./{*}ChargeIndicator/{*}Indicator')
            amount_str = element.findtext('./{*}ActualAmount')
            base_amount_str = element.findtext('./{*}BasisAmount')
            multiplier_factor_numeric_str = element.findtext('./{*}CalculationPercent')
            percentage_str = element.findtext('./{*}CategoryTradeTax/{*}RateApplicablePercent')

            if amount_str:
                amount = float(amount_str)
            else:
                amount = 0.0

            if not percentage_str:
                continue

            percentage = float(percentage_str)
            allowance_charge_values = {
                'amount': amount,
                'base_amount': float(base_amount_str) if base_amount_str else None,
                'reason': reason,
                'reason_code': reason_code,
                'multiplier_factor_numeric': float(multiplier_factor_numeric_str) if multiplier_factor_numeric_str else None,
                'tax_percentage': percentage,
                'charge_indicator': charge_indicator,
            }
            if charge_indicator.lower() == 'true':
                charges.append(allowance_charge_values)
            else:
                allowances.append(allowance_charge_values)

    def _import_cii_invoice_add_invoice_line_values(self, collected_values):
        lines_collected_values = collected_values['lines_collected_values'] = []
        tree = collected_values['tree']
        for line_tree in tree.iterfind("./{*}SupplyChainTradeTransaction/{*}IncludedSupplyChainTradeLineItem"):
            line_collected_values = {
                **collected_values,
                'line_tree': line_tree,
                'to_write': {},
            }
            # allowance / charges of the line
            self._import_cii_invoice_line_add_allowance_charges_values(line_collected_values)

            # name / quantity / price_unit / discount / deferred_start_date / deferred_end_date
            self._import_cii_invoice_line_add_name(line_collected_values)
            self._import_cii_invoice_line_add_price_unit_quantity_discount(line_collected_values)
            self._import_cii_invoice_line_add_deferred_dates(line_collected_values)

            # product / product_uom / taxes
            self._import_cii_invoice_line_add_product_values(line_collected_values)
            self._import_cii_invoice_line_add_product_uom_values(line_collected_values)
            self._import_cii_invoice_line_add_account_values(line_collected_values)
            self._import_cii_invoice_line_add_taxes_values(line_collected_values)

            lines_collected_values.append(line_collected_values)

    def _import_cii_invoice_line_add_allowance_charges_values(self, collected_values):
        line_tree = collected_values['line_tree']
        allowances = collected_values['allowances'] = []
        charges = collected_values['charges'] = []
        for allowance_charge_elem in line_tree.iterfind('.//{*}SpecifiedTradeAllowanceCharge'):
            charge_indicator = allowance_charge_elem.findtext('.//{*}ChargeIndicator/{*}Indicator')
            amount_str = allowance_charge_elem.findtext('.//{*}ActualAmount')
            base_amount_str = allowance_charge_elem.findtext('.//{*}BasisAmount')
            reason = allowance_charge_elem.findtext('.//{*}Reason')
            reason_code = allowance_charge_elem.findtext('.//{*}ReasonCode')

            if amount_str:
                amount = float(amount_str)
            else:
                continue

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

        allowance_elem = line_tree.find('.//{*}GrossPriceProductTradePrice/{*}AppliedTradeAllowanceCharge')
        collected_values['price_allowance_values'] = {}
        if allowance_elem is not None:
            charge_indicator = allowance_elem.findtext('./{*}ChargeIndicator/{*}Indicator') or 'false'
            amount_str = allowance_elem.findtext('./{*}ActualAmount')
            base_amount_str = allowance_elem.findtext('./{*}BasisAmount')
            reason = allowance_elem.findtext('./{*}AllowanceChargeReason')
            reason_code = allowance_elem.findtext('./{*}AllowanceChargeReasonCode')

            if charge_indicator.lower() == 'true':
                charge_indicator_sign = 1
            else:
                charge_indicator_sign = -1

            collected_values['price_allowance_values'] = {
                'charge_indicator_sign': charge_indicator_sign,
                'amount': float(amount_str) if amount_str else None,
                'base_amount': float(base_amount_str) if base_amount_str else None,
                'reason': reason,
                'reason_code': reason_code,
            }

    def _import_cii_invoice_line_add_name(self, collected_values):
        line_tree = collected_values['line_tree']
        name = collected_values['name'] = (
            line_tree.findtext('.//{*}SpecifiedTradeProduct/{*}Name')
            or line_tree.findtext('.//{*}SpecifiedTradeProduct/{*}Description')
        )
        if name:
            collected_values['to_write']['name'] = name

    def _import_cii_invoice_line_add_price_unit_quantity_discount(self, collected_values):
        file_document_sign = collected_values['file_document_sign']
        line_tree = collected_values['line_tree']
        currency = collected_values['currency_values']['currency']

        line_total_amount_str = line_tree.findtext('.//{*}SpecifiedTradeSettlementLineMonetarySummation/{*}LineTotalAmount')
        price_amount_str = line_tree.findtext('.//{*}NetPriceProductTradePrice/{*}ChargeAmount')
        billed_quantity_str = line_tree.findtext ('.//{*}BilledQuantity')
        base_quantity_str = (
            line_tree.findtext('.//{*}GrossPriceProductTradePrice/{*}BasisQuantity')
            or line_tree.findtext(".//{*}NetPriceProductTradePrice/{*}BasisQuantity")
        )

        line_total_amount = line_total_amount_str and float(line_total_amount_str) * file_document_sign
        price_amount = price_amount_str and float(price_amount_str)
        billed_quantity = billed_quantity_str and float(billed_quantity_str) * file_document_sign
        base_quantity = base_quantity_str and float(base_quantity_str) * file_document_sign

        total_allowances = sum(allowance['amount'] for allowance in collected_values['allowances'])
        total_charges = sum(charge['amount'] for charge in collected_values['charges'])
        price_allowance_values = collected_values.get('price_allowance_values', {})
        price_allowance_base_amount = price_allowance_values.get('base_amount')
        price_allowance_amount = price_allowance_values.get('amount')
        if price_allowance_amount and (price_allowance_charge_indicator_sign := price_allowance_values.get('charge_indicator_sign')):
            price_allowance_amount *= price_allowance_charge_indicator_sign
        subtotal = (line_total_amount or 0.0) + total_allowances - total_charges

        # Price level.
        # Define at the product level the price for which quantity and how many discount you get
        # by buying it
        if price_amount:
            price_quantity = base_quantity or 1.0
            if price_allowance_base_amount:
                price_discount_amount = price_allowance_base_amount - price_amount
                price_subtotal = price_allowance_base_amount
            elif price_allowance_amount:
                price_discount_amount = -price_allowance_amount
                price_subtotal = price_amount
            else:
                price_discount_amount = 0.0
                price_subtotal = price_amount
        elif price_allowance_base_amount:
            price_subtotal = price_allowance_base_amount
            price_quantity = base_quantity or 1.0
            price_discount_amount = -(price_allowance_amount or 0.0)
        else:
            price_subtotal = 0.0
            price_quantity = 0.0
            price_discount_amount = 0.0

        # Line level.
        if (
            line_total_amount
            and not billed_quantity
        ):
            price_unit = subtotal
            quantity = 1.0
            discount_amount = total_allowances

            # Combine with the price level. Suppose:
            # line_total_amount = 1000.0
            # price_subtotal = 1250.0
            # price_quantity = 5.0
            # price_discount_amount = 250.0
            # In that case, we want to compute:
            # price_unit = 250.0
            # quantity = 5.0
            # discount_amount = 250.0
            if not currency.is_zero(price_subtotal):
                quantity = subtotal * price_quantity / price_subtotal
                price_unit = (subtotal / quantity) + (price_discount_amount / price_quantity)
                discount_amount += price_discount_amount * quantity / price_quantity

        elif (
            line_total_amount
            and billed_quantity
        ):
            quantity = billed_quantity
            price_unit = subtotal / quantity
            discount_amount = total_allowances

            # Combine with the price level. Suppose:
            # line_total_amount = 1200.0
            # quantity = 6
            # price_subtotal = 1250.0
            # price_quantity = 5.0
            # price_discount_amount = 50.0
            # In that case, we want to compute:
            # price_unit = 250.0
            # quantity = 6.0
            # discount_amount = 300.0
            if not currency.is_zero(price_subtotal):
                price_unit = (price_subtotal + price_discount_amount) / price_quantity
                discount_amount += price_discount_amount * quantity / price_quantity
        else:
            quantity = 0.0
            price_unit = 0.0
            discount_amount = total_allowances

            # Combine with the price level.
            if not currency.is_zero(price_subtotal):
                price_unit = price_subtotal / price_quantity
                quantity = price_quantity
                discount_amount += price_discount_amount

        # Extra charges.
        price_unit += total_charges / (quantity or 1.0)

        # Turn discount_amount to a percentage
        gross_subtotal = price_unit * quantity
        discount = (discount_amount * 100 / gross_subtotal) if gross_subtotal else 0.0

        to_write = collected_values['to_write']
        to_write['quantity'] = quantity
        to_write['price_unit'] = price_unit
        to_write['discount'] = discount

    def _import_cii_invoice_line_add_deferred_dates(self, collected_values):
        if not self.module_installed('account_accountant'):
            return

        line_tree = collected_values['line_tree']
        start_date_str = line_tree.findtext('.//{*}BillingSpecifiedPeriod/{*}StartDateTime/{*}DateTimeString')
        end_date_str = line_tree.findtext('.//{*}BillingSpecifiedPeriod/{*}EndDateTime/{*}DateTimeString')
        if start_date_str and end_date_str:
            to_write = collected_values['to_write']
            to_write['deferred_start_date'] = datetime.strptime(start_date_str.strip(), DEFAULT_CII_DATE_FORMAT)
            to_write['deferred_end_date'] = datetime.strptime(end_date_str.strip(), DEFAULT_CII_DATE_FORMAT)

    def _import_cii_invoice_line_add_product_values(self, collected_values):
        line_tree = collected_values['line_tree']
        partner = collected_values.get('customer_values', {}).get('customer')
        name = collected_values['to_write'].get('name')

        collected_values['product_values'] = {
            'default_code': line_tree.findtext('.//{*}SpecifiedTradeProduct/{*}SellerAssignedID'),
            'name': line_tree.findtext('.//{*}SpecifiedTradeProduct/{*}Name'),
            'barcode': line_tree.findtext('.//{*}SpecifiedTradeProduct/{*}GlobalID[@schemeID="0160"]'),
            'invoice_predictive': {
                'invoice': collected_values['invoice'],
                'name': name,
                'partner': partner or self.env['res.partner'],
            },
        }

    def _import_cii_invoice_line_add_product_uom_values(self, collected_values):
        line_tree = collected_values['line_tree']
        product_uom_values = collected_values['product_uom_values'] = {}

        quantity_node = line_tree.find('.//{*}SpecifiedLineTradeDelivery/{*}BilledQuantity')
        if quantity_node is not None:
            if uom_code := quantity_node.attrib.get('unitCode'):
                product_uom_values['uom_code'] = uom_code

    def _import_cii_invoice_line_add_account_values(self, collected_values):
        account_values = collected_values['account_values'] = {}
        partner = collected_values.get('customer_values', {}).get('customer')
        name = collected_values['to_write'].get('name')
        account_values['invoice_predictive'] = {
            'invoice': collected_values['invoice'],
            'name': name,
            'partner': partner or self.env['res.partner'],
        }

    def _import_cii_invoice_line_prepare_classified_tax_category_tax_values(self, collected_values, tax_category_tree):
        percentage = tax_category_tree.findtext('./{*}RateApplicablePercent')
        category_code = tax_category_tree.findtext('./{*}CategoryCode')

        if percentage is None or category_code is None:
            return

        percentage = float(percentage)
        tax_key = frozendict({
            'category_code': category_code,
            'percentage': percentage,
        })
        global_tax_values = collected_values['tax_total_values'].get(tax_key)
        if not global_tax_values:
            return

        tax_values = {
            'amount_type': global_tax_values['amount_type'],
            'type_tax_use': global_tax_values['type_tax_use'],
            'amount': global_tax_values['amount'],
            'ubl_cii_tax_category_code': global_tax_values['ubl_cii_tax_category_code'],
            '_tax_key': tax_key,
        }

        partner = collected_values.get('customer_values', {}).get('customer')
        if partner and (name := collected_values['to_write'].get('name')):
            tax_values['invoice_predictive'] = {
                'invoice': collected_values['invoice'],
                'name': name,
                'partner': partner,
            }
        return tax_values

    def _import_cii_invoice_line_prepare_charge_tax_values(self, collected_values, charge): #CC
        if charge['reason_code'] != 'AEO':
            return

        odoo_document_type = collected_values['odoo_document_type']
        fixed_tax_amount = charge['amount'] / collected_values['to_write']['quantity']
        charge['attempt_tax_values'] = tax_values = {
            'name': charge['reason'],
            'amount_type': 'fixed',
            'type_tax_use': odoo_document_type,
            'amount': fixed_tax_amount,
            'tax_amount_currency': fixed_tax_amount,
        }

        partner = collected_values.get('customer_values', {}).get('customer')
        if partner and (name := collected_values['to_write'].get('name')):
            tax_values['invoice_predictive'] = {
                'invoice': collected_values['invoice'],
                'name': name,
                'partner': partner,
            }
        return tax_values

    def _import_cii_invoice_line_add_taxes_values(self, collected_values):
        line_tree = collected_values['line_tree']
        taxes_values = collected_values['taxes_values'] = []
        tax_total_values = collected_values['tax_total_values']

        # Percentage taxes.
        for tax_category_tree in line_tree.findall('./{*}SpecifiedLineTradeSettlement/{*}ApplicableTradeTax'):
            tax_values = self._import_cii_invoice_line_prepare_classified_tax_category_tax_values(collected_values, tax_category_tree)
            if tax_values:
                taxes_values.append(tax_values)
                global_tax_values = tax_total_values.get(tax_values['_tax_key'])
                global_tax_values['related_taxes_values'].append(tax_values)

        # Fixed taxes.
        for charge in collected_values['charges']:
            tax_values = self._import_cii_invoice_line_prepare_charge_tax_values(collected_values, charge)
            if tax_values:
                taxes_values.append(tax_values)

    def _import_ubl_cii_retrieve_products_search_plan(self, collected_values):
        # EXTENDS account.edi.common
        ProductProduct = self.env['product.product']
        return [
            ProductProduct._import_retrieve_product_from_barcode,
            ProductProduct._import_retrieve_product_from_default_code,
            ProductProduct._import_retrieve_product_from_name,
            ProductProduct._import_retrieve_product_from_invoice_predictive,
        ]

    def _import_ubl_cii_retrieve_taxes_search_plan(self, collected_values):
        # EXTENDS account.edi.common
        AccountTax = self.env['account.tax']
        return [
            AccountTax._import_retrieve_tax_from_invoice_predictive,
            AccountTax._import_retrieve_tax_from_price_include_exclude,
        ]

    def _import_cii_invoice_fix_untaxed_amount(self, collected_values):
        if not collected_values['are_taxes_complete']:
            return

        tree = collected_values['tree']
        file_document_sign = collected_values['file_document_sign']
        currency = collected_values['currency_values']['currency']
        tax_exclusive_amount_str = tree.findtext('.//{*}SpecifiedTradeSettlementHeaderMonetarySummation/{*}TaxBasisTotalAmount')
        if not tax_exclusive_amount_str:
            return

        payable_rounding_amount_str = tree.findtext('.//{*}SpecifiedTradeSettlementHeaderMonetarySummation/{*}RoundingAmount')
        tax_exclusive_amount = file_document_sign * float(tax_exclusive_amount_str or 0.0)
        payable_rounding_amount = file_document_sign * float(payable_rounding_amount_str or 0.0)
        expected_untaxed_amount = tax_exclusive_amount + payable_rounding_amount
        invoice = collected_values['invoice']
        difference = currency.round(expected_untaxed_amount - invoice.amount_untaxed)
        for line_collected_values in collected_values['lines_collected_values']:
            for charge in line_collected_values['charges']:
                attempt_tax_values = charge.get('attempt_tax_values')
                if attempt_tax_values and attempt_tax_values.get('tax'):
                    difference -= charge['amount']
        if currency.is_zero(difference):
            return

        container = {'records': invoice}
        with (
            invoice._check_balanced(container),
            invoice._disable_discount_precision(),
            invoice._sync_dynamic_lines(container),
        ):
            invoice.invoice_line_ids = [
                Command.create({
                    'display_type': 'product',
                    'name': self.env._("Rounding"),
                    'quantity': 1,
                    'price_unit': difference,
                    'tax_ids': [],
                }),
            ]
