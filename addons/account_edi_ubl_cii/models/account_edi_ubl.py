from odoo import models, _

from stdnum.no import mva


UOM_TO_UNECE_CODE = {
    'uom.product_uom_unit': 'C62',
    'uom.product_uom_dozen': 'DZN',
    'uom.product_uom_pack_6': 'HD',
    'uom.product_uom_kgm': 'KGM',
    'uom.product_uom_gram': 'GRM',
    'uom.product_uom_day': 'DAY',
    'uom.product_uom_hour': 'HUR',
    'uom.product_uom_ton': 'TNE',
    'uom.product_uom_meter': 'MTR',
    'uom.product_uom_km': 'KMT',
    'uom.product_uom_cm': 'CMT',
    'uom.product_uom_litre': 'LTR',
    'uom.product_uom_cubic_meter': 'MTQ',
    'uom.product_uom_lb': 'LBR',
    'uom.product_uom_oz': 'ONZ',
    'uom.product_uom_inch': 'INH',
    'uom.product_uom_foot': 'FOT',
    'uom.product_uom_mile': 'SMI',
    'uom.product_uom_floz': 'OZA',
    'uom.product_uom_qt': 'QT',
    'uom.product_uom_gal': 'GLL',
    'uom.product_uom_cubic_inch': 'INQ',
    'uom.product_uom_cubic_foot': 'FTQ',
    'uom.product_uom_square_meter': 'MTK',
    'uom.product_uom_square_foot': 'FTK',
    'uom.product_uom_yard': 'YRD',
    'uom.product_uom_millimeter': 'MMT',
}


