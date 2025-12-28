# UBL structure for CIUS HR
# Updated to work with but doesn't entirely follow the full structure of the UBL rework
# implemented in commit a3c6e5abe0d964f0768de68d526905ae3dccac8a

from odoo import _, fields, models
from odoo.tools import html2plaintext
from lxml import etree


class AccountEdiXmlUBLHR(models.AbstractModel):
    _inherit = 'account.edi.xml.ubl_bis3'
    _name = 'account.edi.xml.ubl_hr'
    _description = "CIUS HR"

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_ubl_hr.xml"

    # -------------------------------------------------------------------------
    # EXPORT: New (dict_to_xml) helpers
    # -------------------------------------------------------------------------

    def _get_document_template(self, vals):
        ext_template = {
            'ext:UBLExtension': {
                'ext:ExtensionContent': {
                    'hrextac:HRFISK20Data': {
                        'hrextac:HRObracunPDVPoNaplati': {},
                        'hrextac:HRTaxTotal': {
                            'cbc:TaxAmount': {},
                            'hrextac:HRTaxSubtotal': {
                                'cbc:TaxableAmount': {},
                                'cbc:TaxAmount': {},
                                'hrextac:HRTaxCategory': {
                                    'cbc:ID': {},
                                    'cbc:Name': {},
                                    'cbc:Percent': {},
                                    'cbc:TaxExemptionReason': {},
                                    'hrextac:HRTaxScheme': {
                                        'cbc:ID': {},
                                    }
                                }
                            }
                        },
                        'hrextac:HRLegalMonetaryTotal': {
                            'cbc:TaxExclusiveAmount': {},
                            'hrextac:OutOfScopeOfVATAmount': {},
                        }
                    }
                }
            }
        }
        template = super()._get_document_template(vals)

        # Add SellerContact to AccountingSupplierParty template for Croatian requirements
        if 'cac:AccountingSupplierParty' not in template:
            template['cac:AccountingSupplierParty'] = {}
        if 'cac:Party' not in template['cac:AccountingSupplierParty']:
            template['cac:AccountingSupplierParty']['cac:Party'] = {}
        template['cac:AccountingSupplierParty']['cac:SellerContact'] = {
            'cbc:ID': {},
            'cbc:Name': {},
        }

        # Overriding the node as it appears to be localization-specific
        template['ext:UBLExtensions'] = ext_template

        # Add TaxPointDate to the template in the correct position
        # UBL 2.1 schema has different positions for Invoice vs CreditNote:
        # - Invoice: TaxPointDate comes after Note, before DocumentCurrencyCode
        # - CreditNote: TaxPointDate comes after IssueTime, before CreditNoteTypeCode
        if 'cbc:TaxPointDate' not in template:
            new_template = {}
            inserted_tax_point = False
            
            # Determine insertion point based on document type
            insert_after = 'cbc:Note' if vals.get('document_type') == 'invoice' else 'cbc:IssueTime'
            
            for key, value in template.items():
                new_template[key] = value
                if key == insert_after and not inserted_tax_point:
                    new_template['cbc:TaxPointDate'] = {}
                    inserted_tax_point = True
            
            # Fallback if the key wasn't found
            if not inserted_tax_point:
                new_template['cbc:TaxPointDate'] = {}
            template = new_template

        return template

    def _get_document_nsmap(self, vals):
        nsmap = super()._get_document_nsmap(vals)
        nsmap.update({
            'hrextac': "urn:mfin.gov.hr:schema:xsd:HRExtensionAggregateComponents-1",
        })
        return nsmap

    def _export_invoice_constraints_new(self, invoice, vals):
        constraints = super()._export_invoice_constraints_new(invoice, vals)
        constraints.update(
            self._invoice_constraints_eracun_new(invoice, vals)
        )
        return constraints

    def _invoice_constraints_eracun_new(self, invoice, vals):
        # Corresponds to Croatian eRacun format constrains
        constraints = {}
        if vals['document_type'] in ['invoice', 'credit_note']:
            if any(c.isspace() for c in vals['document_node']['cac:PaymentMeans']['cac:PayeeFinancialAccount']['cbc:ID'].get('_text')):
                constraints.update({'ubl_hr_br_1': self.env._("HR-BR-1: The account number must not contain whitespace characters.")})
            if invoice.amount_residual > 0 and not invoice.invoice_date_due:
                constraints.update({'ubl_hr_br_4': self.env._("HR-BT-4: In the case of a positive amount due for payment (BT-115), the payment due date (BT-9) must be specified.")})
            constraints.update({
                'ubl_hr_br_7_seller_email_required': (
                    self.env._("The Seller's electronic address (BT-34) must be provided.")
                ) if not vals['document_node']['cac:AccountingSupplierParty']['cac:Party']['cac:Contact']['cbc:ElectronicMail'].get('_text') else None,
                'ubl_hr_br_10_buyer_email_required': (
                    self.env._("The Buyer's electronic address (BT-37) must be provided.")
                ) if not vals['document_node']['cac:AccountingCustomerParty']['cac:Party']['cac:Contact']['cbc:ElectronicMail'].get('_text') else None,
                'ubl_hr_br_s_buyer_vat_required': (
                    self.env._("The invoice must contain the Customer's VAT identification number (BT-48).")
                ) if any(not item['cbc:CompanyID'].get('_text') for item in vals['document_node']['cac:AccountingCustomerParty']['cac:Party']['cac:PartyTaxScheme']) else None,
                'ubl_hr_br_37_operator_label_required': (
                    self.env._("The invoice must contain the Operator Label (HR-BT-4).")
                ) if not vals['document_node']['cac:AccountingSupplierParty']['cac:SellerContact']['cbc:Name'].get('_text') else None,
                'ubl_hr_br_9_operator_oib_required': (
                    self.env._("The invoice must contain the Operator OIB (HR-BT-5).")
                ) if not vals['document_node']['cac:AccountingSupplierParty']['cac:SellerContact']['cbc:ID'].get('_text') else None,
            })
        return constraints

    def _get_invoice_node(self, vals):
        document_node = super()._get_invoice_node(vals)
        # HRFISC20Data extension support
        self._add_hr_extension_node(document_node, vals)
        return document_node
    
    def _add_invoice_header_nodes(self, document_node, vals):
        super()._add_invoice_header_nodes(document_node, vals)
        invoice = vals['invoice']
        document_node.update({
            # For Croatia, ID should be the Croatian-format fiscalization number
            'cbc:ID': {
                '_text': invoice.l10n_hr_fiscalization_number
            },
            # HR-BT-1: Copy indicator - is the invoice the original or already sent
            #   This doesn't appear to be currently supported in Odoo, and is set to 'false' in TR localization using a similar format
            'cbc:CopyIndicator': {
                    '_text': 'false'
            },
            # HR-BT-2: The invoice must have an invoice issuance time.
            #   (in addition to BT-2: Date of issue)
            'cbc:IssueDate': {
                '_text': fields.Datetime.to_string(invoice.l10n_hr_invoice_sending_time).split()[0]
            },
            'cbc:IssueTime': {
                '_text': fields.Datetime.to_string(invoice.l10n_hr_invoice_sending_time).split()[1]
            },
            # HR-BR-34: The process label MUST be specified. Values P1-P12 or P99:Customer ID from Table 4 Business Process Types are used.
            'cbc:ProfileID': {
                '_text': f"P99:{invoice.l10n_hr_customer_defined_process_name}" if invoice.l10n_hr_process_type == 'P99' else invoice.l10n_hr_process_type
            },
            # HR-BR-5: The specification identifier must have the value
            # 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0'
            'cbc:CustomizationID': {
                '_text': 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0'
            },
            # Tax point date (BT-7) - the date when VAT becomes accountable
            'cbc:TaxPointDate': {
                '_text': invoice.date
            },
        })
        # HR-BT-4: In the case of a positive amount due for payment (BT-115), the payment due date (BT-9) must be specified.
        if invoice.amount_residual > 0 and not document_node['cbc:DueDate'] and vals['document_type'] == 'invoice':
            if invoice.invoice_date_due:
                document_node.update({
                    'cbc:DueDate': {
                        '_text': invoice.invoice_date_due
                    }
                })
        # HR-BR-6: Each previous invoice reference (BG-3) must have the date of issue of the previous invoice (BT-26).
        # BR-55: ID on previous invoice
        if invoice.reversed_entry_id:
            billing_ref = document_node.get('cac:BillingReference')
            if billing_ref:
                # Node exists, update it with IssueDate
                billing_ref.update({
                    'cac:InvoiceDocumentReference': {
                        'cbc:ID': {'_text': invoice.reversed_entry_id.l10n_hr_fiscalization_number},
                        'cbc:IssueDate': {
                            '_text': fields.Datetime.to_string(invoice.reversed_entry_id.l10n_hr_invoice_sending_time).split()[0]
                        }
                    },
                })
            else:
                # Node doesn't exist, create it with required structure
                document_node['cac:BillingReference'] = {
                    'cac:InvoiceDocumentReference': {
                        'cbc:ID': {'_text': invoice.reversed_entry_id.l10n_hr_fiscalization_number},
                        'cbc:IssueDate': {
                            '_text': fields.Datetime.to_string(invoice.reversed_entry_id.l10n_hr_invoice_sending_time).split()[0]
                        }
                    }
                }
        # Document Type Codes and Process Type Logic
        if invoice.l10n_hr_process_type in ('P4', 'P6'):
            if invoice.move_type == 'out_invoice':
                document_node['cbc:InvoiceTypeCode'].update({
                    '_text': '386'
                })
            elif invoice.move_type == 'out_refund':
                document_node['cbc:CreditNoteTypeCode'].update({
                    '_text': '386'
                })
        elif invoice.l10n_hr_process_type == 'P9':
            document_node['cbc:CreditNoteTypeCode'].update({
                '_text': '381'
            })

    def _add_hr_extension_node(self, document_node, vals):
        """Build Croatian HRFISK20Data block, only when needed (POVNAK or cash-basis taxation)."""
        tax_subtotals = document_node['cac:TaxTotal'][0]['cac:TaxSubtotal']
        cash_basis_line = False

        # Check for cash-basis taxation and strip hrextac:HRObracunPDVPoNaplati from TaxCategory
        for tax_subtotal in tax_subtotals:
            tax_category_entry = tax_subtotal['cac:TaxCategory']
            tax_category_list = tax_category_entry if isinstance(tax_category_entry, list) else [tax_category_entry]
            tax_category = tax_category_list[0]
            cash_basis_flag = tax_category.pop('hrextac:HRObracunPDVPoNaplati', None)
            cash_basis_line = cash_basis_line or cash_basis_flag

        # Check for POVNAK
        pn_amount, pn_reason, pn_name, currency = self._get_povnak_charge_info(vals)

        # Only add HR extension if there's POVNAK or cash-basis taxation
        if not pn_amount and not cash_basis_line:
            return

        # Case 1: Cash-basis ONLY (no POVNAK) - minimal extension
        if cash_basis_line and not pn_amount:
            document_node.update({
                'ext:UBLExtensions': {
                    'ext:UBLExtension': {
                        'ext:ExtensionContent': {
                            'hrextac:HRFISK20Data': {
                                'hrextac:HRObracunPDVPoNaplati': cash_basis_line,
                            }
                        },
                    }
                }
            })
            return

        # Case 2: POVNAK present (with or without cash-basis) - full extension
        # Build HR tax subtotals
        hr_tax_subtotals = []
        for tax_subtotal in tax_subtotals:
            tax_category_entry = tax_subtotal['cac:TaxCategory']
            tax_category_list = tax_category_entry if isinstance(tax_category_entry, list) else [tax_category_entry]
            tax_category = tax_category_list[0]
            tax_id = tax_category['cbc:ID']['_text']
            tax_exemption_reason = (tax_category.get('cbc:TaxExemptionReason') or {}).get('_text') or ''
            # Skip generic exempt subtotal; we add PN separately.
            if tax_id == 'E' and 'Povratna naknada' in tax_exemption_reason:
                continue
            name_val = tax_category.get('cbc:Name')
            hr_tax_subtotals.append({
                'cbc:TaxableAmount': tax_subtotal['cbc:TaxableAmount'],
                'cbc:TaxAmount': tax_subtotal['cbc:TaxAmount'],
                'hrextac:HRTaxCategory': {
                    'cbc:ID': tax_category['cbc:ID'],
                    'cbc:Name': name_val if isinstance(name_val, dict) else ({'_text': name_val} if name_val else None),
                    'cbc:Percent': tax_category['cbc:Percent'],
                    'hrextac:HRTaxScheme': tax_category['cac:TaxScheme'],
                }
            })

        # Add Povratna naknada (recycling fee) totals inside HR extension.
        hr_tax_subtotals.append({
            'cbc:TaxableAmount': {
                '_text': FloatFmt(pn_amount, min_dp=currency.decimal_places),
                'currencyID': currency.name,
            },
            'cbc:TaxAmount': {
                '_text': FloatFmt(0.0, min_dp=currency.decimal_places),
                'currencyID': currency.name,
            },
            'hrextac:HRTaxCategory': {
                'cbc:ID': {'_text': 'O'},
                'cbc:Name': {'_text': pn_name},
                'cbc:Percent': {'_text': 0},
                'cbc:TaxExemptionReason': {'_text': pn_reason},
                'hrextac:HRTaxScheme': {
                    'cbc:ID': {'_text': 'OTH'},
                }
            }
        })

        document_node.update({
            'ext:UBLExtensions': {
                'ext:UBLExtension': {
                    'ext:ExtensionContent': {
                        'hrextac:HRFISK20Data': {
                            'hrextac:HRObracunPDVPoNaplati': cash_basis_line if cash_basis_line else None,
                            'hrextac:HRTaxTotal': {
                                'cbc:TaxAmount': document_node['cac:TaxTotal'][0]['cbc:TaxAmount'],
                                'hrextac:HRTaxSubtotal': hr_tax_subtotals,
                            },
                            'hrextac:HRLegalMonetaryTotal': {
                                # HR extension uses LineExtensionAmount (line totals only, excludes charges)
                                'cbc:TaxExclusiveAmount': document_node['cac:LegalMonetaryTotal']['cbc:LineExtensionAmount'],
                                'hrextac:OutOfScopeOfVATAmount': {
                                    '_text': FloatFmt(pn_amount, min_dp=vals['currency_dp']),
                                    'currencyID': vals['currency_name'],
                                },
                            }
                        }
                    },
                }
            }
        })

    def _add_invoice_line_item_nodes(self, line_node, vals):
        super()._add_invoice_line_item_nodes(line_node, vals)
        line = vals['base_line']['record']
        if not line or isinstance(line, dict):
            return
        # HR-BR-25: Each item MUST have an item classification identifier from the Classification of Products
        # by Activities scheme: KPD (CPA) - listID "CG", except in the case of advance payment invoices.
        line_node['cac:Item'].update({
            'cac:CommodityClassification': {
                'cbc:ItemClassificationCode': {
                    'listID': 'CG',
                    '_text': line.l10n_hr_kpd_category_id.name
                }
            }
        })

    def _get_party_node(self, vals):
        party_node = super()._get_party_node(vals)
        commercial_partner = vals['partner'].commercial_partner_id
        if commercial_partner.peppol_eas == '0088' and commercial_partner.peppol_endpoint:
            party_node['cac:PartyIdentification']['cbc:ID'].update({
                '_text': '0088:' + commercial_partner.peppol_endpoint
            })
        elif commercial_partner.company_registry:
            if commercial_partner.l10n_hr_business_unit_code:
                party_node['cac:PartyIdentification']['cbc:ID'].update({
                    '_text': '9934:' + commercial_partner.company_registry + '::HR99:' + commercial_partner.l10n_hr_business_unit_code
                })
            else:
                party_node['cac:PartyIdentification']['cbc:ID'].update({
                    '_text': '9934:' + commercial_partner.company_registry
                })
        return party_node

    def _add_invoice_accounting_supplier_party_nodes(self, document_node, vals):
        super()._add_invoice_accounting_supplier_party_nodes(document_node, vals)
        invoice = vals['invoice']
        # HR-BR-37: Invoice must contain HR-BT-4: Operator code in accordance with the Fiscalization Act.
        # HR-BR-9: Invoice must contain HR-BT-5: Operator OIB in accordance with the Fiscalization Act.
        document_node['cac:AccountingSupplierParty'].update({
                'cac:SellerContact': {
                    'cbc:ID': {
                        '_text': invoice.l10n_hr_operator_oib
                    },
                    'cbc:Name': {
                        '_text': invoice.l10n_hr_operator_name
                    }
                }
            })

    def _get_tax_category_code(self, customer, supplier, tax):
        # HR-BR-11: Each document-level expense (BG-21) that is not subject to VAT or is exempt from VAT must have
        # a document-level expense VAT category code (HR-BT-6) from table HR-TB-2 HR VAT category codes
        #   Instead of determining what the elements should be from the invoice details, here we directly use
        #   the data of the VAT expence category defined on the tax by the user
        hr_category = tax.l10n_hr_tax_category_id if tax else None
        if hr_category and tax.amount == 0:
            return hr_category.code_untdid
        else:
            return super()._get_tax_category_code(customer, supplier, tax)

    def _get_tax_exemption_reason(self, customer, supplier, tax):
        # HR-BR-11: Each document-level expense (BG-21) that is not subject to VAT or is exempt from VAT must have
        # a document-level expense VAT category code (HR-BT-6) from table HR-TB-2 HR VAT category codes
        res = super()._get_tax_exemption_reason(customer, supplier, tax)
        hr_category = tax.l10n_hr_tax_category_id if tax else None
        if hr_category:
            res.update({
                'name': hr_category.name,
            })
            if tax.amount == 0:
                res.update({
                    'tax_exemption_reason': html2plaintext(tax.invoice_legal_notes) if tax.invoice_legal_notes else hr_category.description if hr_category and hr_category.description else '',
                })
        return res

    def _ubl_default_tax_category_grouping_key(self, base_line, tax_data, vals, currency):
        # Override to include fields that are needed for HR
        customer = vals['customer']
        supplier = vals['supplier']
        if tax_data and (
            tax_data['tax'].amount_type != 'percent'
            or self._ubl_is_recycling_contribution_tax(tax_data)
        ):
            return
        elif tax_data:
            tax = tax_data['tax']
            return {
                'tax_category_code': self._get_tax_category_code(customer.commercial_partner_id, supplier, tax),
                **self._get_tax_exemption_reason(customer.commercial_partner_id, supplier, tax),
                'percent': tax.amount,
                'scheme_id': 'VAT',
                'is_withholding': tax.amount < 0.0,
                'currency': currency,
                'tax_exigibility': tax.tax_exigibility,
                'invoice_legal_notes': html2plaintext(tax.invoice_legal_notes) if tax.invoice_legal_notes else False,
            }
        else:
            return {
                'tax_category_code': self._get_tax_category_code(customer.commercial_partner_id, supplier, self.env['account.tax']),
                **self._get_tax_exemption_reason(customer.commercial_partner_id, supplier, self.env['account.tax']),
                'percent': 0.0,
                'scheme_id': 'VAT',
                'is_withholding': False,
                'currency': currency,
                'tax_exigibility': False,
                'invoice_legal_notes': False,
            }

    def _ubl_get_tax_category_node(self, vals, tax_category):
        # Override the node 'cac:TaxCategory' in 'cac:SubTotal' to include fields that are needed for HR
        return {
            'cbc:ID': {'_text': tax_category['tax_category_code']},
            'cbc:Percent': {'_text': tax_category['percent']},
            'cbc:TaxExemptionReasonCode': {'_text': tax_category.get('tax_exemption_reason_code')},
            'cbc:TaxExemptionReason': {'_text': tax_category.get('tax_exemption_reason')},
            'cac:TaxScheme': {
                'cbc:ID': {'_text': tax_category['scheme_id']},
            },
            'hrextac:HRObracunPDVPoNaplati': {'_text': html2plaintext(tax_category['invoice_legal_notes'] or "Obračun po naplaćenoj naknadi")} if tax_category['tax_exigibility'] == 'on_payment' else None
        }

    def _ubl_get_line_item_node_classified_tax_category_node(self, vals, tax_category):
        # Override the node 'cac:ClassifiedTaxCategory' in 'cac:Item' to include fields that are needed for HR
        node = {
            'cbc:ID': {'_text': tax_category['tax_category_code']},
            'cbc:Percent': {'_text': tax_category['percent']},
            'cac:TaxScheme': {
                'cbc:ID': {'_text': tax_category['scheme_id']},
            }
        }
        if 'name' in tax_category:
            node['cbc:Name'] = {'_text': tax_category['name']}
        return node

    def _add_document_line_tax_category_nodes(self, line_node, vals):
        super()._add_document_line_tax_category_nodes(line_node, vals)
        for item in line_node['cac:Item']['cac:ClassifiedTaxCategory']:
            item.pop('hrextac:HRObracunPDVPoNaplati')

    def _add_invoice_line_allowance_charge_nodes(self, line_node, vals):
        """Skip PN on lines; it will be reported at document level."""
        base_line = vals['base_line']
        ubl_values = base_line['_ubl_values']

        # Temporarily drop recycling contribution charges to avoid line-level PN.
        saved_rc = ubl_values.get('allowance_charges_recycling_contribution_currency', [])
        ubl_values['allowance_charges_recycling_contribution_currency'] = []
        try:
            super()._add_invoice_line_allowance_charge_nodes(line_node, vals)
        finally:
            ubl_values['allowance_charges_recycling_contribution_currency'] = saved_rc

    def _add_invoice_allowance_charge_nodes(self, document_node, vals):
        """Add PN as document-level charge instead of line-level."""
        super()._add_invoice_allowance_charge_nodes(document_node, vals)
        pn_amount, pn_reason, pn_name, currency = self._get_povnak_charge_info(vals)
        if not pn_amount:
            return

        charge_nodes = document_node.setdefault('cac:AllowanceCharge', [])
        charge_nodes.append({
            'cbc:ChargeIndicator': {'_text': 'true'},
            'cbc:AllowanceChargeReason': {'_text': '#HR:POVNAK#'},
            'cbc:Amount': {
                '_text': FloatFmt(float(pn_amount or 0.0), max_dp=currency.decimal_places),
                'currencyID': currency.name,
            },
            'cac:TaxCategory': {
                'cbc:ID': {'_text': 'E'},
                'cbc:Name': {'_text': pn_name or 'HR:POVNAK'},
                'cbc:Percent': {'_text': 0.0},
                'cbc:TaxExemptionReason': {'_text': pn_reason},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'VAT'},
                },
            },
        })

    def _add_invoice_tax_total_nodes(self, document_node, vals):
        """Append PN zero-tax subtotal (E) into main TaxTotal."""
        super()._add_invoice_tax_total_nodes(document_node, vals)
        pn_amount, pn_reason, _pn_name, currency = self._get_povnak_charge_info(vals)
        if not pn_amount:
            return

        tax_totals = document_node.get('cac:TaxTotal') or []
        if not tax_totals:
            return

        tax_total_node = tax_totals[0]
        tax_subtotals = tax_total_node.setdefault('cac:TaxSubtotal', [])

        # Avoid duplicate PN subtotal if present.
        for subtotal in tax_subtotals:
            cat_entry = subtotal.get('cac:TaxCategory') or {}
            cat_list = cat_entry if isinstance(cat_entry, list) else [cat_entry]
            if any(cat.get('cbc:ID', {}).get('_text') == 'E' for cat in cat_list if isinstance(cat, dict)):
                return

        tax_subtotals.append({
            'cbc:TaxableAmount': {
                '_text': FloatFmt(pn_amount, min_dp=currency.decimal_places),
                'currencyID': currency.name,
            },
            'cbc:TaxAmount': {
                '_text': FloatFmt(0.0, min_dp=currency.decimal_places),
                'currencyID': currency.name,
            },
            'cac:TaxCategory': {
                'cbc:ID': {'_text': 'E'},
                'cbc:Percent': {'_text': 0.0},
                'cbc:TaxExemptionReason': {'_text': pn_reason},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'VAT'},
                },
            },
        })

    def _add_invoice_line_amount_nodes(self, line_node, vals):
        """Ensure PN is not counted into line extension amounts (line = net goods)."""
        base_line = vals['base_line']
        currency = vals['currency_id']
        quantity_tag = self._get_tags_for_document_type(vals)['line_quantity']
        net_amount = base_line['tax_details']['total_excluded_currency']

        line_node.update({
            quantity_tag: {
                '_text': base_line['quantity'],
                'unitCode': self._get_uom_unece_code(base_line['product_uom_id']),
            },
            'cbc:LineExtensionAmount': {
                '_text': FloatFmt(net_amount, min_dp=currency.decimal_places),
                'currencyID': currency.name,
            },
        })

    def _add_invoice_monetary_total_nodes(self, document_node, vals):
        """Include PN as document charge in monetary totals."""
        monetary_total_tag = self._get_tags_for_document_type(vals)['monetary_total']
        currency = vals['currency_id']
        ubl_values = vals['_ubl_values']
        line_tag = self._get_tags_for_document_type(vals)['document_line']

        line_extension_amount = sum(
            float(line_node['cbc:LineExtensionAmount']['_text'])
            for line_node in document_node[line_tag]
        )
        tax_amount = sum(
            float(tax_total['cbc:TaxAmount']['_text'])
            for tax_total in document_node['cac:TaxTotal']
            if tax_total['cbc:TaxAmount']['currencyID'] == currency.name
        )
        total_allowance = sum(
            float(allowance_charge['cbc:Amount']['_text'])
            for allowance_charge in document_node.get('cac:AllowanceCharge', [])
            if allowance_charge['cbc:ChargeIndicator']['_text'] == 'false'
        )
        total_charge = sum(
            float(allowance_charge['cbc:Amount']['_text'])
            for allowance_charge in document_node.get('cac:AllowanceCharge', [])
            if allowance_charge['cbc:ChargeIndicator']['_text'] == 'true'
        )
        payable_rounding_amount = ubl_values.get('payable_rounding_amount_currency') or 0.0

        tax_exclusive_amount = line_extension_amount + total_charge - total_allowance
        tax_inclusive_amount = tax_exclusive_amount + tax_amount

        document_node[monetary_total_tag] = {
            'cbc:LineExtensionAmount': {
                '_text': FloatFmt(line_extension_amount, min_dp=vals['currency_dp']),
                'currencyID': vals['currency_name'],
            },
            'cbc:TaxExclusiveAmount': {
                '_text': FloatFmt(tax_exclusive_amount, min_dp=vals['currency_dp']),
                'currencyID': vals['currency_name'],
            },
            'cbc:TaxInclusiveAmount': {
                '_text': FloatFmt(tax_inclusive_amount, min_dp=vals['currency_dp']),
                'currencyID': vals['currency_name'],
            },
            'cbc:AllowanceTotalAmount': {
                '_text': FloatFmt(total_allowance, min_dp=vals['currency_dp']),
                'currencyID': vals['currency_name'],
            } if total_allowance else None,
            'cbc:ChargeTotalAmount': {
                '_text': FloatFmt(total_charge, min_dp=vals['currency_dp']),
                'currencyID': vals['currency_name'],
            } if total_charge else None,
            'cbc:PrepaidAmount': {
                '_text': FloatFmt(0.0, min_dp=vals['currency_dp']),
                'currencyID': vals['currency_name'],
            },
            'cbc:PayableRoundingAmount': {
                '_text': FloatFmt(payable_rounding_amount, min_dp=vals['currency_dp']),
                'currencyID': vals['currency_name'],
            } if payable_rounding_amount else None,
            'cbc:PayableAmount': {
                '_text': FloatFmt(tax_inclusive_amount, min_dp=vals['currency_dp']),
                'currencyID': vals['currency_name'],
            },
        }

    def _import_fill_invoice(self, invoice, tree, qty_factor):
        logs = super()._import_fill_invoice(invoice, tree, qty_factor)
        profile_id = tree.findtext('./{*}ProfileID')
        invoice_values = {
            'l10n_hr_process_type': profile_id[:3] if profile_id[:3] == 'P99' else profile_id,
            'l10n_hr_customer_defined_process_name': profile_id[4:] if profile_id[:3] == 'P99' else False,
        }
        invoice.write(invoice_values)
        invoice.l10n_hr_edi_addendum_id.write({'fiscalization_number': tree.findtext('./{*}ID')})
        return logs

    def _retrieve_taxes(self, record, line_values, tax_type, tax_exigibility=None):
        """
        Override to support Croatian tax exigibility filtering.

        :param record: The invoice record
        :param line_values: Dictionary of line values including 'tax_nodes'
        :param tax_type: 'sale' or 'purchase' (from journal type)
        :param tax_exigibility: Optional - 'on_invoice' or 'on_payment'
        :return: tuple of (tax_ids list, logs list)
        """
        logs = []
        taxes = []
        for tax_node in line_values.pop('tax_nodes'):
            amount = float(tax_node.text)
            base_domain = [
                *self.env['account.journal']._check_company_domain(record.company_id),
                ('amount_type', '=', 'percent'),
                ('type_tax_use', '=', tax_type),
                ('amount', '=', amount),
            ]

            # Add Croatian tax exigibility filter if specified
            if tax_exigibility:
                domain = base_domain + [('tax_exigibility', '=', tax_exigibility)]
            else:
                domain = base_domain

            tax = self.env['account.tax']
            if hasattr(record, '_get_specific_tax'):
                tax = record._get_specific_tax(line_values['name'], 'percent', amount, tax_type)
            if not tax:
                tax = self.env['account.tax'].search(domain + [('price_include', '=', False)], limit=1)
            if not tax:
                tax = self.env['account.tax'].search(domain + [('price_include', '=', True)], limit=1)

            # Fallback: if no tax found with exigibility filter, try without it
            if not tax and tax_exigibility:
                tax = self.env['account.tax'].search(base_domain + [('price_include', '=', False)], limit=1)
                if not tax:
                    tax = self.env['account.tax'].search(base_domain + [('price_include', '=', True)], limit=1)

            if not tax:
                logs.append(
                    _("Could not retrieve the tax: %(amount)s %% for line '%(line)s'.",
                      amount=amount,
                      line=line_values['name']),
                )
            else:
                taxes.append(tax.id)
                if tax.price_include:
                    line_values['price_unit'] *= (1 + tax.amount / 100)
        return taxes, logs

    def _import_invoice_lines(self, invoice, tree, xpath, qty_factor):
        # Override to work with Croatian tax exigibility flag
        tax_exigibility = 'on_payment' if tree.find('.//{*}HRObracunPDVPoNaplati') is not None else 'on_invoice'
        logs = []
        lines_values = []
        for line_tree in tree.iterfind(xpath):
            line_values = self.with_company(invoice.company_id)._retrieve_invoice_line_vals(line_tree, invoice.move_type, qty_factor)
            line_values['tax_ids'], tax_logs = self._retrieve_taxes(
                invoice, line_values, invoice.journal_id.type, tax_exigibility
            )
            logs += tax_logs
            if not line_values['product_uom_id']:
                line_values.pop('product_uom_id')  # if no uom, pop it so it's inferred from the product_id
            lines_values.append(line_values)
            lines_values += self._retrieve_line_charges(invoice, line_values, line_values['tax_ids'])
        return lines_values, logs

    def _retrieve_line_vals(self, tree, document_type=False, qty_factor=1):
        line_values = super()._retrieve_line_vals(tree, document_type, qty_factor)
        kpd_category_code = tree.findtext('./{*}Item/{*}CommodityClassification/{*}ItemClassificationCode')
        if kpd_category_code:
            line_kpd_category = self.env['l10n_hr.kpd.category'].search([('name', '=', kpd_category_code)], limit=1)
            if line_kpd_category:
                line_values.update({
                    'l10n_hr_kpd_category_id': line_kpd_category.id,
                })
        return line_values

    def _retrieve_rejection_reference(self, attachment):
        string_to_find = b'Rejected</cbc:StatusReasonCode>'
        if string_to_find in attachment['raw']:
            tree = etree.fromstring(attachment['raw'])  # type: ignore[attr-defined]
            reason_node = tree.findtext('.//{*}Response/{*}Status/{*}StatusReason')
            if "Electronic ID:" in reason_node:
                original_document_id = reason_node[reason_node.find("Electronic ID:") + 15:reason_node.find("Electronic ID:") + 22]
                return (original_document_id, reason_node)
            return 'not_found'
        return False

    def _get_povnak_tax_totals(self, vals):
        """Aggregate povratna naknada amounts on base lines."""
        AccountTax = self.env['account.tax']

        def grouping_function(base_line, tax_data):
            if tax_data and self._is_hr_povnak_tax(tax_data['tax']):
                return True

        aggregated = AccountTax._aggregate_base_lines_tax_details(vals['base_lines'], grouping_function)
        return AccountTax._aggregate_base_lines_aggregated_values(aggregated).get(True)

    def _get_povnak_charge_info(self, vals):
        """Return (amount, reason, name, currency) for PN document charge."""
        currency = vals['currency_id']
        pn_totals = self._get_povnak_tax_totals(vals) or {}
        # Prefer tax amount (the PN fee) as charge value; fallback to base if needed.
        raw_amount = pn_totals.get('tax_amount_currency') or pn_totals.get('base_amount_currency') or 0.0
        if isinstance(raw_amount, list):
            raw_amount = raw_amount[0] if raw_amount else 0.0
        amount = float(raw_amount or 0.0)
        invoice = vals['invoice']
        pn_tax = invoice.invoice_line_ids.tax_ids.filtered(
            lambda t: getattr(t, 'l10n_hr_tax_category_id', False)
            and t.l10n_hr_tax_category_id.name == 'HR:POVNAK'
        )[:1]
        name = pn_tax.l10n_hr_tax_category_id.name if pn_tax else 'HR:POVNAK'
        reason = (
            html2plaintext(pn_tax.invoice_legal_notes)
            if pn_tax and pn_tax.invoice_legal_notes
            else "Povratna naknada nije predmet oporezivanja prema Zakonu o PDVu, članak 33. stavak 3."
        )
        return amount, reason, name, currency

    @staticmethod
    def _is_hr_povnak_tax(tax):
        return bool(
            tax
            and getattr(tax, 'l10n_hr_tax_category_id', False)
            and tax.l10n_hr_tax_category_id.name == 'HR:POVNAK'
        )
    # Override the node 'cbc:AllowanceChargeReasonCode' in 'cac:AllowanceCharge' to include fields that are needed for HR
    def _ubl_get_line_allowance_charge_recycling_contribution_node(self, vals, recycling_contribution_values):
        currency = recycling_contribution_values['currency']
        amount = recycling_contribution_values['amount']
        return {
            '_currency': currency,
            'cbc:ChargeIndicator': {'_text': 'true' if amount > 0.0 else 'false'},
            'cbc:AllowanceChargeReason': {'_text': '#HR:POVNAK#Povratna naknada'},
            'cbc:Amount': {
                '_text': FloatFmt(abs(amount), max_dp=currency.decimal_places),
                'currencyID': currency.name,
            },
            'cac:TaxCategory': {
                'cbc:ID': {'_text': 'E'},
                'cbc:Name': {'_text': 'HR:POVNAK'},
                'cbc:Percent': {'_text': 0.0},
                'cbc:TaxExemptionReason': {'_text': 'Povratna naknada'},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'VAT'},
                },
            },
        }
