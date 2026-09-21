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

    def _get_countable_rfq_groups(self, groups):
        groups = super()._get_countable_rfq_groups(groups)
        qty_by_order = {}
        prepared_groups = []
        for group in groups:
            order, product, *_, qty = group
            purchase_group = order.purchase_group_id
            key = (purchase_group.id, product.id) if purchase_group else None
            prepared_groups.append((key, order.id, group))
            if key is not None:
                order_qty = qty_by_order.setdefault(key, {})
                order_qty[order.id] = order_qty.get(order.id, 0.0) + qty
        countable_orders = {}
        countable_groups = []
        for key, order_id, group in prepared_groups:
            if key is not None:
                if key not in countable_orders:
                    order_qty = qty_by_order[key]
                    countable_orders[key] = max(order_qty, key=order_qty.get)
                if order_id != countable_orders[key]:
                    continue
            countable_groups.append(group)
        return countable_groups
