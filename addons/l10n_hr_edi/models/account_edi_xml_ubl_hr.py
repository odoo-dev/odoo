# UBL structure for CIUS HR
# Updated to work with but doesn't entirely follow the full structure of the UBL rework
# implemented in commit a3c6e5abe0d964f0768de68d526905ae3dccac8a

from odoo import models
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

    def _pint_add_values(self, vals, invoice):
        super()._pint_add_values(vals, invoice)
        vals['_pint_values']['model'] = self.env['account.edi.ubl_pint_eu_hr']

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
                                    'cbc:TaxExemptionReasonCode': {},
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
        # Overriding the node as it appears to be localization-specific
        template['ext:UBLExtensions'] = ext_template
        return template

    def _get_document_nsmap(self, vals):
        nsmap = super()._get_document_nsmap(vals)
        nsmap.update({
            'hrextac': "urn:mfin.gov.hr:schema:xsd:HRExtensionAggregateComponents-1",
        })
        return nsmap

    def _export_invoice_constraints_new(self, invoice, vals):
        # OVERRIDE 'account.edi.xml.ubl_bis3': don't apply Peppol rules
        constraints = self.env['account.edi.xml.ubl_20']._export_invoice_constraints(invoice, vals)
        constraints.update(
            self._invoice_constraints_cen_en16931_ubl_new(invoice, vals)
        )
        constraints.update(
            self._invoice_constraints_eracun_new(invoice, vals)
        )
        return constraints

    def _invoice_constraints_eracun_new(self, invoice, vals):
        # Corresponds to Croatian eRacun format constrains
        constraints = {}
        if vals['document_type'] in ['invoice', 'credit_note']:
            for node in vals['document_node']['cac:PaymentMeans']:
                payee_account = node.get('cac:PayeeFinancialAccount')
                if payee_account and any(char.isspace() for char in payee_account['cbc:ID']['_text']):
                    constraints['ubl_hr_br_1'] = self.env._("HR-BR-1: The account number must not contain whitespace characters.")
            if invoice.amount_residual > 0 and not invoice.invoice_date_due:
                constraints.update({'ubl_hr_br_4': self.env._("HR-BT-4: In the case of a positive amount due for payment (BT-115), the payment due date (BT-9) must be specified.")})
            constraints.update({
                'ubl_hr_br_7_seller_email_required': (
                    self.env._("The Seller's e-mail must be provided.")
                ) if not vals['document_node']['cac:AccountingSupplierParty']['cac:Party']['cac:Contact']['cbc:ElectronicMail'].get('_text') else None,
                'ubl_hr_br_10_buyer_email_required': (
                    self.env._("The Buyer's e-mail must be provided.")
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
        self._add_hr_extension_node(document_node)
        return document_node

    def _add_hr_extension_node(self, document_node):
        """
        This function constructs hrextac node from existing data within the document.
        The structure mostly follows that of 'cac:TaxTotal' node of a UBL 2.1/BIS 3 document,
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

    def _add_invoice_accounting_supplier_party_nodes(self, document_node, vals):
        super()._add_invoice_accounting_supplier_party_nodes(document_node, vals)
        # HR-BR-37: Invoice must contain HR-BT-4: Operator code in accordance with the Fiscalization Act.
        # HR-BR-9: Invoice must contain HR-BT-5: Operator OIB in accordance with the Fiscalization Act.
        invoice = vals['invoice']
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

    def _setup_base_lines(self, vals):
        # EXTENDS account.edi.xml.ubl_bis3
        super()._setup_base_lines(vals)
        for base_line in vals['base_lines']:
            if base_line.get('record') and 'l10n_hr_kpd_category_id' in base_line['record']._fields:
                base_line['cg_item_classification_code'] = base_line['record'].l10n_hr_kpd_category_id

    def _import_ubl_invoice_write_collected_values(self, collected_values):
        # EXTENDS account.edi.xml.ubl_bis3
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
        # EXTENDS account.edi.xml.ubl_bis3
        tax_values = super()._import_ubl_invoice_line_prepare_classified_tax_category_tax_values(collected_values, tax_category_tree)
        if tax_values:
            tax_values['tax_exigibility'] = 'on_payment' if tax_category_tree.find('.//{*}HRObracunPDVPoNaplati') is not None else 'on_invoice'
        return tax_values

    def _retrieve_rejection_reference(self, attachment):
        string_to_find = b'Rejected</cbc:StatusReasonCode>'
        if string_to_find in attachment['raw']:
            tree = etree.fromstring(attachment['raw'])
            reason_node = tree.findtext('.//{*}Response/{*}Status/{*}StatusReason')
            if "Electronic ID:" in reason_node:
                original_document_id = reason_node[reason_node.find("Electronic ID:") + 15:reason_node.find("Electronic ID:") + 22]
                return (original_document_id, reason_node)
            return 'not_found'
        return False
