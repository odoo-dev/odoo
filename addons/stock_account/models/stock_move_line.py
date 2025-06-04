from odoo import api, models


class StockMoveLine(models.Model):
    _inherit = 'stock.move.line'

    @api.model
    def _should_exclude_for_valuation(self):
        """
        Determines if this move line should be excluded from valuation based on its ownership.
        :return: True if the move line's owner is different from the company's partner (indicating
                it should be excluded from valuation), False otherwise.
        """
        self.ensure_one()
        return self.owner_id and self.owner_id != self.company_id.partner_id
