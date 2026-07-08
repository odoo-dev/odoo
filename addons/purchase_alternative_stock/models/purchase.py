# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    on_time_rate_perc = fields.Float(string="OTD", compute="_compute_on_time_rate_perc")

    @api.depends('on_time_rate')
    def _compute_on_time_rate_perc(self):
        for po in self:
            if po.on_time_rate >= 0:
                po.on_time_rate_perc = po.on_time_rate / 100
            else:
                po.on_time_rate_perc = -1


class PurchaseOrderLine(models.Model):
    _inherit = 'purchase.order.line'

    on_time_rate_perc = fields.Float(string="OTD", related="order_id.on_time_rate_perc")

    def _get_countable_rfq_lines(self):
        countable_lines = super()._get_countable_rfq_lines()
        for (purchase_group, _), group_lines in countable_lines.grouped(
            lambda line: (line.order_id.purchase_group_id, line.product_id)
        ).items():
            if not purchase_group:
                continue
            qty_by_order = {}
            for line in group_lines:
                qty_by_order[line.order_id] = qty_by_order.get(line.order_id, 0) + line.product_uom_qty
            countable_order = max(qty_by_order, key=qty_by_order.get)
            countable_lines -= group_lines.filtered(lambda line: line.order_id != countable_order)
        return countable_lines
