from odoo import api, fields, models


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    l10n_sg_ubl_line_item_ref = fields.Char(
        string="Order Line Reference",
        compute='_compute_l10n_sg_ubl_line_item_ref',
    )

    @api.depends('sale_line_ids.l10n_sg_ubl_line_item_ref')
    def _compute_l10n_sg_ubl_line_item_ref(self):
        for line in self:
            sale_lines = line.sale_line_ids.filtered('l10n_sg_ubl_line_item_ref')
            line.l10n_sg_ubl_line_item_ref = sale_lines[0].l10n_sg_ubl_line_item_ref if sale_lines else False
