from odoo import models



class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

   
    def button_approve(self, force=False):
        self = self.with_context(no_lines=True)
        return super(PurchaseOrder, self).button_approve(force=force)


class PurchaseOrderLine(models.Model):
    _inherit = 'purchase.order.line'

    def _create_stock_moves(self, picking):
        moves = super()._create_stock_moves(picking)
        if picking._context.get('no_lines'):
            moves = moves.with_context(no_lines=True)
        return moves
