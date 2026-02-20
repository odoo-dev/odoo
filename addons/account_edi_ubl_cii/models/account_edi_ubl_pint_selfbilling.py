from odoo import models
from odoo.addons.account_edi_ubl_cii.models.account_edi_common import documents


class AccountEdiUblPintSelfbillingInvoice(models.AbstractModel):
    _name = "account.edi.ubl_pint_selfbilling"
    _inherit = 'account.edi.ubl_pint_eu'
    _description = "UBL PINT Self-Billing Invoice"

    @documents(['self_invoice', 'self_credit_note'])
    def _ubl_add_customization_id_node__self_base(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_customization_id_node(vals)
        vals['document_node']['cbc:CustomizationID']['_text'] = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0'

    @documents(['self_invoice', 'self_credit_note'])
    def _ubl_add_profile_id_node__self_base(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_profile_id_node(vals)
        vals['document_node']['cbc:ProfileID']['_text'] = 'urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0'

    @documents(['self_invoice'])
    def _ubl_add_invoice_type_code_node__self_invoice(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_invoice_type_code_node(vals)
        vals['document_node']['cbc:InvoiceTypeCode']['_text'] = 389

    @documents(['self_credit_note'])
    def _ubl_add_credit_note_type_code_node__self_credit_note(self, vals):
        # EXTENDS account.edi.ubl_pint_credit_note
        super()._ubl_add_credit_note_type_code_node(vals)
        vals['document_node']['cbc:CreditNoteTypeCode']['_text'] = 261
