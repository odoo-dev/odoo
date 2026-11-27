# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import UTC
from zoneinfo import ZoneInfo

from odoo import models


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    def _prepare_invoice_line(self, **optional_values):
        # EXTENDS 'sale'
        res = super()._prepare_invoice_line(**optional_values)
        if res.get('display_type') != 'product' or self.company_id.account_fiscal_country_id.code != 'KR':
            return res
        outgoing_moves, _incoming_moves = self._get_outgoing_incoming_moves()
        dates = outgoing_moves.filtered(lambda move: move.state == 'done').mapped('date')
        if dates:
            res['l10n_kr_edi_supply_date'] = max(dates).replace(tzinfo=UTC).astimezone(ZoneInfo('Asia/Seoul')).date()
        return res
