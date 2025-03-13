from odoo import fields, models


class StockPickingType(models.Model):
    _inherit = 'stock.picking.type'

    no_sml = fields.Boolean('No Stock Move Line', default=False)


class StockMove(models.Model):
    _inherit = 'stock.move'

    def _should_bypass_reservation(self, forced_location=False):
        if self.picking_type_id.no_sml:
            return False

        return super()._should_bypass_reservation(forced_location=forced_location)

    def action_show_details(self):
        action = super().action_show_details()
        if self.picking_type_id.no_sml and self.product_id.tracking == 'serial':
            self.next_serial = self.env['stock.lot']._get_next_serial(self.company_id, self.product_id)
        return action

    def _action_assign(self, force_qty=False):
        for move in self:
            if move.picking_type_id.no_sml and move.product_id.tracking == 'serial':
                move.next_serial_count = move.product_uom_qty
        action = super()._action_assign(force_qty=False)
        return action
