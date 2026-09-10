from odoo import models


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    def _eligible_for_stock_account(self):
        self.ensure_one()
        dropshipped_moves = self._get_stock_moves().filtered(lambda m: m._is_dropshipped())
        return super()._eligible_for_stock_account() or (
            dropshipped_moves
            and self.env.company.anglo_saxon_accounting
            and all(m._is_resupply_dropship() for m in dropshipped_moves)
        )
