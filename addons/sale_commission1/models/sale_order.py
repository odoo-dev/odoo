from odoo import fields, models, api


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    is_commission = fields.Boolean()

    @api.onchange('is_commission')
    def _onchange_commission_zero(self):
        for record in self:
            if not record.is_commission:
                for line in record.order_line:
                    line.my_commission = 0
