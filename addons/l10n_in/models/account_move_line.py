import re

from odoo import _, api, fields, models
from odoo.exceptions import UserError


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    ignore_quantity = fields.Boolean(string="Ignore Quantity", help="Igonore quanity and use Unit Price as Total Amount.")
    l10n_in_hsn_code = fields.Char(string="HSN/SAC Code", compute="_compute_l10n_in_hsn_code", store=True, readonly=False, copy=False)

    # withholding related fields
    l10n_in_withhold_tax_amount = fields.Monetary(string="TDS Tax Amount", compute='_compute_l10n_in_withhold_tax_amount')
    l10n_in_tds_tcs_section_id = fields.Many2one(related="account_id.l10n_in_tds_tcs_section_id")

    @api.depends('tax_ids')
    def _compute_l10n_in_withhold_tax_amount(self):
        # Compute the withhold tax amount for the withholding lines
        withholding_lines = self.filtered('move_id.l10n_in_is_withholding')
        (self - withholding_lines).l10n_in_withhold_tax_amount = False
        for line in withholding_lines:
            line.l10n_in_withhold_tax_amount = line.currency_id.round(abs(line.price_total - line.price_subtotal))

    @api.depends('product_id', 'product_id.l10n_in_hsn_code')
    def _compute_l10n_in_hsn_code(self):
        for line in self:
            if line.move_id.country_code == 'IN' and line.parent_state == 'draft':
                line.l10n_in_hsn_code = line.product_id.l10n_in_hsn_code

    def _l10n_in_check_invalid_hsn_code(self):
        self.ensure_one()
        hsn_code = self.env['account.move']._l10n_in_extract_digits(self.l10n_in_hsn_code)
        if not hsn_code:
            return _("HSN code is not set in product line %(name)s", name=self.name)
        elif not re.match(r'^\d{4}$|^\d{6}$|^\d{8}$', hsn_code):
            return _(
                "Invalid HSN Code (%(hsn_code)s) in product line %(product_line)s",
                hsn_code=hsn_code,
                product_line=self.product_id.name or self.name
            )
        return False

    @api.onchange('ignore_quantity')
    def _onchange_ignore_quantity(self):
        for line in self:
            line.quantity = 0.0 if line.ignore_quantity else 1.0

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('ignore_quantity'):
                vals['quantity'] = 0.0
        return super().create(vals_list)

    def write(self, vals):
        if vals.get('ignore_quantity'):
            vals['quantity'] = 0.0
        return super().write(vals)

    @api.depends('ignore_quantity')
    def _compute_totals(self):
        super()._compute_totals()

    @api.constrains('ignore_quantity')
    def _check_ignore_quantity(self):
        if any(line.ignore_quantity and not (line.move_type in ['in_refund', 'out_refund'] or line.move_id.debit_origin_id) for line in self):
            raise UserError(_("Cannot ignore quantity for a non-refund line."))
