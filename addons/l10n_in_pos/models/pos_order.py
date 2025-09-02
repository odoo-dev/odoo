from odoo import models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def _prepare_product_aml_dict(self, base_line_vals, update_base_line_vals, rate, sign):
        res = super()._prepare_product_aml_dict(base_line_vals, update_base_line_vals, rate, sign)
        if self.company_id.account_fiscal_country_id.code == 'IN':
            res.update({
                'l10n_in_hsn_code': base_line_vals['l10n_in_hsn_code'],
            })
            product = base_line_vals.get('product_id')
            if product and product.l10n_in_threshold_limit and base_line_vals.get('l10n_in_unit_price_after_discount', 0) > product.l10n_in_threshold_limit:
                res['tax_ids'] = product.l10n_in_hsn_based_tax_id
        return res

    def _process_order(self, order, existing_order):
        order_id = super()._process_order(order, existing_order)
        order = self.browse(order_id)
        for line in order.lines:
            if line.product_id.l10n_in_threshold_limit and line.l10n_in_unit_price_after_discount > line.product_id.l10n_in_threshold_limit:
                line.tax_ids = line.product_id.l10n_in_hsn_based_tax_id
        return order_id
