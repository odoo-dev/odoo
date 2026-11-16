# UBL structure for CIUS HR (HR-CIUS 2025 + HR extension 2025)

from lxml import etree

from odoo import fields, models
from odoo.tools import html2plaintext


class AccountEdiXmlUBLHR(models.AbstractModel):
    """ Croatian CIUS of the European norm EN 16931 (HR-CIUS 2025) with its extension (HR-EXT 2025), in UBL 2.1.

    The CustomizationID 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0'
    declares the compliance with EN 16931 and the Croatian CIUS/extension only: it is not a Peppol BIS Billing 3.0
    extension and the documents are exchanged through the Croatian information intermediaries (e.g. moj-eRačun), not
    Peppol. The format is thus built on the EN 16931 UBL syntax binding ('account.edi.ubl_cen_en16931') and only adds
    the Croatian rules (HR-BR-*) and the HRFISK20Data extension.

    * Specification: "Specifikacija osnovne uporabe eRačuna s proširenjima" (HR-CIUS/HR-EXT 2025), published by the
      Croatian Tax Administration (Porezna uprava, Fiskalizacija 2.0): https://www.porezna-uprava.hr
    * EN 16931 validation artefacts: https://github.com/ConnectingEurope/eInvoicing-EN16931
    """
    _name = 'account.edi.xml.ubl_hr'
    _inherit = ['account.edi.ubl_cen_en16931']
    _description = "CIUS HR"

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_ubl_hr.xml"

    def _get_customization_id(self, process_type='billing'):
        # EXTENDS account.edi.ubl
        if process_type == 'billing':
            return 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0'
        return super()._get_customization_id(process_type=process_type)

    # -------------------------------------------------------------------------
    # EXPORT: Values
    # -------------------------------------------------------------------------

    def _ubl_prepare_base_lines(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_prepare_base_lines(vals)
        # The KPD classification (BT-158, listID 'CG') may be set on the invoice line itself.
        for base_line in vals['base_lines']:
            record = base_line.get('record')
            if isinstance(record, models.Model) and 'l10n_hr_kpd_category_id' in record._fields:
                base_line['cg_item_classification_code'] = record.l10n_hr_kpd_category_id

    def _fill_nsmap_values(self, vals):
        # EXTENDS account.edi.ubl
        super()._fill_nsmap_values(vals)
        vals['document_node']['_nsmap']['hrextac'] = "urn:mfin.gov.hr:schema:xsd:HRExtensionAggregateComponents-1"

    def _fill_document_values(self, vals):
        # EXTENDS account.edi.ubl
        super()._fill_document_values(vals)
        if self._is_document(vals, 'invoice', 'credit_note'):
            # HRFISK20Data extension support
            self._add_hr_extension_node(vals['document_node'])

    def _ubl_add_version_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # The UBL version is not part of the EN 16931 semantic model: not reported (UBL-CR-002 tolerates '2.1').
        super()._ubl_add_version_id_node(vals)
        vals['document_node']['cbc:UBLVersionID']['_text'] = None

    # -------------------------------------------------------------------------
    # EXPORT: Constraints
    # -------------------------------------------------------------------------

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.ubl_cen_en16931
        constraints = super()._export_document_constraints(vals)
        constraints.update(self._invoice_constraints_eracun_new(vals))
        return constraints

    def _invoice_constraints_eracun_new(self, vals):
        # Corresponds to Croatian eRacun format constrains
        constraints = {}
        if self._is_document(vals, 'invoice', 'credit_note'):
            invoice = vals['invoice']
            document_node = vals['document_node']
            supplier_node = document_node['cac:AccountingSupplierParty']
            customer_party_node = document_node['cac:AccountingCustomerParty']['cac:Party']
            for node in document_node['cac:PaymentMeans']:
                payee_account = node.get('cac:PayeeFinancialAccount')
                if payee_account and any(char.isspace() for char in payee_account['cbc:ID']['_text']):
                    constraints['ubl_hr_br_1'] = self.env._("HR-BR-1: The account number must not contain whitespace characters.")
            if invoice.amount_residual > 0 and not invoice.invoice_date_due:
                constraints.update({'ubl_hr_br_4': self.env._("HR-BT-4: In the case of a positive amount due for payment (BT-115), the payment due date (BT-9) must be specified.")})
            constraints.update({
                'ubl_hr_br_7_seller_email_required': (
                    self.env._("The Seller's e-mail must be provided.")
                ) if not supplier_node['cac:Party']['cac:Contact']['cbc:ElectronicMail'].get('_text') else None,
                'ubl_hr_br_10_buyer_email_required': (
                    self.env._("The Buyer's e-mail must be provided.")
                ) if not customer_party_node['cac:Contact']['cbc:ElectronicMail'].get('_text') else None,
                'ubl_hr_br_s_buyer_vat_required': (
                    self.env._("The invoice must contain the Customer's VAT identification number (BT-48).")
                ) if any(not item['cbc:CompanyID'].get('_text') for item in customer_party_node['cac:PartyTaxScheme']) else None,
                'ubl_hr_br_37_operator_label_required': (
                    self.env._("The invoice must contain the Operator Label (HR-BT-4).")
                ) if not supplier_node['cac:SellerContact']['cbc:Name'].get('_text') else None,
                'ubl_hr_br_9_operator_oib_required': (
                    self.env._("The invoice must contain the Operator OIB (HR-BT-5).")
                ) if not supplier_node['cac:SellerContact']['cbc:ID'].get('_text') else None,
            })
        return constraints

    # -------------------------------------------------------------------------
    # EXPORT: Header nodes
    # -------------------------------------------------------------------------

    def _ubl_add_id_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_id_node(vals)
        if self._is_document(vals, 'invoice', 'credit_note'):
            # For Croatia, ID should be the Croatian-format fiscalization number
            vals['document_node']['cbc:ID']['_text'] = vals['invoice'].l10n_hr_fiscalization_number

    def _ubl_add_profile_id_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_profile_id_node(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return

        # HR-BR-34: The process label MUST be specified. Values P1-P12 or P99:Customer ID from Table 4 Business Process Types are used.
        invoice = vals['invoice']
        if invoice.l10n_hr_process_type == 'P99':
            vals['document_node']['cbc:ProfileID']['_text'] = f"P99:{invoice.l10n_hr_customer_defined_process_name}"
        else:
            vals['document_node']['cbc:ProfileID']['_text'] = invoice.l10n_hr_process_type

    def _ubl_add_copy_indicator_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_copy_indicator_node(vals)
        if self._is_document(vals, 'invoice', 'credit_note'):
            # HR-BT-1: Copy indicator - is the invoice the original or already sent
            #   This doesn't appear to be currently supported in Odoo, and is set to 'false' in TR localization using a similar format
            vals['document_node']['cbc:CopyIndicator']['_text'] = 'false'

    def _ubl_add_issue_date_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_issue_date_node(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return

        # HR-BT-2: The invoice must have an invoice issuance time.
        #   (in addition to BT-2: Date of issue)
        invoice = vals['invoice']
        issue_date_str, issue_time_str = fields.Datetime.to_string(invoice.l10n_hr_invoice_sending_time).split()
        vals['document_node']['cbc:IssueDate']['_text'] = issue_date_str
        vals['document_node']['cbc:IssueTime']['_text'] = issue_time_str

    def _ubl_add_invoice_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_invoice_type_code_node(vals)
        if not self._is_document(vals, 'invoice'):
            return

        # [BR-04] Invoice type code (BT-3): 380 (Commercial invoice), 386 (Prepayment invoice) for advance payments.
        invoice = vals['invoice']
        if invoice.l10n_hr_process_type in ('P4', 'P6') and invoice.move_type == 'out_invoice':
            vals['document_node']['cbc:InvoiceTypeCode']['_text'] = '386'
        else:
            vals['document_node']['cbc:InvoiceTypeCode']['_text'] = 380

    def _ubl_add_credit_note_type_code_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_credit_note_type_code_node(vals)
        if not self._is_document(vals, 'credit_note'):
            return

        # [BR-04] Invoice type code (BT-3): 381 (Credit note) by default.
        invoice = vals['invoice']
        node = vals['document_node']['cbc:CreditNoteTypeCode']
        node['_text'] = 381
        if invoice.l10n_hr_process_type in ('P4', 'P6') and invoice.move_type == 'out_refund':
            node['_text'] = '386'
        elif invoice.l10n_hr_process_type == 'P9':
            node['_text'] = '381'
        elif invoice.l10n_hr_process_type == 'P10':
            node['_text'] = '384'

    def _ubl_add_billing_reference_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_billing_reference_nodes(vals)
        if not self._is_document(vals, 'credit_note'):
            return

        # HR-BT-3: Note on previous invoice
        # HR-BR-6: Each previous invoice reference (BG-3) must have the date of issue of the previous invoice (BT-26).
        credit_note = vals['invoice']
        nodes = vals['document_node']['cac:BillingReference']
        if credit_note.reversed_entry_id:
            nodes.append({
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {'_text': credit_note.ref},
                    'cbc:IssueDate': {'_text': credit_note.reversed_entry_id.invoice_date},
                },
            })
        else:
            # The invoices reconciled with the credit note.
            payment_term_lines = credit_note.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable')
            for preceding_invoice in payment_term_lines.matched_credit_ids.credit_move_id.move_id:
                if preceding_invoice.name and preceding_invoice.name != '/':
                    nodes.append({
                        'cac:InvoiceDocumentReference': {
                            'cbc:ID': {'_text': preceding_invoice.name},
                            'cbc:IssueDate': {'_text': preceding_invoice.invoice_date},
                        },
                    })

    def _add_hr_extension_node(self, document_node):
        """
        This function constructs hrextac node from existing data within the document.
        The structure mostly follows that of 'cac:TaxTotal' node of a UBL 2.1 document,
        but requires additional data compared to the totals/subtotals nodes in UBL HR format.
        To avoid making additional queries and possible desyncs, we calculate all the data
        we need while assembling normal subtotals, then trim out the extra bits.
        """
        cash_basis_line = False
        tax_totals = document_node['cac:TaxTotal']
        hr_tax_totals = []
        for total in tax_totals:
            tax_subtotals = total['cac:TaxSubtotal']
            hr_tax_subtotals = []
            for subtotal in tax_subtotals:
                tax_categories = subtotal['cac:TaxCategory']
                hr_tax_categories = []
                for category in tax_categories:
                    # Cash basis is document-wide, so we do not need to keep it for each category
                    cash_basis_flag = category.pop('hrextac:HRObracunPDVPoNaplati')  # Ensure pop() always runs
                    cash_basis_line = cash_basis_line or cash_basis_flag
                    # Removing the HR-specific node from the normal subtotal where we calculate it
                    hr_tax_name = category.pop('cbc:Name')
                    hr_tax_categories.append({
                        'cbc:ID': category['cbc:ID'],
                        'cbc:Name': hr_tax_name,
                        'cbc:Percent': category['cbc:Percent'],
                        'cbc:TaxExemptionReasonCode': category['cbc:TaxExemptionReasonCode'],
                        'cbc:TaxExemptionReason': category['cbc:TaxExemptionReason'],
                        'hrextac:HRTaxScheme': category['cac:TaxScheme'] if hr_tax_name['_text'] != "HR:POVNAK" else {'_text': "OTH"},
                    })
                hr_tax_subtotals.append({
                    'cbc:TaxableAmount': subtotal['cbc:TaxableAmount'],
                    'cbc:TaxAmount': subtotal['cbc:TaxAmount'],
                    'hrextac:HRTaxCategory': hr_tax_categories.copy(),
                })
            hr_tax_totals.append({
                'cbc:TaxAmount': total['cbc:TaxAmount'],
                'hrextac:HRTaxSubtotal': hr_tax_subtotals.copy(),
            })
        out_of_scope_node = {
            'currencyID': document_node['cac:LegalMonetaryTotal']['cbc:TaxExclusiveAmount'].get('currencyID'),
            '_text': '0.00'     # Currently unsupported, a HR-specific workaround can potentially be made
        }
        document_node.update({
            'ext:UBLExtensions': {
                'ext:UBLExtension': {
                    'ext:ExtensionContent': {
                        'hrextac:HRFISK20Data': {
                            'hrextac:HRObracunPDVPoNaplati': cash_basis_line,
                            'hrextac:HRTaxTotal': hr_tax_totals,
                            'hrextac:HRLegalMonetaryTotal': {
                                'cbc:TaxExclusiveAmount': document_node['cac:LegalMonetaryTotal']['cbc:TaxExclusiveAmount'],
                                'hrextac:OutOfScopeOfVATAmount': out_of_scope_node,
                            }
                        }
                    },
                }
            }
        })

    # -------------------------------------------------------------------------
    # EXPORT: Party nodes
    # -------------------------------------------------------------------------

    def _ubl_add_party_endpoint_id_node(self, vals):
        # EXTENDS account.edi.ubl
        # Seller/Buyer electronic address (BT-34/BT-49): the OIB, with the scheme 9934 (Croatian VAT number).
        super()._ubl_add_party_endpoint_id_node(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        endpoint = commercial_partner.l10n_hr_personal_oib or commercial_partner.vat.strip('HR')
        vals['party_node']['cbc:EndpointID']['_text'] = endpoint
        vals['party_node']['cbc:EndpointID']['schemeID'] = '9934'

    def _ubl_add_party_identification_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_identification_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        if commercial_partner.l10n_hr_business_unit_code:
            bu_code = f'::HR99:{commercial_partner.l10n_hr_business_unit_code}'
        else:
            bu_code = ''
        if commercial_partner.l10n_hr_personal_oib:
            ident = f'9934:{commercial_partner.l10n_hr_personal_oib}{bu_code}'
        else:
            ident = f'9934:{commercial_partner.vat.strip("HR")}{bu_code}'
        vals['party_node']['cac:PartyIdentification'] = [{
            'cbc:ID': {
                '_text': ident,
                'schemeID': None,
            },
        }]

    def _ubl_add_accounting_supplier_party_node(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_accounting_supplier_party_node(vals)
        if not self._is_document(vals, 'invoice', 'credit_note'):
            return

        # HR-BR-37: Invoice must contain HR-BT-4: Operator code in accordance with the Fiscalization Act.
        # HR-BR-9: Invoice must contain HR-BT-5: Operator OIB in accordance with the Fiscalization Act.
        invoice = vals['invoice']
        vals['document_node']['cac:AccountingSupplierParty']['cac:SellerContact'] = {
            'cbc:ID': {'_text': invoice.l10n_hr_operator_oib},
            'cbc:Name': {'_text': invoice.l10n_hr_operator_name},
        }

    # -------------------------------------------------------------------------
    # EXPORT: Taxes
    # -------------------------------------------------------------------------

    def _get_tax_category_grouping_key(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.cen_en16931
        grouping_key = super()._get_tax_category_grouping_key(base_line, tax_data, vals, currency)
        if not grouping_key or not tax_data:
            return

        tax = tax_data['tax']
        hr_category = tax.l10n_hr_tax_category_id if tax else None

        # HR-BR-11: Each document-level expense (BG-21) that is not subject to VAT or is exempt from VAT must have
        # a document-level expense VAT category code (HR-BT-6) from table HR-TB-2 HR VAT category codes
        #   Instead of determining what the elements should be from the invoice details, here we directly use
        #   the data of the VAT expence category defined on the tax by the user
        if (
            tax.l10n_hr_tax_category_id
            and tax.amount_type == 'percent'
            and not tax.amount
        ):
            grouping_key.update({
                'tax_category_code': tax.l10n_hr_tax_category_id.code_untdid
            })
            # If account_edi_ubl_cii_tax_extension is installed and a value is specified, use that data, if not, override with HR data
            tax_extension = 'ubl_cii_tax_exemption_reason_code' in tax._fields and tax.ubl_cii_tax_exemption_reason_code
            if not tax_extension:
                grouping_key.update({'tax_exemption_reason': hr_category.description})

        if tax.tax_exigibility == 'on_payment':
            invoice_legal_notes_str = html2plaintext(tax.invoice_legal_notes or '') or "Obračun po naplaćenoj naknadi"
        else:
            invoice_legal_notes_str = None

        grouping_key.update({
            'hr_category_name': tax.l10n_hr_tax_category_id.name,
            'invoice_legal_notes_str': invoice_legal_notes_str,
        })
        return grouping_key

    def _ubl_get_tax_category_node(self, vals, tax_category):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_tax_category_node(vals, tax_category)
        node['cbc:Name']['_text'] = tax_category['hr_category_name']
        node['hrextac:HRObracunPDVPoNaplati'] = {'_text': tax_category['invoice_legal_notes_str']}
        return node

    def _ubl_get_line_item_node_classified_tax_category_node(self, vals, tax_category):
        # EXTENDS account.edi.ubl
        node = super()._ubl_get_line_item_node_classified_tax_category_node(vals, tax_category)
        node['cbc:Name']['_text'] = tax_category['hr_category_name']
        node['cbc:TaxExemptionReasonCode']['_text'] = tax_category.get('tax_exemption_reason_code')
        node['cbc:TaxExemptionReason']['_text'] = tax_category.get('tax_exemption_reason')
        return node

    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _import_ubl_invoice_write_collected_values(self, collected_values):
        # EXTENDS account.edi.ubl
        tree = collected_values['tree']
        profile_id = tree.findtext('./{*}ProfileID')
        to_write = collected_values['to_write']
        if profile_id:
            if (l10n_hr_process_type := profile_id[:3]) == 'P99':
                to_write['l10n_hr_process_type'] = l10n_hr_process_type
                to_write['l10n_hr_customer_defined_process_name'] = profile_id[4:]
            else:
                to_write['l10n_hr_process_type'] = profile_id
                to_write['l10n_hr_customer_defined_process_name'] = None

        super()._import_ubl_invoice_write_collected_values(collected_values)

        invoice = collected_values['invoice']
        invoice.l10n_hr_edi_addendum_id.write({'fiscalization_number': tree.findtext('./{*}ID')})

    def _import_ubl_invoice_line_prepare_classified_tax_category_tax_values(self, collected_values, tax_category_tree):
        # EXTENDS account.edi.ubl
        tax_values = super()._import_ubl_invoice_line_prepare_classified_tax_category_tax_values(collected_values, tax_category_tree)
        if tax_values:
            tax_values['tax_exigibility'] = 'on_payment' if tax_category_tree.find('.//{*}HRObracunPDVPoNaplati') is not None else 'on_invoice'
        return tax_values

    def _retrieve_rejection_reference(self, attachment):
        string_to_find = b'Rejected</cbc:StatusReasonCode>'
        raw = bytes(attachment['raw'])
        if string_to_find in raw:
            tree = etree.fromstring(raw)
            reason_node = tree.findtext('.//{*}Response/{*}Status/{*}StatusReason')
            if "Electronic ID:" in reason_node:
                original_document_id = reason_node[reason_node.find("Electronic ID:") + 15:reason_node.find("Electronic ID:") + 22]
                return (original_document_id, reason_node)
            return 'not_found'
        return False
