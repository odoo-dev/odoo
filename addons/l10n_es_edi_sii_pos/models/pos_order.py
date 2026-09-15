from odoo import _, api, fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    l10n_es_sii_required = fields.Boolean(
        string="SII Required",
        related="company_id.l10n_es_sii_required"
    )

    l10n_es_invoice_type = fields.Selection(
        selection="l10n_es_refund_reason_selection",
        string="SII Refund Reason",
        copy=False
    )

    @api.model
    def _l10n_es_refund_reason_selection(self):
        return self.env['account.move']._l10n_es_refund_reason_selection()
    
    def _process_saved_order(self, draft):
        if self.l10n_es_sii_required and self.refund_order_id and not self.to_invoice:
            self.to_invoice = True
        return super()._process_saved_order(draft)

    def _prepare_invoice_vals(self):
        res = super()._prepare_invoice_vals()
        if not self.l10n_es_sii_required:
            return res
        
        if self.refunded_order_id and not self.l10n_es_invoice_type:
            raise UserError(_("You have to specify a refund reason"))
        
        res['l10n_es_invoice_type'] = self.l10n_es_invoice_type if self.refunded_order_id else 'F1' #Pq este else si no tiene, no va a dar error?
        return res
    