class AccountEdiUbl(models.AbstractModel):
    _name = 'account.edi.ubl'
    _inherit = ['account.edi.common2']
    _description = "UBL HELPERS"

    # -------------------------------------------------------------------------
    # EXPORT COMMON: VALUES
    # -------------------------------------------------------------------------

    def _add_common_uom_values(self, collected_values, uom):
        # EXTENDS 'account.edi.common'
        super()._add_common_uom_values(collected_values, uom)

        # The list of UNECE codes: https://docs.peppol.eu/poacc/billing/3.0/codelist/UNECERec20/
        # or https://unece.org/fileadmin/DAM/cefact/recommendations/bkup_htm/add2c.htm (sorted by letter)
        xmlid = uom.get_external_id()
        if xmlid and uom.id in xmlid:
            collected_values['_unece_code'] = UOM_TO_UNECE_CODE.get(xmlid[uom.id], 'C62')
        else:
            collected_values['_unece_code'] = 'C62'

    # -------------------------------------------------------------------------
    # EXPORT COMMON: NODES
    # -------------------------------------------------------------------------

    def _add_document_currency_code_nodes(self, collected_values, currency=None):
        currency = currency or collected_values['_currency']
        collected_values['_document_currency'] = currency
        collected_values['cbc:DocumentCurrencyCode'] = {'_text': currency.name}

    # -------------------------------------------------------------------------
    # EXPORT PARTNER: NODES
    # -------------------------------------------------------------------------

    def _add_partner_party_identification_nodes(self, collected_values):
        commercial_partner = collected_values['_commercial_partner']
        collected_values['cac:PartyIdentification'] = {
            'cbc:ID': {'_text': commercial_partner.ref},
        }

    def _add_partner_party_name_nodes(self, collected_values):
        partner = collected_values['_partner']
        collected_values['cac:PartyName'] = {
            'cbc:PartyName': {'_text': partner.display_name},
        }

    def _add_partner_postal_address_nodes(self, collected_values):
        partner = collected_values['_partner']
        collected_values.update({
            'cbc:StreetName': {'_text': partner.street},
            'cbc:AdditionalStreetName': {'_text': partner.street2},
            'cbc:CityName': {'_text': partner.city},
            'cbc:PostalZone': {'_text': partner.zip},
            'cbc:CountrySubentity': {'_text': partner.state_id.name},
            'cbc:CountrySubentityCode': {'_text': partner.state_id.code},
            'cac:Country': {
                'cbc:IdentificationCode': {'_text': partner.country_id.code},
                'cbc:Name': {'_text': partner.country_id.name},
            },
        })

    def _add_partner_party_tax_scheme_nodes(self, collected_values):
        commercial_partner = collected_values['_commercial_partner']
        party_tax_scheme_node = collected_values['cac:PartyTaxScheme'] = {
            'cbc:RegistrationName': {'_text': commercial_partner.name},
            'cbc:CompanyID': {'_text': commercial_partner.vat},
        }

        registration_address_node = party_tax_scheme_node['cac:RegistrationAddress'] = {}
        self._add_common_partner_values(registration_address_node, commercial_partner)
        self._add_partner_postal_address_nodes(registration_address_node)

        tax_scheme_node = party_tax_scheme_node['cac:TaxScheme'] = {}
        if commercial_partner.country_id and commercial_partner.vat and not commercial_partner.vat[:2].isalpha():
            tax_scheme_node['cbc:ID'] = {'_text': 'NOT_EU_VAT'}
        else:
            tax_scheme_node['cbc:ID'] = {'_text': 'VAT'}

    def _add_partner_party_legal_entity_nodes(self, collected_values):
        commercial_partner = collected_values['_commercial_partner']
        party_legal_entity_node = collected_values['cac:PartyLegalEntity'] = {
            'cbc:RegistrationName': {'_text': commercial_partner.name},
            'cbc:CompanyID': {'_text': commercial_partner.vat},
        }

        registration_address_node = party_legal_entity_node['cac:RegistrationAddress'] = {}
        self._add_common_partner_values(registration_address_node, commercial_partner)
        self._add_partner_postal_address_nodes(registration_address_node)

    def _add_partner_contact_nodes(self, collected_values):
        partner = collected_values['_partner']
        collected_values['cac:Contact'] = {
            'cbc:ID': {'_text': partner.id},
            'cbc:Name': {'_text': partner.name},
            'cbc:Telephone': {'_text': partner.phone},
            'cbc:ElectronicMail': {'_text': partner.email},
        }

    # -------------------------------------------------------------------------
    # EXPORT BASE LINES: NODES
    # -------------------------------------------------------------------------

    def _add_invoice_line_id_nodes(self, collected_values, line_collected_values):
        line_collected_values['cbc:ID'] = {'_text': line_collected_values['_index']}

    def _add_invoice_line_quantity_nodes(self, collected_values, line_collected_values, quantity_tag):
        base_line = line_collected_values['_base_line']
        uom_values = line_collected_values['_uom']
        line_collected_values[quantity_tag] = {
            '_text': base_line['quantity'],
            'unitCode': uom_values['_unece_code'],
        }

    def _add_invoice_line_extension_amount_base_amount_aggregate_function(self, base_line, tax_data):
        if tax_data:
            tax_collected_values = tax_data['_collected_values']
            if tax_collected_values['_tax_percent'] is None:
                return {'skip': True}

        return {
            'skip': False
        }

    def _add_invoice_line_extension_amount_nodes(self, collected_values, line_collected_values):
        document_currency = collected_values['_document_currency']
        base_line = line_collected_values['_base_line']
        aggregated_values = self.env['account.tax']._aggregate_base_line_tax_details(
            base_line,
            self._add_invoice_line_extension_amount_base_amount_aggregate_function,
        )
        line_extension_amount = 0.0
        currency_suffix = '_currency' if document_currency == base_line['currency_id'] else ''
        for grouping_key, values in aggregated_values.items():
            if grouping_key['skip']:
                line_extension_amount += values[f'tax_amount{currency_suffix}']
            else:
                line_extension_amount += values[f'base_amount{currency_suffix}']

        line_collected_values['cbc:LineExtensionAmount'] = {
            '_text': self.format_monetary(line_extension_amount, document_currency),
            'currencyID': document_currency.name,
        }

    def _add_invoice_line_allowance_charge_nodes(self, collected_values, line_collected_values):
        document_currency = collected_values['_document_currency']
        base_line = line_collected_values['_base_line']
        currency_suffix = '_currency' if document_currency == base_line['currency_id'] else ''

        # Manage 'discount' on the base line.
        allowance_charge_nodes = line_collected_values['cac:AllowanceCharge'] = []
        discount_amount = line_collected_values[f'_discount_amount{currency_suffix}']
        if not document_currency.is_zero(discount_amount):
            allowance_charge_nodes.append({
                'cbc:ChargeIndicator': {'_text': 'false' if discount_amount > 0 else 'true'},
                'cbc:AllowanceChargeReasonCode': {'_text': '95'},
                'cbc:Amount': {
                    '_text': self.format_monetary(abs(discount_amount), document_currency),
                    'currencyID': document_currency.name,
                },
            })

        def aggregate_function(base_line, tax_data):
            if not tax_data:
                return {'skip': True}

            tax_collected_values = tax_data['_collected_values']
            if tax_collected_values['_tax_percent'] is not None:
                return {'skip': True}

            return {
                'tax_name': tax_data['tax'].name,
            }

        aggregated_values = self.env['account.tax']._aggregate_base_line_tax_details(base_line, aggregate_function)
        for grouping_key, values in aggregated_values.items():
            if grouping_key['skip']:
                continue

            tax_amount = values[f'tax_amount{currency_suffix}']
            if document_currency.is_zero(tax_amount):
                continue

            allowance_charge_nodes.append({
                'cbc:ChargeIndicator': {'_text': 'true' if tax_amount > 0 else 'false'},
                'cbc:AllowanceChargeReasonCode': {'_text': 'AEO'},
                'cbc:AllowanceChargeReason': {'_text': grouping_key['tax_name']},
                'cbc:Amount': {
                    '_text': self.format_monetary(abs(tax_amount), document_currency),
                    'currencyID': document_currency.name,
                },
            })

    def _add_invoice_line_tax_total_nodes(self, collected_values, line_collected_values):
        line_collected_values.update({
            'cac:TaxTotal': [],
            'cac:WithholdingTaxTotal': [],
        })

        document_currency = collected_values['_document_currency']
        base_line = line_collected_values['_base_line']
        currency_suffix = '_currency' if document_currency == base_line['currency_id'] else ''

        def total_aggregate_function(base_line, tax_data):
            if not tax_data:
                return {'skip': True}

            tax = tax_data['tax']
            tax_collected_values = tax_data['_collected_values']
            if tax_collected_values['_tax_percent'] is None:
                return {'skip': True}

            return {'is_withholding': tax.amount < 0.0}

        aggregated_values = self.env['account.tax']._aggregate_base_line_tax_details(
            base_line,
            total_aggregate_function,
        )
        for grouping_key, values in aggregated_values.items():
            if grouping_key['skip']:
                continue

            tax_amount = values[f'tax_amount{currency_suffix}']
            if grouping_key['is_withholding']:
                line_collected_values['cac:WithholdingTaxTotal'].append({
                    'cbc:TaxAmount': {
                        '_text': self.format_monetary(-tax_amount, document_currency),
                        'currencyID': document_currency.name,
                    },
                    'cac:TaxSubtotal': [],
                })
            else:
                line_collected_values['cac:TaxTotal'].append({
                    'cbc:TaxAmount': {
                        '_text': self.format_monetary(tax_amount, document_currency),
                        'currencyID': document_currency.name,
                    },
                    'cac:TaxSubtotal': [],
                })

        def subtotal_aggregate_function(base_line, tax_data):
            if not tax_data:
                return {'skip': True}

            tax = tax_data['tax']
            tax_collected_values = tax_data['_collected_values']
            if tax_collected_values['_tax_percent'] is None:
                return {'skip': True}

            return {
                'is_withholding': tax.amount < 0.0,
                'tax_amount': 0.0 if tax.has_negative_factor else tax_collected_values['_tax_amount'],
                'tax_percent': tax_collected_values['_tax_percent'],
                'tax_category_code': tax_collected_values['_tax_category_code'],
                'tax_exemption_reason': tax_collected_values['_tax_exemption_reason'],
                'tax_exemption_reason_code': tax_collected_values['_tax_exemption_reason_code'],
            }

        aggregated_values = self.env['account.tax']._aggregate_base_line_tax_details(
            base_line,
            subtotal_aggregate_function,
        )
        for grouping_key, values in aggregated_values.items():
            if grouping_key['skip']:
                continue

            base_amount = values[f'base_amount{currency_suffix}']
            tax_amount = values[f'tax_amount{currency_suffix}']
            tax_percent = grouping_key['tax_percent']
            if grouping_key['is_withholding']:
                tax_amount *= -1
                tax_subtotal_nodes = line_collected_values['cac:WithholdingTaxTotal'][0]['cac:TaxSubtotal']
            else:
                tax_subtotal_nodes = line_collected_values['cac:TaxTotal'][0]['cac:TaxSubtotal']
            tax_subtotal_node = {
                'cbc:TaxableAmount': {
                    '_text': self.format_monetary(base_amount, document_currency),
                    'currencyID': document_currency.name,
                },
                'cbc:TaxAmount': {
                    '_text': self.format_monetary(tax_amount, document_currency),
                    'currencyID': document_currency.name,
                },
                'cbc:Percent': {'_text': tax_percent},
                'cac:TaxCategory': {
                    'cbc:ID': {'_text': grouping_key['tax_category_code']},
                    'cbc:Percent': {'_text': grouping_key['tax_percent']},
                    'cbc:TaxExemptionReasonCode': {'_text': grouping_key['tax_exemption_reason_code']},
                    'cbc:TaxExemptionReason': {'_text': grouping_key['tax_exemption_reason']},
                    'cac:TaxScheme': {
                        'cbc:ID': {'_text': 'VAT'},
                    }
                },
            }
            tax_subtotal_nodes.append(tax_subtotal_node)

    def _add_invoice_line_item_nodes(self, collected_values, line_collected_values):
        base_line = line_collected_values['_base_line']
        product_collected_values = line_collected_values['_product_values']

        item_node = line_collected_values['cac:Item'] = {
            'cbc:Name': {'_text': base_line['_label']},
        }
        if product_collected_values:
            product = product_collected_values['_product']
            item_node.update({
                'cbc:Description': {'_text': product.description_sale},
                'cac:SellersItemIdentification': {
                    'cbc:ID': {'_text': product.default_code},
                },
                'cac:AdditionalItemProperty': [
                    {
                        'cbc:Name': {'_text': value.attribute_id.name},
                        'cbc:Value': {'_text': value.name},
                    } for value in product.product_template_attribute_value_ids
                ],
            })
            if product.barcode:
                item_node['cac:StandardItemIdentification'] = {
                    'cbc:ID': {
                        '_text': product.barcode,
                        'schemeID': '0160',  # GTIN
                    },
                }

    def _add_invoice_line_item_classified_tax_category_nodes(self, collected_values, line_collected_values):
        line_collected_values['cac:Item']['cac:ClassifiedTaxCategory'] = line_collected_values['cac:TaxTotal'][0]['cac:TaxSubtotal']['cac:TaxCategory']

    def _add_invoice_line_price_nodes(self, collected_values, line_collected_values):
        document_currency = collected_values['_document_currency']
        base_line = line_collected_values['_base_line']
        currency_suffix = '_currency' if document_currency == base_line['currency_id'] else ''

        line_collected_values['cac:Price'] = {
            'cbc:PriceAmount': {
                '_text': self.format_monetary(line_collected_values[f'_gross_price_unit{currency_suffix}'], document_currency),
                'currencyID': document_currency.name,
            },
        }

    # -------------------------------------------------------------------------
    # EXPORT INVOICE: NODES
    # -------------------------------------------------------------------------

    def _add_invoice_id_nodes(self, collected_values):
        invoice = collected_values['_invoice']
        collected_values['cbc:ID'] = {'_text': invoice.name}

    def _add_invoice_issue_date_nodes(self, collected_values):
        invoice = collected_values['_invoice']
        collected_values['cbc:IssueDate'] = {'_text': invoice.invoice_date}

    def _add_invoice_type_code_nodes(self, collected_values):
        if collected_values['_invoice_type'] == 'out_invoice':
            collected_values['cbc:InvoiceTypeCode'] = {'_text': 380}
        else:
            collected_values['cbc:InvoiceTypeCode'] = {'_text': None}

    def _add_invoice_note_nodes(self, collected_values):
        invoice = collected_values['_invoice']
        if invoice.narration:
            collected_values['cbc:Note'] = {'_text': html2plaintext(invoice.narration)}
        else:
            collected_values['cbc:Note'] = {'_text': None}

    def _add_invoice_order_reference_nodes(self, collected_values):
        invoice = collected_values['_invoice']
        order_ref_node = collected_values['cac:OrderReference'] = {
            'cbc:ID': {'_text': invoice.ref or invoice.name},
        }
        if collected_values['_is_sale_module_installed']:
            order_ref_node['cbc:SalesOrderID'] = {'_text': ",".join(invoice.invoice_line_ids.sale_line_ids.order_id.mapped('name'))}
        else:
            order_ref_node['cbc:SalesOrderID'] = {'_text': None}

    def _add_invoice_accounting_supplier_party(self, collected_values, partner=None):
        partner = partner or collected_values['_supplier']
        accounting_supplier_party_node = collected_values['cac:AccountingSupplierParty'] = {}
        party_node = accounting_supplier_party_node['cac:Party'] = {}
        self._add_common_partner_values(party_node, partner)
        self._add_partner_party_identification_nodes(party_node)
        self._add_partner_party_name_nodes(party_node)
        self._add_partner_postal_address_nodes(party_node)
        self._add_partner_party_tax_scheme_nodes(party_node)
        self._add_partner_party_legal_entity_nodes(party_node)
        self._add_partner_contact_nodes(party_node)

    def _add_invoice_accounting_customer_party(self, collected_values, partner=None):
        partner = partner or collected_values['_customer']
        accounting_supplier_party_node = collected_values['cac:AccountingCustomerParty'] = {}
        party_node = accounting_supplier_party_node['cac:Party'] = {}
        self._add_common_partner_values(party_node, partner)
        self._add_partner_party_identification_nodes(party_node)
        self._add_partner_party_name_nodes(party_node)
        self._add_partner_postal_address_nodes(party_node)
        self._add_partner_party_tax_scheme_nodes(party_node)
        self._add_partner_party_legal_entity_nodes(party_node)
        self._add_partner_contact_nodes(party_node)

    def _add_invoice_delivery_nodes(self, collected_values, partner=None):
        invoice = collected_values['_invoice']
        delivery_node = collected_values['cac:Delivery'] = {
            'cbc:ActualDeliveryDate': {'_text': invoice.delivery_date},
            'cac:DeliveryLocation': {},
        }

        shipping_address = partner or invoice.partner_shipping_id or invoice.partner_id
        address_node = delivery_node['cac:DeliveryLocation']['cac:Address'] = {}
        self._add_common_partner_values(address_node, shipping_address)
        self._add_partner_postal_address_nodes(address_node)

    def _add_invoice_payment_means_code_nodes(self, collected_values):
        invoice = collected_values['_invoice']
        invoice_type = collected_values['_invoice_type']
        payment_means_node = collected_values['cac:PaymentMeans']
        if collected_values['_customer'].country_code == 'DK':
            # in Denmark payment code 30 is not allowed. we hardcode it to 1 ("unknown") for now
            # as we cannot deduce this information from the invoice
            payment_means_node['cbc:PaymentMeansCode'] = {
                '_text': '1',
                'name': 'unknown',
            }
        elif invoice_type == 'out_invoice':
            if invoice.partner_bank_id:
                payment_means_node['cbc:PaymentMeansCode'] = {
                    '_text': '30',
                    'name': 'credit transfer',
                }
            else:
                payment_means_node['cbc:PaymentMeansCode'] = {
                    '_text': 'ZZZ',
                    'name': 'mutually defined',
                }
        else:
            payment_means_node['cbc:PaymentMeansCode'] = {
                '_text': '57',
                'name': 'standing agreement',
            }

    def _add_invoice_payment_means_due_date_nodes(self, collected_values):
        invoice = collected_values['_invoice']
        payment_means_node = collected_values['cac:PaymentMeans']
        payment_means_node['cac:PaymentDueDate'] = {
            '_text': invoice.invoice_date_due or invoice.invoice_date,
        }

    def _add_invoice_payment_means_instruction_id_nodes(self, collected_values):
        invoice = collected_values['_invoice']
        payment_means_node = collected_values['cac:PaymentMeans']
        payment_means_node['cac:InstructionID'] = {
            '_text': invoice.payment_reference,
        }

    def _add_invoice_payment_means_payment_id_nodes(self, collected_values):
        invoice = collected_values['_invoice']
        payment_means_node = collected_values['cac:PaymentMeans']
        payment_means_node['cac:PaymentID'] = {
            '_text': invoice.payment_reference or invoice.name,
        }

    def _add_invoice_payment_means_payee_financial_account_nodes(self, collected_values):
        invoice = collected_values['_invoice']
        partner_bank = invoice.partner_bank_id
        if not partner_bank:
            return

        payment_means_node = collected_values['cac:PaymentMeans']
        payee_financial_account = payment_means_node['cac:PayeeFinancialAccount'] = {}
        self._add_common_partner_bank_values(payee_financial_account, partner_bank)
        payee_financial_account['cbc:ID'] = {
            '_text': payee_financial_account['_account_number'],
        },

    def _add_invoice_payment_means_nodes(self, collected_values):
        collected_values['cac:PaymentMeans'] = {}
        self._add_invoice_payment_means_code_nodes(collected_values)
        self._add_invoice_payment_means_due_date_nodes(collected_values)
        self._add_invoice_payment_means_instruction_id_nodes(collected_values)
        self._add_invoice_payment_means_payment_id_nodes(collected_values)
        self._add_invoice_payment_means_payee_financial_account_nodes(collected_values)

    def _add_invoice_payment_terms_nodes(self, collected_values):
        invoice = collected_values['_invoice']
        payment_term = invoice.invoice_payment_term_id
        if not payment_term:
            return

        payment_term_values = {}
        self._add_common_payment_term_values(payment_term_values, payment_term)
        payment_term_note = payment_term_values['_payment_term_note']
        if not payment_term_note:
            return

        collected_values['cac:PaymentTerms'] = {
            'cbc:Note': {'_text': payment_term_note},
        }

    def _add_invoice_allowance_charge_nodes(self, collected_values):
        base_lines = collected_values['_base_lines']
        document_currency = collected_values['_document_currency']
        currency_suffix = '_currency' if base_lines and document_currency == base_lines[0]['currency_id'] else ''

        def aggregate_function(base_line, tax_data):
            if not base_line['early_payment']:
                return {'skip': True}

            tax_details = base_line['tax_details']
            return {
                'charge_indicator': 'false' if tax_details['raw_total_excluded_currency'] < 0.0 else 'true',
            }

        allowance_charge_nodes = collected_values['cac:AllowanceCharge'] = []
        allowance_charge_nodes_mapping = {}
        base_lines_aggregated_values = self.env['account.tax']._aggregate_base_lines_tax_details(base_lines, aggregate_function)
        values_per_grouping_key = self._aggregate_base_lines_aggregated_values(base_lines_aggregated_values)
        for grouping_key, values in values_per_grouping_key.items():
            if grouping_key['skip']:
                continue

            charge_indicator = grouping_key['charge_indicator']
            allowance_charge_node = {
                'cbc:ChargeIndicator': {'_text': charge_indicator},
                'cbc:AllowanceChargeReasonCode': {'_text': '66' if charge_indicator == 'false' else 'ZZZ'},
                'cbc:AllowanceChargeReason': {'_text': _("Conditional cash/payment discount")},
                'cbc:Amount': {
                    '_text': self.format_monetary(abs(values[f'base_amount{currency_suffix}']), document_currency),
                    'currencyID': document_currency.name,
                },
                'cac:TaxCategory': [],
            }
            allowance_charge_nodes.append(allowance_charge_node)
            allowance_charge_nodes_mapping[charge_indicator] = allowance_charge_node

        def aggregate_function(base_line, tax_data):
            if not base_line['early_payment']:
                return {'skip': True}

            tax = tax_data['tax']
            tax_collected_values = tax_data['_collected_values']
            if tax_collected_values['_tax_percent'] is None or tax.amount < 0.0:
                return {'skip': True}

            tax_details = base_line['tax_details']
            return {
                'charge_indicator': 'false' if tax_details['raw_total_excluded_currency'] < 0.0 else 'true',
                'tax_amount': 0.0 if tax.has_negative_factor else tax_collected_values['_tax_amount'],
                'tax_percent': tax_collected_values['_tax_percent'],
                'tax_category_code': tax_collected_values['_tax_category_code'],
                'tax_exemption_reason': tax_collected_values['_tax_exemption_reason'],
                'tax_exemption_reason_code': tax_collected_values['_tax_exemption_reason_code'],
            }

        base_lines_aggregated_values = self.env['account.tax']._aggregate_base_lines_tax_details(base_lines, aggregate_function)
        values_per_grouping_key = self._aggregate_base_lines_aggregated_values(base_lines_aggregated_values)
        for grouping_key, values in values_per_grouping_key.items():
            if grouping_key['skip']:
                continue

            charge_indicator = grouping_key['charge_indicator']
            allowance_charge_node = allowance_charge_nodes_mapping[charge_indicator]
            allowance_charge_node['cac:TaxCategory'].append({
                'cbc:ID': {'_text': grouping_key['tax_category_code']},
                'cbc:Percent': {'_text': grouping_key['tax_percent']},
                'cbc:TaxExemptionReasonCode': {'_text': grouping_key['tax_exemption_reason_code']},
                'cbc:TaxExemptionReason': {'_text': grouping_key['tax_exemption_reason']},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'VAT'},
                }
            })

    def _add_invoice_tax_total_nodes(self, collected_values):
        collected_values.update({
            'cac:TaxTotal': [],
            'cac:WithholdingTaxTotal': [],
        })

        document_currency = collected_values['_document_currency']
        base_lines = collected_values['_base_lines']
        currency_suffix = '_currency' if base_lines and document_currency == base_lines[0]['currency_id'] else ''

        def total_aggregate_function(base_line, tax_data):
            if not tax_data:
                return {'skip': True}

            tax = tax_data['tax']
            tax_collected_values = tax_data['_collected_values']
            if tax_collected_values['_tax_percent'] is None:
                return {'skip': True}

            return {'is_withholding': tax.amount < 0.0}

        base_lines_aggregated_values = self.env['account.tax']._aggregate_base_lines_tax_details(base_lines, total_aggregate_function)
        values_per_grouping_key = self._aggregate_base_lines_aggregated_values(base_lines_aggregated_values)
        for grouping_key, values in values_per_grouping_key.items():
            if grouping_key['skip']:
                continue

            tax_amount = values[f'tax_amount{currency_suffix}']
            if grouping_key['is_withholding']:
                collected_values['cac:WithholdingTaxTotal'].append({
                    'cbc:TaxAmount': {
                        '_text': self.format_monetary(-tax_amount, document_currency),
                        'currencyID': document_currency.name,
                    },
                    'cac:TaxSubtotal': [],
                })
            else:
                collected_values['cac:TaxTotal'].append({
                    'cbc:TaxAmount': {
                        '_text': self.format_monetary(tax_amount, document_currency),
                        'currencyID': document_currency.name,
                    },
                    'cac:TaxSubtotal': [],
                })

        def subtotal_aggregate_function(base_line, tax_data):
            if not tax_data:
                return {'skip': True}

            tax = tax_data['tax']
            tax_collected_values = tax_data['_collected_values']
            if tax_collected_values['_tax_percent'] is None:
                return {'skip': True}

            return {
                'is_withholding': tax.amount < 0.0,
                'tax_amount': 0.0 if tax.has_negative_factor else tax_collected_values['_tax_amount'],
                'tax_percent': tax_collected_values['_tax_percent'],
                'tax_category_code': tax_collected_values['_tax_category_code'],
                'tax_exemption_reason': tax_collected_values['_tax_exemption_reason'],
                'tax_exemption_reason_code': tax_collected_values['_tax_exemption_reason_code'],
            }

        base_lines_aggregated_values = self.env['account.tax']._aggregate_base_lines_tax_details(base_lines, subtotal_aggregate_function)
        values_per_grouping_key = self._aggregate_base_lines_aggregated_values(base_lines_aggregated_values)
        for grouping_key, values in values_per_grouping_key.items():
            if grouping_key['skip']:
                continue

            base_amount = values[f'base_amount{currency_suffix}']
            tax_amount = values[f'tax_amount{currency_suffix}']
            tax_percent = grouping_key['tax_percent']
            if grouping_key['is_withholding']:
                tax_amount *= -1
                tax_subtotal_nodes = collected_values['cac:WithholdingTaxTotal'][0]['cac:TaxSubtotal']
            else:
                tax_subtotal_nodes = collected_values['cac:TaxTotal'][0]['cac:TaxSubtotal']
            tax_subtotal_node = {
                'cbc:TaxableAmount': {
                    '_text': self.format_monetary(base_amount, document_currency),
                    'currencyID': document_currency.name,
                },
                'cbc:TaxAmount': {
                    '_text': self.format_monetary(tax_amount, document_currency),
                    'currencyID': document_currency.name,
                },
                'cbc:Percent': {'_text': tax_percent},
                'cac:TaxCategory': {
                    'cbc:ID': {'_text': grouping_key['tax_category_code']},
                    'cbc:Percent': {'_text': grouping_key['tax_percent']},
                    'cbc:TaxExemptionReasonCode': {'_text': grouping_key['tax_exemption_reason_code']},
                    'cbc:TaxExemptionReason': {'_text': grouping_key['tax_exemption_reason']},
                    'cac:TaxScheme': {
                        'cbc:ID': {'_text': 'VAT'},
                    }
                },
            }
            tax_subtotal_nodes.append(tax_subtotal_node)

    def _add_invoice_monetary_total_nodes(self, collected_values, monetary_total_tag):
        document_currency = collected_values['_document_currency']
        base_lines = collected_values['_base_lines']
        currency_suffix = '_currency' if base_lines and document_currency == base_lines[0]['currency_id'] else ''

        total_line_extension_amount = 0.0
        tax_exclusive_amount = 0.0
        tax_inclusive_amount = 0.0
        allowance_total_amount = None
        charge_total_amount = None
        for invoice_line_node in collected_values['_invoice_line_nodes']:
            line_extension_amount = invoice_line_node['cbc:LineExtensionAmount']['_text']
            total_line_extension_amount += line_extension_amount
            tax_exclusive_amount += line_extension_amount
            tax_inclusive_amount += line_extension_amount
            for allowance_charge_node in invoice_line_node['cac:AllowanceCharge']:
                if allowance_charge_node['cbc:ChargeIndicator'] == 'false':
                    allowance_total_amount = allowance_total_amount or 0.0
                    allowance_total_amount += allowance_charge_node['cbc:Amount']['_text']
                    tax_exclusive_amount -= allowance_total_amount
                    tax_inclusive_amount -= allowance_total_amount
                else:
                    charge_total_amount = charge_total_amount or 0.0
                    charge_total_amount += allowance_charge_node['cbc:Amount']['_text']
                    tax_exclusive_amount += allowance_total_amount
                    tax_inclusive_amount += allowance_total_amount
            for tax_total_node in invoice_line_node['cbc:TaxTotal']:
                tax_inclusive_amount += tax_total_node['cbc:TaxAmount']['_text']
            for tax_total_node in invoice_line_node['cbc:WithholdingTaxTotal']:
                tax_inclusive_amount -= tax_total_node['cbc:TaxAmount']['_text']
        payable_rounding_amount = None
        for base_line in base_lines:
            if base_line['special_type'] == 'cash_rounding':
                tax_details = base_line['tax_details']
                payable_rounding_amount = payable_rounding_amount or None
                payable_rounding_amount += tax_details[f'total_excluded{currency_suffix}']

        monetary_total_node = collected_values[monetary_total_tag] = {
            'cbc:LineExtensionAmount': {
                '_text': self.format_monetary(total_line_extension_amount, document_currency),
                'currencyID': document_currency.name,
            },
            'cbc:TaxExclusiveAmount': {
                '_text': self.format_monetary(tax_exclusive_amount, document_currency),
                'currencyID': document_currency.name,
            },
            'cbc:TaxInclusiveAmount': {
                '_text': self.format_monetary(tax_inclusive_amount, document_currency),
                'currencyID': document_currency.name,
            },
            'cbc:PrepaidAmount': {
                '_text': self.format_monetary(0.0, document_currency),
                'currencyID': document_currency.name,
            },
            'cbc:PayableAmount': {
                '_text': self.format_monetary(tax_inclusive_amount, document_currency),
                'currencyID': document_currency.name,
            },
        }

        if allowance_total_amount is not None:
            monetary_total_node['cbc:AllowanceTotalAmount'] = {
                '_text': self.format_monetary(allowance_total_amount, document_currency),
                'currencyID': document_currency.name,
            }
        if charge_total_amount is not None:
            monetary_total_node['cbc:ChargeTotalAmount'] = {
                '_text': self.format_monetary(charge_total_amount, document_currency),
                'currencyID': document_currency.name,
            }
        if payable_rounding_amount is not None:
            monetary_total_node['cbc:PayableRoundingAmount'] = {
                '_text': self.format_monetary(payable_rounding_amount, document_currency),
                'currencyID': document_currency.name,
            }
