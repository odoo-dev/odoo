from odoo import api, fields, models


class SaleOrderLine(models.Model):
    _inherit = "sale.order.line"

    l10n_in_unit_price_after_discount = fields.Float(
        string="Unit Price After Discount",
        compute='_compute_l10n_in_unit_price_after_discount',
        store=True, precompute=True,
        digits='Product Price',
    )

    @api.depends('discount', 'price_unit')
    def _compute_l10n_in_unit_price_after_discount(self):
        indian_sale_lines = self.filtered(lambda l: l.tax_country_id.code == 'IN')
        (self - indian_sale_lines).l10n_in_unit_price_after_discount = 0.0
        for line in indian_sale_lines:
            if line.discount:
                line.l10n_in_unit_price_after_discount = line.price_unit * (1 - (line.discount / 100))
            else:
                line.l10n_in_unit_price_after_discount = line.price_unit

    @api.depends('l10n_in_unit_price_after_discount', 'order_id.fiscal_position_id')
    def _compute_tax_ids(self):
        lines_apply_tax_based_on_hsn = self.filtered(lambda l:
            l.tax_country_id.code == 'IN' and
            l.product_id and
            l.product_id.l10n_in_threshold_limit and l.product_id.l10n_in_hsn_based_tax_id and
            l.l10n_in_unit_price_after_discount > l.product_id.l10n_in_threshold_limit
        )

        for line in lines_apply_tax_based_on_hsn:
            fpos = line.order_id.fiscal_position_id
            line.tax_ids = fpos and fpos.map_tax(line.product_id.l10n_in_hsn_based_tax_id) or line.product_id.l10n_in_hsn_based_tax_id

        # For the rest, fallback to default Odoo computation
        super(SaleOrderLine, self - lines_apply_tax_based_on_hsn)._compute_tax_ids()
