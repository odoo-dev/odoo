from odoo import api, fields, models


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    l10n_in_hsn_code = fields.Char(string="HSN/SAC Code", compute="_compute_l10n_in_hsn_code", store=True, readonly=False, copy=False)

    @api.depends('product_id', 'product_id.l10n_in_hsn_code')
    def _compute_l10n_in_hsn_code(self):
        for line in self:
            if line.move_id.country_code == 'IN' and line.parent_state == 'draft':
                line.l10n_in_hsn_code = line.product_id.l10n_in_hsn_code

    # Internal Tax fields
    l10n_in_line_tax_rate = fields.Float()
    l10n_in_line_sgst_amt = fields.Monetary()
    l10n_in_line_cgst_amt = fields.Monetary()
    l10n_in_line_igst_amt = fields.Monetary()
    l10n_in_line_cess_amt = fields.Monetary()
