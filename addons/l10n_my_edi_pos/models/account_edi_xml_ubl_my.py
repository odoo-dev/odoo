# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models


class AccountEdiXmlUBLMyInvoisMY(models.AbstractModel):
    _inherit = "account.edi.xml.ubl_myinvois_my"

    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    def _export_invoice_vals(self, invoice):
        # EXTENDS 'account_edi_ubl_cii'
        vals = super()._export_invoice_vals(invoice)

        # Support the unlikely case where we invoice a refund of an order included in a consolidated invoice.
        if invoice.move_type == 'out_refund' and invoice.pos_order_ids:
            # We only support one CN with one refund.
            refunded_order = invoice.pos_order_ids[0].refunded_order_id
            consolidated_invoice_id = refunded_order and refunded_order._get_active_consolidated_invoice()
            if consolidated_invoice_id:
                vals['vals'].update({
                    'billing_reference_vals': {
                        'id': consolidated_invoice_id.name,
                        'uuid': consolidated_invoice_id.myinvois_external_uuid,
                    },
                })

        return vals

    def _get_invoice_line_item_vals(self, line, taxes_vals):
        # EXTENDS 'account_edi_ubl_cii'
        vals = super()._get_invoice_line_item_vals(line, taxes_vals)
        # When the invoice is sent for the general public (refunding an order in a consolidated invoice/...) the item code
        # must be fixed to 004 (consolidated invoice) even if the product has something else set.
        if line.partner_id._l10n_my_edi_get_tin_for_myinvois() == 'EI00000000010':
            vals['commodity_classification_vals'][0]['item_classification_code'] = '004'
        return vals

    def _export_invoice_constraints(self, invoice, vals):
        # EXTENDS 'l10n_my_edi'
        constraints = super()._export_invoice_constraints(invoice, vals)
        # Ignore classification code errors if invoicing to the general public; the code is fixed.
        for line in invoice.invoice_line_ids.filtered(lambda line: line.display_type not in ('line_note', 'line_section')):
            to_general_public = line.partner_id._l10n_my_edi_get_tin_for_myinvois() == 'EI00000000010'
            if to_general_public:
                if f"myinvois_{line.product_id.id}_class_code_required" in constraints:
                    del constraints[f"myinvois_{line.product_id.id}_class_code_required"]
                if f"myinvois_{line.product_id.id}_class_code_required_line" in constraints:
                    del constraints[f"myinvois_{line.product_id.id}_class_code_required_line"]

        return constraints
