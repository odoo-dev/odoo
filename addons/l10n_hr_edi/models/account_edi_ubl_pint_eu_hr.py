from odoo import fields, models
from odoo.addons.account_edi_ubl_cii.models.account_edi_common import documents
from odoo.tools import html2plaintext


class AccountEdiUBLPintHR(models.AbstractModel):
    _name = 'account.edi.ubl_pint_eu_hr'
    _inherit = 'account.edi.ubl_pint_eu'
    _description = "UBL PINT-EU-HR Layer"

    @documents(['pint_eu_hr_invoice', 'pint_eu_hr_credit_note'])
    def _ubl_add_id_node__pint_eu_hr_base(self, vals):
        # EXTENDS account.edi.ubl_pint_eu
        super()._ubl_add_id_node(vals)
        invoice = vals.get('invoice')
        if not invoice:
            return
        # For Croatia, ID should be the Croatian-format fiscalization number
        vals['document_node']['cbc:ID']['_text'] = invoice.l10n_hr_fiscalization_number

    @documents(['pint_eu_hr_invoice', 'pint_eu_hr_credit_note'])
    def _ubl_add_customization_id_node__pint_eu_hr_base(self, vals):
        # EXTENDS account.edi.ubl_pint_eu
        super()._ubl_add_customization_id_node(vals)
        vals['document_node']['cbc:CustomizationID']['_text'] = 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0'

    @documents(['pint_eu_hr_invoice', 'pint_eu_hr_credit_note'])
    def _ubl_add_profile_id_node__pint_eu_hr_base(self, vals):
        # EXTENDS account.edi.ubl_pint_eu
        super()._ubl_add_profile_id_node(vals)
        invoice = vals.get('invoice')
        if not invoice:
            return
        # HR-BR-34: The process label MUST be specified.
        if invoice.l10n_hr_process_type == 'P99':
            vals['document_node']['cbc:ProfileID']['_text'] = f"P99:{invoice.l10n_hr_customer_defined_process_name}"
        else:
            vals['document_node']['cbc:ProfileID']['_text'] = invoice.l10n_hr_process_type

    @documents(['pint_eu_hr_invoice', 'pint_eu_hr_credit_note'])
    def _ubl_add_issue_date_node__pint_eu_hr_base(self, vals):
        # EXTENDS account.edi.ubl_pint_eu
        super()._ubl_add_issue_date_node(vals)
        invoice = vals.get('invoice')
        if not invoice:
            return
        # HR-BT-2: The invoice must have an invoice issuance time.
        issue_date_str, issue_time_str = fields.Datetime.to_string(invoice.l10n_hr_invoice_sending_time).split()
        vals['document_node']['cbc:IssueDate']['_text'] = issue_date_str
        vals['document_node']['cbc:IssueTime']['_text'] = issue_time_str

    @documents(['pint_eu_hr_invoice'])
    def _ubl_add_invoice_type_code_node__pint_eu_hr_invoice(self, vals):
        # EXTENDS account.edi.ubl_pint_eu
        super()._ubl_add_invoice_type_code_node(vals)
        invoice = vals.get('invoice')
        if not invoice:
            return
        if (
            invoice.l10n_hr_process_type in ('P4', 'P6')
            and invoice.move_type == 'out_invoice'
        ):
            vals['document_node']['cbc:InvoiceTypeCode']['_text'] = '386'

    @documents(['pint_eu_hr_credit_note'])
    def _ubl_add_credit_note_type_code_node__pint_eu_hr_credit_note(self, vals):
        # EXTENDS account.edi.ubl_pint_credit_note
        super()._ubl_add_credit_note_type_code_node(vals)
        invoice = vals.get('invoice')
        if not invoice:
            return
        if (
                invoice.l10n_hr_process_type in ('P4', 'P6')
                and invoice.move_type == 'out_refund'
        ):
            vals['document_node']['cbc:CreditNoteTypeCode']['_text'] = '386'
        elif invoice.l10n_hr_process_type == 'P9':
            vals['document_node']['cbc:CreditNoteTypeCode']['_text'] = '381'

    @documents(['pint_eu_hr_credit_note'])
    def _ubl_add_billing_reference_nodes__pint_eu_hr_credit_note(self, vals):
        # EXTENDS account.edi.ubl_pint_credit_note
        super()._ubl_add_billing_reference_nodes(vals)
        invoice = vals.get('invoice')
        if not invoice:
            return
        # HR-BT-3: Note on previous invoice
        # HR-BR-6: Each previous invoice reference (BG-3) must have the date of issue of the previous invoice (BT-26).
        if 'refund' in invoice.move_type and invoice.reversed_entry_id:
            vals['document_node']['cac:BillingReference'] = [{
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {'_text': invoice.ref},
                    'cbc:IssueDate': {'_text': invoice.reversed_entry_id.invoice_date},
                },
            }]

    @documents(['pint_eu_hr_invoice', 'pint_eu_hr_credit_note'])
    def _ubl_default_tax_category_grouping_key__pint_eu_hr_base(self, base_line, tax_data, vals, currency):
        # EXTENDS account.edi.ubl_pint_eu
        grouping_key = super()._ubl_default_tax_category_grouping_key(base_line, tax_data, vals, currency)
        if not grouping_key or not tax_data:
            return

        tax = tax_data['tax']
        hr_category = tax.l10n_hr_tax_category_id if tax else None

        if (
            tax.l10n_hr_tax_category_id
            and tax.amount_type == 'percent'
            and not tax.amount
        ):
            grouping_key.update({
                'tax_category_code': tax.l10n_hr_tax_category_id.code_untdid
            })
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
        import logging; from rich.pretty import install; install(); logging.getLogger('odoo.tests.common').setLevel(logging.ERROR); breakpoint()
        return grouping_key

    @documents(['pint_eu_hr_invoice', 'pint_eu_hr_credit_note'])
    def _ubl_get_tax_category_node__pint_eu_hr_base(self, vals, tax_category):
        # EXTENDS account.edi.ubl_pint_eu
        node = super()._ubl_get_tax_category_node(vals, tax_category)
        node['cbc:Name']['_text'] = tax_category['hr_category_name']
        node['hrextac:HRObracunPDVPoNaplati'] = {'_text': tax_category['invoice_legal_notes_str']}
        return node

    @documents(['pint_eu_hr_invoice', 'pint_eu_hr_credit_note'])
    def _ubl_get_line_item_node_classified_tax_category_node__pint_eu_hr_base(self, vals, tax_category):
        # EXTENDS account.edi.ubl_pint_eu
        node = super()._ubl_get_line_item_node_classified_tax_category_node(vals, tax_category)
        node['cbc:Name']['_text'] = tax_category['hr_category_name']
        node['cbc:TaxExemptionReasonCode']['_text'] = tax_category.get('tax_exemption_reason_code')
        node['cbc:TaxExemptionReason']['_text'] = tax_category.get('tax_exemption_reason')
        return node

    @documents(['pint_eu_hr_invoice', 'pint_eu_hr_credit_note'])
    def _ubl_add_copy_indicator_node__pint_eu_hr_base(self, vals):
        # EXTENDS account.edi.xml.ubl_bis3
        super()._ubl_add_copy_indicator_node(vals)
        invoice = vals.get('invoice')
        if not invoice:
            return

        # HR-BT-1: Copy indicator - is the invoice the original or already sent
        #   This doesn't appear to be currently supported in Odoo, and is set to 'false' in TR localization using a similar format
        vals['document_node']['cbc:CopyIndicator']['_text'] = 'false'

    @documents(['pint_eu_hr_invoice', 'pint_eu_hr_credit_note'])
    def _ubl_add_party_endpoint_id_node__pint_eu_hr_base(self, vals):
        # EXTENDS account.edi.ubl_bis3
        super()._ubl_add_party_endpoint_id_node(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        if commercial_partner.l10n_hr_personal_oib:
            endpoint = commercial_partner.l10n_hr_personal_oib
            scheme_id = '9934'
        elif commercial_partner.company_registry:
            endpoint = commercial_partner.company_registry
            scheme_id = '0088'
        else:
            endpoint = commercial_partner.vat.strip('HR')
            scheme_id = '9934'
        vals['party_node']['cbc:EndpointID']['_text'] = endpoint
        vals['party_node']['cbc:EndpointID']['schemeID'] = scheme_id

    @documents(['pint_eu_hr_invoice', 'pint_eu_hr_credit_note'])
    def _ubl_add_party_identification_nodes__pint_eu_hr_base(self, vals):
        # EXTENDS account.edi.ubl_bis3
        super()._ubl_add_party_identification_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        if commercial_partner.l10n_hr_business_unit_code:
            bu_code = '::HR99:' + commercial_partner.l10n_hr_business_unit_code
        else:
            bu_code = ''
        if commercial_partner.l10n_hr_personal_oib:
            ident = '9934:' + commercial_partner.l10n_hr_personal_oib + bu_code
        elif commercial_partner.company_registry:
            ident = '0088:' + commercial_partner.company_registry
        else:
            ident = '9934:' + commercial_partner.vat.strip('HR') + bu_code
        vals['party_node']['cac:PartyIdentification'] = [{
            'cbc:ID': {
                '_text': ident,
                'schemeID': None,
            },
        }]
