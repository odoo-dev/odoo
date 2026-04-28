from odoo import models


class AccountEdiXmlUBLBIS3(models.AbstractModel):
    _inherit = "account.edi.xml.ubl_bis3"

    def _can_export_selfbilling(self):
        # At the moment, self-billing is only supported for BIS3.
        return self._name == 'account.edi.xml.ubl_bis3'

    def _pint_add_values(self, vals, invoice):
        super()._pint_add_values(vals, invoice)
        if vals['process_type'] == 'selfbilling' and vals['document_type'] in ('invoice', 'credit_note'):
            vals['_pint_values']['pint_doc_type'] = f"self_{vals['document_type']}"  # 'self_invoice' or 'self_credit_note'
            vals['_pint_values']['model'] = self.env['account.edi.ubl_pint_eu']

    def _add_invoice_config_vals(self, vals):
        # EXTENDS account.edi.ubl_bis3
        vals['process_type'] = 'selfbilling' if vals['invoice'].is_purchase_document() and self._can_export_selfbilling() else 'billing'
        super()._add_invoice_config_vals(vals)
        if vals['process_type'] != 'selfbilling':
            return

        customer = vals['customer']
        supplier = vals['supplier']
        vals['supplier'] = customer
        vals['customer'] = supplier
        vals['delivery'] = supplier.child_ids.filtered(lambda p: p.type == 'delivery')[:1] or supplier
