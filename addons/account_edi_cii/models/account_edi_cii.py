from odoo import models
from odoo.tools import formatLang, html2plaintext
from odoo.tools.misc import NON_BREAKING_SPACE
from odoo.tools.partner_identifiers import is_identifier_void
from datetime import datetime
from odoo.addons.account_edi_cii.models.account_edi_common import (
    FloatFmt,
)

DEFAULT_CII_DATE_FORMAT = '%Y%m%d'

PAYMENT_MEAN_CODES = {
    'Payment to bank account': 42,
    'SEPA direct debit': 59
}


class AccountEdiCii(models.AbstractModel):
    _name = "account.edi.cii"
    _inherit = 'account.edi.common'
    _description = "Base helpers for CII"

    # -------------------------------------------------------------------------
    # NEW EXPORT : helpers
    # -------------------------------------------------------------------------

    def _cii_add_invoice_config_vals(self, vals):
        """ Complete the values collected by '_init_invoice_export_values' with the ones needed by the CII syntax. """
        invoice = vals['invoice']

        # Lines reported at the document level.
        if not self._should_export_cash_rounding_as_line(vals):
            self._cii_extract_cash_rounding_lines(vals)
        else:
            vals['cash_rounding_base_lines'] = []
        if not self._should_export_early_payment_discount_as_line(vals):
            self._cii_extract_early_pay_discount_lines(vals)

        # [BR-IC-11] An intra-community supply needs a delivery date (BT-72) or an invoicing period (BG-14).
        # The invoicing period is only exported when every line has a start and an end date: it then goes from the
        # earliest start to the latest end, so that it contains every line period (PEPPOL-EN16931-R110/R111), and
        # the delivery date is not needed. The due date is never used: it is a payment deadline, not a period end.
        line_periods = [(base_line.get('deferred_start_date'), base_line.get('deferred_end_date')) for base_line in vals['base_lines']]
        if line_periods and all(start_date and end_date for start_date, end_date in line_periods):
            start_dates, end_dates = zip(*line_periods)
            self._cii_add_values_billing_dates(vals, min(start_dates), max(end_dates))
            self._cii_add_values_delivery_date(vals, None)
        else:
            self._cii_add_values_billing_dates(vals, None, None)
            self._cii_add_values_delivery_date(vals, invoice.delivery_date or invoice.invoice_date)

        self._round_base_lines_tax_details(vals, in_company_currency=False)

    def _cii_add_values_delivery_date(self, vals, delivery_date):
        vals['delivery_date'] = delivery_date

    def _cii_add_values_billing_dates(self, vals, start_date, end_date):
        vals['billing_start_date'] = start_date
        vals['billing_end_date'] = end_date

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
        Remove the early payment discount lines from the base lines (they are reported at the document level).

        :param vals: Some custom data
        """
        vals['base_lines'] = [base_line for base_line in vals['base_lines'] if base_line['special_type'] != 'early_payment']

    # ----------------------------------------------------------------------------
    # EXPORT : build nodes
    # ----------------------------------------------------------------------------

    def _cii_add_exchanged_document_context_node(self, vals):
        node = vals['document_node'].setdefault('rsm:ExchangedDocumentContext', {})
        node['ram:GuidelineSpecifiedDocumentContextParameter'] = {
                'ram:ID': {'_text': "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended"},
            }

    def _cii_add_exchanged_document_node(self, vals):
        invoice = vals['invoice']
        vals['document_node']['rsm:ExchangedDocument'] = {
            'ram:ID': {'_text': invoice.name},
            'ram:TypeCode': {'_text': '380' if invoice.move_type == 'out_invoice' else '381'},
            'ram:IssueDateTime': self._cii_get_date_time_string_node(vals, invoice.invoice_date),
            'ram:IncludedNote': self._cii_get_included_note_node(vals)
        }

    def _cii_get_date_time_string_node(self, vals, date):
        return {
            'udt:DateTimeString': {
                '_text': date.strftime(DEFAULT_CII_DATE_FORMAT),
                'format': "102",
            } if date else None,
        }

    def _cii_get_included_note_node(self, vals):
        nodes = []
        if note := self._cii_get_included_note(vals):
            nodes.append({
                'ram:Content': {'_text': self._edi_truncate(note, 'BT-22')},
            })
        for code, content in self._get_default_notes(vals).items():
            nodes.append({
                'ram:Content': {'_text': self._edi_truncate(content, 'BT-22')},
                'ram:SubjectCode': {'_text': code},
            })
        return nodes

    def _cii_get_included_note(self, vals):
        invoice = vals['invoice']
        notes = []

        AccountTax = self.env['account.tax']
        base_lines = vals['base_lines']
        currency = vals['currency']

        def grouping_function(base_line, tax_data):
            if not tax_data:
                return
            tax_grouping_key = self._get_tax_category_grouping_key(base_line, tax_data, vals, currency)
            if not tax_grouping_key:
                return
            return tax_grouping_key['is_withholding']

        base_lines_aggregated_values = AccountTax._aggregate_base_lines_tax_details(base_lines, grouping_function)
        values_per_grouping_key = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_values)
        vals['tax_withholding_amount'] = 0.0
        for grouping_key, values in values_per_grouping_key.items():
            if not grouping_key:
                continue

            tax_amount = values['tax_amount_currency']
            vals['tax_withholding_amount'] -= tax_amount

        if not currency.is_zero(vals['tax_withholding_amount']):
            notes.append(self.env._(
                "The prepaid amount of %s corresponds to the withholding tax applied.",
                formatLang(self.env, vals['tax_withholding_amount'], currency_obj=currency).replace(NON_BREAKING_SPACE, ''),
            ))

        terms_and_condition = html2plaintext(invoice.narration) if invoice.narration else None
        if terms_and_condition:
            notes.append(terms_and_condition)

        return ' '.join(notes) if notes else None

    def _cii_add_supply_chain_trade_transaction_node(self, vals):
        # The lines are built first: the header amounts are computed from the rounded line amounts.
        vals['line_item_nodes'] = self._cii_get_included_supply_chain_trade_line_item_nodes(vals)
        vals['document_node']['rsm:SupplyChainTradeTransaction'] = {
            'ram:IncludedSupplyChainTradeLineItem': vals['line_item_nodes'],
            'ram:ApplicableHeaderTradeAgreement': self._cii_get_applicable_header_trade_agreement_node(vals),
            'ram:ApplicableHeaderTradeDelivery': self._cii_get_applicable_header_trade_delivery_node(vals),
            'ram:ApplicableHeaderTradeSettlement': self._cii_get_applicable_header_trade_settlement_node(vals),
        }

    def _cii_get_included_supply_chain_trade_line_item_nodes(self, vals):
        nodes = []
        for idx, base_line in enumerate(vals['base_lines']):
            nodes.append(self._cii_get_included_supply_chain_trade_line_item_node(vals, idx + 1, base_line))
        return nodes

    def _cii_get_included_supply_chain_trade_line_item_node(self, vals, line_idx, base_line):
        return {
            'ram:AssociatedDocumentLineDocument': {
                'ram:LineID': {'_text': line_idx},
            },
            'ram:SpecifiedTradeProduct': self._cii_get_line_specified_trade_product_node(vals, base_line),
            'ram:SpecifiedLineTradeAgreement': {
                'ram:GrossPriceProductTradePrice': self._cii_get_gross_price_product_trade_price_node(vals, base_line),
                'ram:NetPriceProductTradePrice': self._cii_get_net_price_product_trade_price_node(vals, base_line),
            },
            'ram:SpecifiedLineTradeDelivery': {
                'ram:BilledQuantity': {
                    'unitCode': base_line['product_uom_id']._get_unece_code(),
                    '_text': base_line['quantity'],
                },
            },
            'ram:SpecifiedLineTradeSettlement': self._cii_get_specified_line_trade_settlement_node(vals, base_line),
        }

    def _cii_get_line_specified_trade_product_node(self, vals, base_line):
        product = base_line['product_id']
        description = base_line['name']
        name = self._edi_truncate(product.name or description, 'BT-153')
        return {
            'ram:GlobalID': {
                '_text': product.barcode,
                'schemeID': "0160",
            } if product.barcode else None,
            'ram:SellerAssignedID': {'_text': product.default_code} if product.default_code else None,
            'ram:Name': {'_text': name},
            'ram:Description': {
                '_text': description,
            } if product else None,
        }

    def _cii_get_gross_price_product_trade_price_node(self, vals, base_line):
        return {
            'ram:ChargeAmount': {'_text': FloatFmt(base_line['tax_details']['raw_gross_price_unit_currency'], max_dp=2)},
            'ram:AppliedTradeAllowanceCharge': self._cii_get_applied_trade_allowance_charge_node(vals, base_line) if base_line.get('discount') else None,
        }

    def _cii_get_applied_trade_allowance_charge_node(self, vals, base_line):
        discount_percentage = abs(base_line['discount']) / 100.0
        return {
            'ram:ChargeIndicator': {
                'udt:Indicator': {'_text': 'false' if base_line['discount'] > 0 else 'true'},
            },
            'ram:ActualAmount': {
                '_text': FloatFmt(vals['currency'].round(base_line['tax_details']['raw_gross_price_unit_currency'] * discount_percentage), max_dp=2),
            }
        }

    def _cii_get_net_price_product_trade_price_node(self, vals, base_line):
        return {
            'ram:ChargeAmount': {
                '_text': FloatFmt(base_line['tax_details']['raw_total_excluded_currency'] / (base_line['quantity'] or 1.0), max_dp=2),
            }
        }

    def _cii_get_specified_line_trade_settlement_node(self, vals, base_line):
        return {
            'ram:ApplicableTradeTax': self._cii_get_line_applicable_trade_tax_nodes(vals, base_line),
            'ram:BillingSpecifiedPeriod': {
                'ram:StartDateTime': self._cii_get_date_time_string_node(vals, base_line['deferred_start_date']) if base_line.get('deferred_start_date') else None,
                'ram:EndDateTime': self._cii_get_date_time_string_node(vals, base_line['deferred_end_date']) if base_line.get('deferred_end_date') else None,
            },
            'ram:SpecifiedTradeAllowanceCharge': self._cii_get_specified_line_trade_allowance_charge_nodes(vals, base_line),
            'ram:SpecifiedTradeSettlementLineMonetarySummation': self._cii_get_specified_trade_settlement_line_monetary_summation_node(vals, base_line),
        }

    def _cii_get_line_applicable_trade_tax_nodes(self, vals, base_line):
        tax_nodes = []
        aggregated_values = self.env['account.tax']._aggregate_base_line_tax_details(
            base_line=base_line,
            grouping_function=lambda base_line, tax_data: self._get_line_tax_category_grouping_key(
                base_line=base_line,
                tax_data=tax_data,
                vals=vals,
                currency=vals['currency'],
            ),
        )
        for grouping_key, values in aggregated_values.items():
            if not grouping_key:
                continue
            tax_nodes.append(self._cii_get_line_applicable_trade_tax_node(vals, {
                'tax_category_code': grouping_key['tax_category_code'],
                'rate_applicable_percent': grouping_key['percent'],
            }))
        return tax_nodes

    def _cii_get_line_applicable_trade_tax_node(self, vals, trade_tax_values):
        return {
            'ram:TypeCode': {'_text': "VAT"},
            'ram:CategoryCode': {'_text': trade_tax_values['tax_category_code']},
            'ram:RateApplicablePercent': {'_text': trade_tax_values['rate_applicable_percent']},
        }

    def _cii_get_specified_line_trade_allowance_charge_nodes(self, vals, base_line):
        nodes = vals['line_trade_allowance_charge_nodes'] = []
        sub_vals = {
            **vals,
            'allowance_charge_node': nodes,
            'base_line': base_line,
        }
        # Recycling contribution taxes.
        self._cii_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(sub_vals)
        # Excise taxes.
        self._cii_add_line_allowance_charge_nodes_for_excise_taxes(sub_vals)
        return nodes

    def _cii_add_line_allowance_charge_nodes_for_recycling_contribution_taxes(self, vals):
        base_line = vals['base_line']
        currency = base_line['currency_id']

        allowance_charges_nodes = vals['allowance_charge_node']
        for tax_data in base_line['tax_details']['taxes_data']:
            if not self._is_recycling_contribution_tax(tax_data):
                continue

            allowance_charges_nodes.append(self._cii_get_line_allowance_charge_recycling_contribution_node(vals, {
                'tax': tax_data['tax'],
                'is_charge': tax_data['tax_amount'] * tax_data['base_amount'] > 0.0,
                'amount': tax_data['tax_amount_currency'],
                'currency': currency,
            }))

    def _cii_get_line_allowance_charge_recycling_contribution_node(self, vals, recycling_contribution_values):
        currency = recycling_contribution_values['currency']
        amount = recycling_contribution_values['amount']
        tax = recycling_contribution_values['tax']
        if 'bebat' in tax.name.lower():
            charge_reason_code = 'CAV'
        else:
            charge_reason_code = 'AEO'
        is_charge = recycling_contribution_values['is_charge']
        return {
            'ram:ChargeIndicator': {
                'udt:Indicator': {'_text': 'true' if is_charge else 'false'},
            },
            'ram:ReasonCode': {'_text': charge_reason_code if is_charge else '100'},
            'ram:Reason': {'_text': tax.name},
            'ram:ActualAmount': {
                '_text': FloatFmt(amount, max_dp=currency.decimal_places),
            },
        }

    def _cii_add_line_allowance_charge_nodes_for_excise_taxes(self, vals):
        base_line = vals['base_line']
        currency = base_line['currency_id']

        allowance_charges_nodes = vals['allowance_charge_node']
        for tax_data in base_line['tax_details']['taxes_data']:
            if not self._is_excise_tax(tax_data):
                continue

            allowance_charges_nodes.append(self._cii_get_line_allowance_charge_excise_node(vals, {
                'tax': tax_data['tax'],
                'is_charge': tax_data['tax_amount'] > 0.0,
                'amount': tax_data['tax_amount_currency'],
                'currency': currency,
            }))

    def _cii_get_line_allowance_charge_excise_node(self, vals, excise_values):
        currency = excise_values['currency']
        amount = excise_values['amount']
        tax = excise_values['tax']
        is_charge = excise_values['is_charge']
        return {
            'ram:ChargeIndicator': {
                'udt:Indicator': {'_text': 'true' if is_charge else 'false'},
            },
            'ram:Reason': {'_text': tax.name},
            'ram:ActualAmount': {
                '_text': FloatFmt(abs(amount), max_dp=currency.decimal_places),
            },
        }

    def _cii_get_specified_trade_settlement_line_monetary_summation_node(self, vals, base_line):
        currency = vals['currency']
        tax_details = base_line['tax_details']

        total_excluded = currency.round(tax_details['raw_total_excluded_currency'])
        for allowance_charge_node in vals['line_trade_allowance_charge_nodes']:
            sign = 1 if allowance_charge_node['ram:ChargeIndicator']['udt:Indicator']['_text'] == 'true' else -1
            total_excluded += sign * allowance_charge_node['ram:ActualAmount']['_text']
        return {
            'ram:LineTotalAmount': {'_text': FloatFmt(total_excluded, max_dp=2)},
        }

    def _cii_get_applicable_header_trade_agreement_node(self, vals):
        invoice = vals['invoice']
        return {
            'ram:BuyerReference': {'_text': invoice.buyer_reference
                if 'buyer_reference' in invoice._fields and invoice.buyer_reference
                else invoice.commercial_partner_id.ref,
            },
            'ram:SellerTradeParty': self._cii_get_seller_trade_party_node(vals),
            'ram:BuyerTradeParty': self._cii_get_buyer_trade_party_node(vals),
            'ram:BuyerOrderReferencedDocument': {
                'ram:IssuerAssignedID': {'_text': invoice.purchase_order_reference
                    if 'purchase_order_reference' in invoice._fields and invoice.purchase_order_reference
                    else invoice.ref or invoice.name
                },
            },
            'ram:ContractReferencedDocument': {
                'ram:IssuerAssignedID': {'_text': invoice.contract_reference
                    if 'contract_reference' in invoice._fields and invoice.contract_reference
                    else ''
                },
            },
        }

    def _cii_is_vat_void(self, vat):
        """Whether `vat` is one of Odoo's conventional values meaning "not subject to VAT"
        (as opposed to a real, missing, or invalid VAT number)."""
        return is_identifier_void(vat)

    def _cii_get_seller_trade_party_node(self, vals):
        invoice = vals['invoice']
        supplier = vals['supplier']
        commercial_partner = supplier.commercial_partner_id
        scheme_id = None
        legal_organization_val = False
        if siret := commercial_partner._get_additional_identifier('FR_SIRET'):
            scheme_id = "0002"
            legal_organization_val = siret[:9]
        supplier_vat = invoice.fiscal_position_id.foreign_vat or commercial_partner.vat
        seller_tax_registrations = []
        if not self._cii_is_vat_void(supplier_vat) and self._should_export_party_tax_scheme(vals):
            seller_tax_registrations.append({'scheme': 'VA', 'value': supplier_vat})
        if (stnr := invoice.company_id._get_l10n_de_stnr()):
            seller_tax_registrations.append({'scheme': 'FC', 'value': stnr})
        return self._cii_get_partner_trade_party_node(vals, {
            'gln': supplier.global_location_number or (supplier.routing_endpoint if supplier.routing_scheme == '0088' else None),
            'name': supplier.name,
            'partner_specified_legal_organization': legal_organization_val,
            'partner_specified_legal_organization_scheme': scheme_id,
            'contact_values': {
                'name': supplier.name,
                'phone': supplier.phone,
                'email': supplier.email,
            },
            'address_values': {
                'postcode': supplier.zip,
                'line_one': supplier.street,
                'line_two': supplier.street2,
                'city': supplier.city,
                'country_code': supplier.country_id.code,
            },
            'routing_scheme': supplier.routing_scheme,
            'routing_endpoint': supplier.routing_endpoint,
            'partner_tax_registrations': seller_tax_registrations,
        })

    def _cii_get_partner_trade_party_node(self, vals, partner_values):
        return {
            'ram:GlobalID': {
                'schemeID': '0088',
                '_text': partner_values['gln'],
            } if partner_values['gln'] else None,
            'ram:Name': {'_text': partner_values['name']},
            'ram:SpecifiedLegalOrganization': {
                'ram:ID': {
                    '_text': partner_values['partner_specified_legal_organization'],
                    'schemeID': partner_values['partner_specified_legal_organization_scheme'],
                },
            } if partner_values['partner_specified_legal_organization'] else None,
            'ram:DefinedTradeContact': self._cii_get_defined_trade_contact_node(vals, partner_values['contact_values']),
            'ram:PostalTradeAddress': self._cii_get_postal_trade_address_node(vals, partner_values['address_values']),
            'ram:URIUniversalCommunication': {
                'ram:URIID': {
                    'schemeID': partner_values['routing_scheme'],
                    '_text': partner_values['routing_endpoint'],
                },
            } if partner_values['routing_scheme'] and partner_values['routing_endpoint'] else None,
            'ram:SpecifiedTaxRegistration': [
                {
                    'ram:ID': {
                        '_text': tax_registration['value'],
                        'schemeID': tax_registration['scheme'],
                    },
                } for tax_registration in partner_values['partner_tax_registrations']
            ],
        }

    def _cii_get_defined_trade_contact_node(self, vals, contact_values):
        return {
            'ram:PersonName': {'_text': contact_values['name']},
            'ram:TelephoneUniversalCommunication': {
                'ram:CompleteNumber': {'_text': contact_values['phone']},
            } if contact_values['phone'] else None,
            'ram:EmailURIUniversalCommunication': {
                'ram:URIID': {'_text': contact_values['email']},
            } if contact_values['email'] else None,
        }

    def _cii_get_postal_trade_address_node(self, vals, address_values):
        return {
            'ram:PostcodeCode': {'_text': self._edi_truncate(address_values['postcode'], 'BT-38')},
            'ram:LineOne': {'_text': self._edi_truncate(address_values['line_one'], 'BT-35')},
            'ram:LineTwo': {
                '_text': self._edi_truncate(address_values['line_two'], 'BT-36'),
            } if address_values['line_two'] else None,
            'ram:CityName': {'_text': self._edi_truncate(address_values['city'], 'BT-37')},
            'ram:CountryID': {'_text': address_values['country_code']},
        }

    def _cii_get_buyer_trade_party_node(self, vals):
        customer = vals['customer']
        commercial_partner = customer.commercial_partner_id
        name = customer.display_name if customer.name else commercial_partner.display_name
        scheme_id = None
        legal_organization_val = False
        if siret := commercial_partner._get_additional_identifier('FR_SIRET'):
            scheme_id = "0002"
            legal_organization_val = siret[:9]
        buyer_tax_registrations = []
        if not self._cii_is_vat_void(customer.vat) and self._should_export_party_tax_scheme(vals):
            buyer_tax_registrations.append({'scheme': 'VA', 'value': customer.vat})
        return self._cii_get_partner_trade_party_node(vals, {
            'gln': customer.global_location_number or (customer.routing_endpoint if customer.routing_scheme == '0088' else None),
            'name': name,
            'partner_specified_legal_organization': legal_organization_val,
            'partner_specified_legal_organization_scheme': scheme_id,
            'contact_values': {
                'name': name,
                'phone': customer.phone,
                'email': customer.email,
            },
            'address_values': {
                'postcode': customer.zip,
                'line_one': customer.street,
                'line_two': customer.street2,
                'city': customer.city,
                'country_code': customer.country_id.code,
            },
            'routing_scheme': customer.routing_scheme,
            'routing_endpoint': customer.routing_endpoint,
            'partner_tax_registrations': buyer_tax_registrations,
        })

    def _cii_get_applicable_header_trade_delivery_node(self, vals):
        return {
            'ram:ShipToTradeParty': self._cii_get_ship_to_trade_party_node(vals),
            'ram:ActualDeliverySupplyChainEvent': {
                'ram:OccurrenceDateTime': self._cii_get_date_time_string_node(vals, vals['delivery_date'])
            } if vals['delivery_date'] else None,
        }

    def _cii_get_ship_to_trade_party_node(self, vals):
        partner_shipping = vals['delivery']
        return self._cii_get_partner_trade_party_node(vals, {
            'gln': partner_shipping.global_location_number or None,
            'name': partner_shipping.name,
            'partner_specified_legal_organization': False,
            'partner_specified_legal_organization_scheme': None,
            'contact_values': {
                'name': partner_shipping.name,
                'phone': partner_shipping.phone,
                'email': partner_shipping.email,
            },
            'address_values': {
                'postcode': partner_shipping.zip,
                'line_one': partner_shipping.street,
                'line_two': partner_shipping.street2,
                'city': partner_shipping.city,
                'country_code': partner_shipping.country_id.code,
            },
            'routing_scheme': False,
            'routing_endpoint': False,
            'partner_tax_registrations': [],
        })

    def _cii_get_applicable_header_trade_settlement_node(self, vals):
        invoice = vals['invoice']
        has_sepa_mandate = (
            self.module_installed('account_sepa_direct_debit')
            and invoice.reconciled_payment_ids.mandate_id.filtered(lambda m: m.mandate_type == 'sepa')
        )
        return {
            'ram:PaymentReference': {'_text': invoice.payment_reference},
            'ram:InvoiceCurrencyCode': {'_text': vals['currency'].name},
            'ram:SpecifiedTradeSettlementPaymentMeans': {
                'ram:TypeCode': {'_text': PAYMENT_MEAN_CODES['SEPA direct debit']
                    if has_sepa_mandate
                    else PAYMENT_MEAN_CODES['Payment to bank account'],
                },
                'ram:PayeePartyCreditorFinancialAccount': self._cii_get_payee_party_creditor_financial_account_node(vals),
            },
            'ram:ApplicableTradeTax': self._cii_get_applicable_trade_tax_nodes(vals),
            'ram:BillingSpecifiedPeriod': self._cii_get_billing_specified_period_node(vals),
            'ram:SpecifiedTradePaymentTerms': self._cii_get_specified_trade_payment_terms_node(vals),
            'ram:SpecifiedTradeSettlementHeaderMonetarySummation': self._cii_get_specified_trade_settlement_header_monetary_summary_node(vals),
        }

    def _cii_get_payee_party_creditor_financial_account_node(self, vals):
        invoice = vals['invoice']
        if invoice.partner_bank_id.account_type == 'iban':
            return {
                'ram:IBANID': {'_text': invoice.partner_bank_id.sanitized_account_number}
            }
        else:
            return {
                'ram:ProprietaryID': {'_text': invoice.partner_bank_id.sanitized_account_number}
            }

    def _cii_get_applicable_trade_tax_nodes(self, vals):
        tax_nodes = []
        currency = vals['currency']
        base_lines_aggregated_tax_details = self.env['account.tax']._aggregate_base_lines_tax_details(
            base_lines=vals['base_lines'],
            grouping_function=lambda base_line, tax_data: self._get_line_tax_category_grouping_key(
                base_line=base_line,
                tax_data=tax_data,
                vals=vals,
                currency=currency,
            )
        )
        aggregated_tax_details = self.env['account.tax']._aggregate_base_lines_aggregated_values(base_lines_aggregated_tax_details)
        # [BR-S-08]/[BR-E-08]/... The VAT category taxable amount (BT-116) is the sum of the line net amounts (BT-131)
        # of the category, i.e. of the rounded line amounts.
        line_amounts_per_category = {}
        for line_node in vals.get('line_item_nodes', []):
            line_settlement = line_node['ram:SpecifiedLineTradeSettlement']
            line_total = line_settlement['ram:SpecifiedTradeSettlementLineMonetarySummation']['ram:LineTotalAmount']['_text']
            for line_tax_node in line_settlement['ram:ApplicableTradeTax']:
                category = (line_tax_node['ram:CategoryCode']['_text'], line_tax_node['ram:RateApplicablePercent']['_text'])
                line_amounts_per_category[category] = line_amounts_per_category.get(category, 0.0) + line_total

        vals['tax_details'] = {}
        for grouping_key, values in aggregated_tax_details.items():
            if not grouping_key:
                continue
            vals['tax_details'][grouping_key] = values
            amount_currency = values['tax_amount_currency']
            basis_amount = line_amounts_per_category.get(
                (grouping_key['tax_category_code'], grouping_key['percent']),
                values['base_amount_currency'],
            )
            tax_nodes.append(self._cii_get_applicable_trade_tax_node(vals, {
                'calculated_amount': amount_currency if not currency.is_zero(amount_currency) else 0.0,
                'tax_exemption_reason': grouping_key['tax_exemption_reason'],
                'basis_amount': basis_amount,
                'tax_category_code': grouping_key['tax_category_code'],
                'tax_exemption_reason_code': grouping_key['tax_exemption_reason_code'],
                'rate_applicable_percent': grouping_key['percent'],
            }))
        return tax_nodes

    def _cii_get_applicable_trade_tax_node(self, vals, trade_tax_values):
        return {
            'ram:CalculatedAmount': {
                '_text': FloatFmt(trade_tax_values['calculated_amount'], max_dp=2),
            },
            'ram:TypeCode': {'_text': "VAT"},
            'ram:ExemptionReason': {'_text': trade_tax_values['tax_exemption_reason']},
            'ram:BasisAmount': {'_text': FloatFmt(trade_tax_values['basis_amount'], max_dp=2)},
            'ram:CategoryCode': {'_text': trade_tax_values['tax_category_code']},
            'ram:ExemptionReasonCode': {'_text': trade_tax_values['tax_exemption_reason_code']},
            'ram:DueDateTypeCode': {'_text': 5},
            'ram:RateApplicablePercent': {'_text': trade_tax_values['rate_applicable_percent']},
        }

    def _cii_get_billing_specified_period_node(self, vals):
        start_date = vals['billing_start_date']
        end_date = vals['billing_end_date']
        return {
            'ram:StartDateTime': self._cii_get_date_time_string_node(vals, start_date) if start_date else None,
            'ram:EndDateTime': self._cii_get_date_time_string_node(vals, end_date) if end_date else None,
        }

    def _cii_get_specified_trade_payment_terms_node(self, vals):
        invoice = vals['invoice']
        return {
            'ram:Description': {
                '_text': invoice.invoice_payment_term_id.name,
            } if invoice.invoice_payment_term_id else None,
            'ram:DueDateDateTime': self._cii_get_date_time_string_node(vals, invoice.invoice_date_due) if invoice.invoice_date_due else None,
            'ram:ApplicableTradePaymentDiscountTerms': {
                'ram:BasisPeriodMeasure': {
                    '_text': invoice.invoice_payment_term_id.discount_days,
                    'unitCode': 'DAY',
                },
                'ram:CalculationPercent': {
                    '_text': invoice.invoice_payment_term_id.discount_percentage,
                }
            } if invoice.invoice_payment_term_id.early_discount else None,
        }

    def _cii_get_specified_trade_settlement_header_monetary_summary_node(self, vals):
        node = {}
        sub_vals = {
            **vals,
            'monetary_summation_node': node,
        }
        self._cii_add_monetary_summation_line_total_amount_node(sub_vals)
        self._cii_add_monetary_summation_tax_basis_total_amount_node(sub_vals)
        self._cii_add_monetary_summation_tax_total_amount_node(sub_vals)
        self._cii_add_monetary_summation_rounding_amount_node(sub_vals)
        self._cii_add_monetary_summation_grand_total_amount_node(sub_vals)
        self._cii_add_monetary_summation_total_prepaid_amount(sub_vals)
        self._cii_add_monetary_summation_due_payable_amount_node(sub_vals)
        return node

    def _cii_add_monetary_summation_line_total_amount_node(self, vals):
        # [BR-CO-10] Sum of Invoice line net amount (BT-106) = Σ Invoice line net amount (BT-131).
        currency = vals['currency']
        tax_base_amount = sum(tax_data['base_amount_currency'] for tax_data in vals['tax_details'].values())
        if 'line_item_nodes' in vals:
            line_total_amount = currency.round(sum(
                line_node['ram:SpecifiedLineTradeSettlement']['ram:SpecifiedTradeSettlementLineMonetarySummation']['ram:LineTotalAmount']['_text']
                for line_node in vals['line_item_nodes']
            ))
        else:
            line_total_amount = tax_base_amount
        # The difference between the rounded lines and the (globally rounded) tax base is reported as rounding amount.
        vals['line_rounding_amount'] = currency.round(tax_base_amount - line_total_amount)
        vals['monetary_summation_node']['ram:LineTotalAmount'] = {
            '_text': FloatFmt(line_total_amount, max_dp=2),
        }

    def _cii_add_monetary_summation_tax_basis_total_amount_node(self, vals):
        vals['monetary_summation_node']['ram:TaxBasisTotalAmount'] = {
            '_text': vals['monetary_summation_node']['ram:LineTotalAmount']['_text'],
        }

    def _cii_add_monetary_summation_tax_total_amount_node(self, vals):
        currency = vals['currency']
        vals['monetary_summation_node']['ram:TaxTotalAmount'] = {
            'currencyID': currency.name,
            '_text': FloatFmt(sum(
                tax_data['tax_amount_currency']
                for _grouping_key, tax_data in vals['tax_details'].items()
            ), max_dp=2),
        }

    def _cii_add_monetary_summation_rounding_amount_node(self, vals):
        cash_rounding_amount = sum(
                base_line['tax_details']['total_excluded_currency']
                for base_line in vals.setdefault('cash_rounding_base_lines', [])
            ) + vals.get('line_rounding_amount', 0.0)
        if not vals['currency'].is_zero(cash_rounding_amount):
            vals['monetary_summation_node']['ram:RoundingAmount'] = {
                '_text': FloatFmt(cash_rounding_amount, max_dp=2),
            }

    def _cii_add_monetary_summation_grand_total_amount_node(self, vals):
        # [BR-CO-15] BT-112 (Grand total) = BT-109 (Tax basis total) + BT-110 (Tax total).
        vals['monetary_summation_node']['ram:GrandTotalAmount'] = {
            '_text': FloatFmt(sum(vals['monetary_summation_node'].get(node, {}).get('_text', 0.0)
            for node in ['ram:LineTotalAmount', 'ram:TaxTotalAmount']), max_dp=2),
        }

    def _cii_add_monetary_summation_total_prepaid_amount(self, vals):
        # [BR-CO-16] is equivalent to: BT-113 (Prepaid) = BT-112 (Grand total) + BT-114 (Rounding) - BT-115 (Amount due).
        node = vals['monetary_summation_node']
        prepaid_amount = (
            node['ram:GrandTotalAmount']['_text']
            + node.get('ram:RoundingAmount', {}).get('_text', 0.0)
            - vals['invoice'].amount_residual
        )
        node['ram:TotalPrepaidAmount'] = {
            '_text': FloatFmt(prepaid_amount, max_dp=2),
        }

    def _cii_add_monetary_summation_due_payable_amount_node(self, vals):
        # [BR-CO-16] BT-115 (Amount due) = BT-112 (Grand total) - BT-113 (Prepaid) + BT-114 (Rounding).
        node = vals['monetary_summation_node']
        vals['monetary_summation_node']['ram:DuePayableAmount'] = {
            '_text': FloatFmt(node['ram:GrandTotalAmount']['_text']
                              - node['ram:TotalPrepaidAmount']['_text']
                              + node.get('ram:RoundingAmount', {}).get('_text', 0.0), max_dp=2),
        }

    def _cii_constraints(self, invoice, vals):
        constraints = {}
        self._cii_check_seller(invoice, vals, constraints)
        self._cii_check_buyer(vals, constraints)

        if vals['customer']['country_id']['code'] == 'ES' \
            and vals['customer']['zip'] \
            and vals['customer']['zip'][:2] in ['35', '38']:
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
                    vals['invoice']['partner_bank_id'], 'sanitized_account_number',
                    self.env._("The field 'Sanitized Account Number' is required on the Recipient Bank.")
                ),
            })

    def _cii_check_seller_postal_address(self, vals, constraints):
        """
        [BR-08]-An Invoice shall contain the Seller postal address (BG-5).
        [BR-09]-The Seller postal address (BG-5) shall contain a Seller country code (BT-40).
        """
        constraints['seller_postal_address'] = self._check_required_fields(
                vals['supplier'].commercial_partner_id, 'country_id'
            )

    def _cii_check_seller_identifier(self, vals, constraints):
        """
        [BR-CO-26]-In order for the buyer to automatically identify a supplier, the Seller identifier (BT-29),
        the Seller legal registration identifier (BT-30) and/or the Seller VAT identifier (BT-31) shall be present.
        """
        constraints['seller_identifier'] = self._check_required_fields(
                vals['supplier'], ['vat']
            )

    def _cii_check_seller_contact(self, vals, constraints):
        """
        [BR-DE-6] The element "Seller contact telephone number" (BT-42) must be transmitted.
        [BR-DE-7] The element "Seller contact email address" (BT-43) must be transmitted.
        """
        constraints.update({
            'seller_phone': self._check_required_fields(
                vals['supplier'].commercial_partner_id, 'phone',
            ),
            'seller_email': self._check_required_fields(
                vals['supplier'], 'email'
            ),
        })

    def _cii_check_buyer_postal_address(self, vals, constraints):
        """
        [BR-10]-An Invoice shall contain the Buyer postal address (BG-8).
        [BR-11]-The Buyer postal address shall contain a Buyer country code (BT-55).
        """
        constraints['buyer_postal_address'] = self._check_required_fields(
                vals['customer'].commercial_partner_id, 'country_id'
            )

    def _cii_check_igi_tax_rate(self, invoice, vals, constraints):
        for line in invoice.invoice_line_ids.filtered(lambda x: x.display_type not in ('line_note', 'line_section')):
            tax_rate_list = line.tax_ids.flatten_taxes_hierarchy().mapped("amount")
            if not any(rate > 0 for rate in tax_rate_list):
                constraints['igic_tax_rate'] = self.env._("When the Canary Island General Indirect Tax (IGIC) applies, the tax rate on "
                         "each invoice line should be greater than 0.")

    # -------------------------------------------------------------------------
    # NEW IMPORT : helpers
    # -------------------------------------------------------------------------

    def _import_cii_init_collected_values(self, invoice, collected_values):
        return self._import_init_collected_values(invoice, collected_values)

    def _import_cii_invoice_document_sign(self, collected_values):
        self._import_invoice_document_sign(collected_values)

    def _import_cii_invoice_update_move_type(self, collected_values):
        self._import_invoice_update_move_type(collected_values)

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
        notes = []
        for node in tree.findall('./{*}ExchangedDocument/{*}IncludedNote'):
            note = ""
            if code := node.findtext('./{*}SubjectCode'):
                note += code + ": "
            if content := node.findtext('./{*}Content'):
                note += content
            if note:
                notes.append(note)

        if narration := ''.join(f'<p>{note}</p>' for note in notes):
            collected_values['to_write']['narration'] = narration

    def _import_cii_invoice_add_payment_reference(self, collected_values):
        tree = collected_values['tree']
        if payment_reference := tree.findtext('.//{*}ApplicableHeaderTradeSettlement/{*}PaymentReference'):
            collected_values['to_write']['payment_reference'] = payment_reference

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
            ('vat', './{*}SpecifiedTaxRegistration/{*}ID[@schemeID="VA"]'),
        ):
            customer_values[key] = None
            if (node := party_node.find(xpath)) is not None:
                customer_values[key] = node.text

        # Peppol EAS/Endpoint.
        if (node := party_node.find(".//{*}URIUniversalCommunication/{*}URIID")) is not None:
            customer_values['routing_endpoint'] = node.text
            if routing_scheme := node.attrib.get('schemeID'):
                customer_values['routing_scheme'] = routing_scheme

        # fallback to an unqualified tax registration only when no VA entry was found
        if not customer_values['vat']:
            nodes = [
                node for node in party_node.findall('./{*}SpecifiedTaxRegistration/{*}ID')
                if not node.attrib
            ]
            if len(nodes) > 0:
                customer_values['vat'] = nodes[0].text

    def _import_cii_retrieve_customer(self, collected_values):
        self._import_retrieve_customer(collected_values)

    def _import_cii_create_missing_customer(self, collected_values):
        self._import_create_missing_customer(collected_values)

    def _import_cii_invoice_add_currency_code(self, collected_values):
        currency_values = collected_values['currency_values'] = {}
        tree = collected_values['tree']
        currency_values['currency_code'] = tree.findtext('.//{*}InvoiceCurrencyCode')

    def _import_cii_invoice_add_currency(self, collected_values):
        self._import_invoice_add_currency(collected_values)

    def _import_cii_invoice_add_partner_bank_values(self, collected_values):
        partner_bank_values = collected_values['partner_bank_values'] = {}
        tree = collected_values['tree']
        financial_nodes = tree.findall(".//{*}SpecifiedTradeSettlementPaymentMeans/{*}PayeePartyCreditorFinancialAccount")
        partner_bank_values['account_numbers'] = account_numbers = set()
        for node in financial_nodes:
            account_number = node.findtext('./{*}IBANID') or node.findtext('./{*}ProprietaryID')
            if account_number:
                account_numbers.add(account_number)

    def _import_cii_retrieve_partner_bank(self, collected_values):
        self._import_retrieve_partner_bank(collected_values)

    def _import_cii_invoice_add_prepaid_amount(self, collected_values):
        prepaid_amount_str = collected_values['tree'].findtext('.//{*}SpecifiedTradeSettlementHeaderMonetarySummation/{*}TotalPrepaidAmount')
        self._import_invoice_add_prepaid_amount(collected_values, prepaid_amount_str)

    def _import_cii_invoice_add_tax_total_values(self, collected_values):
        collected_values['tax_total_values'] = {}
        tree = collected_values['tree']
        for subtotal_elem in tree.findall('.//{*}ApplicableHeaderTradeSettlement/{*}ApplicableTradeTax'):
            amount = subtotal_elem.findtext('./{*}CalculatedAmount')
            category_code = subtotal_elem.findtext('./{*}CategoryCode')
            if amount is None or category_code is None:
                continue

            percentage = subtotal_elem.findtext('./{*}RateApplicablePercent')
            if percentage is None:
                continue

            self._import_invoice_add_tax_total_value(collected_values, category_code, float(percentage), amount)

    def _import_cii_invoice_add_allowances_charges_values(self, collected_values):
        tree = collected_values['tree']
        collected_values['allowances'] = []
        collected_values['charges'] = []

        for element in tree.iterfind('./{*}SupplyChainTradeTransaction/{*}ApplicableHeaderTradeSettlement/{*}SpecifiedTradeAllowanceCharge'):
            percentage_str = element.findtext('./{*}CategoryTradeTax/{*}RateApplicablePercent')
            if not percentage_str:
                continue

            tax_category_tree = element.find('./{*}CategoryTradeTax')
            self._import_invoice_add_document_allowance_charge_values(
                collected_values,
                charge_indicator=element.findtext('./{*}ChargeIndicator/{*}Indicator'),
                amount_str=element.findtext('./{*}ActualAmount'),
                base_amount_str=element.findtext('./{*}BasisAmount'),
                multiplier_factor_numeric_str=element.findtext('./{*}CalculationPercent'),
                reason=element.findtext('./{*}Reason'),
                reason_code=element.findtext('./{*}ReasonCode'),
                percentage=float(percentage_str),
                tax_values=self._import_cii_invoice_line_prepare_classified_tax_category_tax_values(collected_values, tax_category_tree),
            )

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
        collected_values['allowances'] = []
        collected_values['charges'] = []
        for allowance_charge_elem in line_tree.iterfind('.//{*}SpecifiedTradeAllowanceCharge'):
            self._import_invoice_line_add_allowance_charge_values(
                collected_values,
                charge_indicator=allowance_charge_elem.findtext('.//{*}ChargeIndicator/{*}Indicator'),
                amount_str=allowance_charge_elem.findtext('.//{*}ActualAmount'),
                base_amount_str=allowance_charge_elem.findtext('.//{*}BasisAmount'),
                reason=allowance_charge_elem.findtext('.//{*}Reason'),
                reason_code=allowance_charge_elem.findtext('.//{*}ReasonCode'),
            )

        allowance_elem = line_tree.find('.//{*}GrossPriceProductTradePrice/{*}AppliedTradeAllowanceCharge')
        collected_values['price_allowance_values'] = {}
        if allowance_elem is not None:
            self._import_invoice_line_add_price_allowance_values(
                collected_values,
                charge_indicator=allowance_elem.findtext('./{*}ChargeIndicator/{*}Indicator'),
                amount_str=allowance_elem.findtext('./{*}ActualAmount'),
                base_amount_str=allowance_elem.findtext('./{*}BasisAmount'),
                reason=allowance_elem.findtext('./{*}AllowanceChargeReason'),
                reason_code=allowance_elem.findtext('./{*}AllowanceChargeReasonCode'),
            )

    def _import_cii_invoice_line_add_name(self, collected_values):
        line_tree = collected_values['line_tree']
        name = collected_values['name'] = (
            line_tree.findtext('.//{*}SpecifiedTradeProduct/{*}Description')
            or line_tree.findtext('.//{*}SpecifiedTradeProduct/{*}Name')
        )
        if name:
            collected_values['to_write']['name'] = name

    def _import_cii_invoice_line_add_price_unit_quantity_discount(self, collected_values):
        file_document_sign = collected_values['file_document_sign']
        line_tree = collected_values['line_tree']
        currency = collected_values['currency_values']['currency']

        line_total_amount_str = line_tree.findtext('.//{*}SpecifiedTradeSettlementLineMonetarySummation/{*}LineTotalAmount')
        price_amount_str = line_tree.findtext('.//{*}NetPriceProductTradePrice/{*}ChargeAmount')
        billed_quantity_str = line_tree.findtext('.//{*}BilledQuantity')
        base_quantity_str = (
            line_tree.findtext('.//{*}GrossPriceProductTradePrice/{*}BasisQuantity')
            or line_tree.findtext(".//{*}NetPriceProductTradePrice/{*}BasisQuantity")
        )

        line_total_amount = line_total_amount_str and float(line_total_amount_str) * file_document_sign
        price_amount = price_amount_str and float(price_amount_str)
        billed_quantity = billed_quantity_str and float(billed_quantity_str) * file_document_sign
        base_quantity = base_quantity_str and float(base_quantity_str)

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
            line_total_amount is not None
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
                if quantity:
                    price_unit = (subtotal / quantity) + (price_discount_amount / price_quantity)
                else:
                    price_unit = price_amount
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
                line_price_discount_amount = price_discount_amount * quantity / price_quantity

                line_total_discount_amount = (price_unit * quantity) - subtotal
                rounding_tolerance = max(currency.rounding, 0.01) * abs(quantity) / price_quantity
                if price_discount_amount and currency.compare_amounts(abs(line_total_discount_amount - line_price_discount_amount), rounding_tolerance) <= 0:
                    line_price_discount_amount = line_total_discount_amount
                discount_amount += line_price_discount_amount
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
            if "deferred_start_date" in self.env["account.move.line"]._fields:
                # only checking the existence of the first of the enterprise fields
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

        tax_values = self._import_invoice_line_get_tax_values_from_tax_total(collected_values, category_code, float(percentage))
        if not tax_values:
            return

        partner = collected_values.get('customer_values', {}).get('customer')
        if partner and (name := collected_values['to_write'].get('name')):
            tax_values['invoice_predictive'] = {
                'invoice': collected_values['invoice'],
                'name': name,
                'partner': partner,
            }
        return tax_values

    def _import_cii_invoice_line_prepare_charge_tax_values(self, collected_values, charge):
        if charge['reason_code'] != 'AEO':
            return

        tax_values = self._import_invoice_line_get_fixed_tax_values(collected_values, charge)
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
        collected_values['taxes_values'] = []

        # Percentage taxes.
        for tax_category_tree in line_tree.findall('./{*}SpecifiedLineTradeSettlement/{*}ApplicableTradeTax'):
            if tax_values := self._import_cii_invoice_line_prepare_classified_tax_category_tax_values(collected_values, tax_category_tree):
                self._import_invoice_line_add_percentage_tax_values(collected_values, tax_values)

        # Fixed taxes.
        for charge in collected_values['charges']:
            if tax_values := self._import_cii_invoice_line_prepare_charge_tax_values(collected_values, charge):
                collected_values['taxes_values'].append(tax_values)

    def _import_cii_invoice_predict_values(self, collected_values):
        self._import_invoice_predict_values(collected_values)

    def _import_cii_invoice_retrieve_products(self, collected_values):
        self._import_invoice_retrieve_products(collected_values)

    def _import_cii_invoice_retrieve_product_uoms(self, collected_values):
        self._import_invoice_retrieve_product_uoms(collected_values)

    def _import_cii_invoice_retrieve_accounts(self, collected_values):
        self._import_invoice_retrieve_accounts(collected_values)

    def _import_cii_invoice_retrieve_analytic_distribution(self, collected_values):
        self._import_invoice_retrieve_analytic_distribution(collected_values)

    def _import_cii_invoice_retrieve_taxes(self, collected_values):
        self._import_invoice_retrieve_taxes(collected_values)

    def _import_cii_invoice_add_base_lines(self, collected_values):
        self._import_invoice_add_base_lines(collected_values)

    def _import_cii_invoice_write_collected_values(self, collected_values):
        self._import_invoice_write_collected_values(collected_values)

    def _import_cii_invoice_fix_taxes_amounts(self, collected_values):
        self._import_invoice_fix_taxes_amounts(collected_values)

    def _import_cii_invoice_fix_untaxed_amount(self, collected_values):
        tree = collected_values['tree']
        self._import_invoice_fix_untaxed_amount(
            collected_values,
            tax_exclusive_amount_str=tree.findtext('.//{*}SpecifiedTradeSettlementHeaderMonetarySummation/{*}TaxBasisTotalAmount'),
            payable_rounding_amount_str=tree.findtext('.//{*}SpecifiedTradeSettlementHeaderMonetarySummation/{*}RoundingAmount'),
        )

    def _import_cii_invoice_post_processing(self, collected_values):
        self._import_invoice_post_processing(collected_values)

    def _cii_import_invoice(self, invoice, file_data, new=False):

        collected_values = self._import_cii_init_collected_values(invoice, file_data)

        self._import_cii_invoice_document_sign(collected_values)
        self._import_cii_invoice_update_move_type(collected_values)

        self._import_cii_invoice_add_partner_bank_values(collected_values)

        # invoice ref / invoice_origin / date / date_due / delivery_date / narration / payment_reference
        self._import_cii_invoice_add_ref(collected_values)
        self._import_cii_invoice_add_invoice_origin(collected_values)
        self._import_cii_invoice_add_issue_date(collected_values)
        self._import_cii_invoice_add_date_due(collected_values)
        self._import_cii_invoice_add_invoice_delivery_date(collected_values)
        self._import_cii_invoice_add_narration(collected_values)
        self._import_cii_invoice_add_payment_reference(collected_values)

        # customer
        self._import_cii_invoice_add_customer_values(collected_values)
        self._import_cii_retrieve_customer(collected_values)
        self._import_cii_create_missing_customer(collected_values)

        # currency
        self._import_cii_invoice_add_currency_code(collected_values)
        self._import_cii_invoice_add_currency(collected_values)

        # bank account
        self._import_cii_retrieve_partner_bank(collected_values)

        # Prepaid / rounding amounts / Tax total values.
        self._import_cii_invoice_add_prepaid_amount(collected_values)
        self._import_cii_invoice_add_tax_total_values(collected_values)

        # allowance / charge of the document
        self._import_cii_invoice_add_allowances_charges_values(collected_values)

        # Invoice lines values.
        self._import_cii_invoice_add_invoice_line_values(collected_values)
        self._import_cii_invoice_predict_values(collected_values)
        self._import_cii_invoice_retrieve_products(collected_values)
        self._import_cii_invoice_retrieve_product_uoms(collected_values)
        self._import_cii_invoice_retrieve_accounts(collected_values)
        self._import_cii_invoice_retrieve_analytic_distribution(collected_values)
        self._import_cii_invoice_retrieve_taxes(collected_values)
        self._import_cii_invoice_add_base_lines(collected_values)

        # End the invoice.
        self._import_cii_invoice_write_collected_values(collected_values)
        self._import_cii_invoice_fix_taxes_amounts(collected_values)
        self._import_cii_invoice_fix_untaxed_amount(collected_values)
        self._import_cii_invoice_post_processing(collected_values)
        return
