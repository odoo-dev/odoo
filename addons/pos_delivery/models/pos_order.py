from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    pos_delivery_type = fields.Selection([
        ('ship', 'Ship Later'),
        ('pickup', 'Pick Up Later'),
    ], string='Delivery Type', help='How the customer wants to receive the order.')

    pickup_date = fields.Date('Pick Up Date')

    def _create_order_picking(self):
        self.ensure_one()
        if self.pos_delivery_type == 'pickup':
            if self.pickup_date and not self.shipping_date:
                self.shipping_date = self.pickup_date
            self.sudo().lines._launch_stock_rule_from_pos_order_lines()
        else:
            super()._create_order_picking()


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    def _launch_stock_rule_from_pos_order_lines(self):
        # Ensure a valid customer location exists for orders without a partner
        for line in self:
            if not line.order_id.partner_id.property_stock_customer:
                line.order_id.partner_id = self.env['res.partner'].browse(self.env.ref('base.public_partner').id)
        return super()._launch_stock_rule_from_pos_order_lines()
