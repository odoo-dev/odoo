from odoo import fields, models, api


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    my_commission = fields.Float()
    is_commission = fields.Boolean(
        related='order_id.is_commission', store=True
    )

    @api.depends('product_uom_qty', 'discount', 'price_unit', 'tax_id', 'my_commission')
    def _compute_amount(self):
        super()._compute_amount()

    def _prepare_base_line_for_taxes_computation(self, **kwargs):
        self.ensure_one()
        base_line = super()._prepare_base_line_for_taxes_computation(**kwargs)
        base_line['my_commissions'] = self.my_commission or 0.0
        return base_line
