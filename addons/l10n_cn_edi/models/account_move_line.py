# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    # ------------------
    # Fields declaration
    # ------------------

    l10n_cn_tax_category_id = fields.Many2one(
        string="Tax Category Code",
        comodel_name='l10n_cn_edi.tax.category',
        compute="_compute_l10n_cn_tax_category_id",
        store=True,
        readonly=False,
        copy=True,
    )

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    @api.depends("product_id")
    def _compute_l10n_cn_tax_category_id(self):
        """ Default to the product classification if any """
        for line in self:
            line.l10n_cn_tax_category_id = line.product_id.product_tmpl_id.l10n_cn_tax_category_id if line.product_id else False

    @api.model_create_multi
    def create(self, vals_list):
        self.env['account.move'].browse({vals['move_id'] for vals in vals_list if vals.get('move_id')})._l10n_cn_edi_check_red_lock()
        return super().create(vals_list)

    def write(self, vals):
        if not vals.keys() <= {'sequence'}:
            self.move_id._l10n_cn_edi_check_red_lock()
            if vals.get('move_id'):
                self.env['account.move'].browse(vals['move_id'])._l10n_cn_edi_check_red_lock()
        return super().write(vals)

    def unlink(self):
        self.move_id._l10n_cn_edi_check_red_lock()
        return super().unlink()
